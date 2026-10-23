import { Router } from 'express';
import { z } from 'zod';
import { authenticate, assertBranchAccess } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { prisma } from '../config/db';
import { nextEmployeeCode } from '../utils/ids';
import { encrypt } from '../utils/crypto';
import { writeAudit } from '../services/audit.service';
import { AppError, assertFound } from '../utils/errors';
import { startOfDay } from '../utils/ids';
import { getActiveRate } from '../services/rate.service';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const branchId =
      req.user!.role === 'SUB_ADMIN' ? req.user!.branchId! : (req.query.branchId as string | undefined);
    const employees = await prisma.employee.findMany({
      where: {
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        ...(req.query.status ? { status: String(req.query.status) } : {}),
      },
      orderBy: { fullName: 'asc' },
    });

    const day = startOfDay();
    const withToday = await Promise.all(
      employees.map(async (e) => {
        const session = await prisma.employeeSession.findUnique({
          where: { employeeId_sessionDate: { employeeId: e.id, sessionDate: day } },
        });
        return {
          ...e,
          todayStockOut: !!session && ['stock_out_saved', 'stock_in_draft', 'finalized'].includes(session.status),
          todayStockIn: !!session && ['stock_in_draft', 'finalized'].includes(session.status),
          todayFinalized: session?.status === 'finalized',
          todaySessionId: session?.id ?? null,
        };
      })
    );

    res.json({ success: true, data: withToday });
  } catch (e) {
    next(e);
  }
});

/** Compact daily board: employees + session lines for a date + branch items */
router.get('/board/today', async (req, res, next) => {
  try {
    const branchId =
      req.user!.role === 'SUB_ADMIN' ? req.user!.branchId! : (req.query.branchId as string | undefined);
    if (!branchId) throw new AppError('branchId required');
    assertBranchAccess(req, branchId);

    const day = req.query.date
      ? startOfDay(new Date(String(req.query.date)))
      : startOfDay();
    const [employees, items, balances] = await Promise.all([
      prisma.employee.findMany({
        where: { branchId, deletedAt: null, status: 'active' },
        orderBy: { fullName: 'asc' },
      }),
      prisma.item.findMany({
        where: { isActive: true, deletedAt: null },
        orderBy: { name: 'asc' },
      }),
      prisma.stockBalance.findMany({ where: { branchId } }),
    ]);

    const balanceMap = Object.fromEntries(balances.map((b) => [b.itemId, b.quantity]));

    const board = await Promise.all(
      employees.map(async (e) => {
        const session = await prisma.employeeSession.findUnique({
          where: { employeeId_sessionDate: { employeeId: e.id, sessionDate: day } },
          include: { lines: { include: { item: true } } },
        });
        const totalBill = session?.totalBill ?? 0;
        const phonePe = session?.phonePePaid ?? 0;
        // Day collection only — borrow/outstanding is separate
        const cashToCollect = Math.max(0, totalBill - phonePe);
        return {
          ...e,
          session,
          cashToCollect,
          isPresent: !!session && ['stock_out_saved', 'stock_in_draft', 'finalized'].includes(session.status),
        };
      })
    );

    const itemsWithRates = await Promise.all(
      items.map(async (i) => ({
        ...i,
        available: balanceMap[i.id] ?? 0,
        subToEmployeeRate: await getActiveRate(i.id, 'SUB_TO_EMPLOYEE', day, branchId),
      }))
    );

    res.json({
      success: true,
      data: {
        date: day.toISOString(),
        employees: board,
        items: itemsWithRates,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/:id/outstanding',
  validateBody(
    z.object({
      amount: z.number().min(0).optional(),
      clear: z.boolean().optional(),
      cashPaid: z.number().min(0).optional(),
      phonePePaid: z.number().min(0).optional(),
      reason: z.string().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const emp = assertFound(
        await prisma.employee.findFirst({ where: { id: req.params.id, deletedAt: null } })
      );
      assertBranchAccess(req, emp.branchId);

      let outstanding = emp.outstanding;
      if (req.body.clear) {
        outstanding = 0;
      } else if (req.body.amount != null) {
        outstanding = req.body.amount;
      } else {
        const paid = (req.body.cashPaid || 0) + (req.body.phonePePaid || 0);
        outstanding = Math.max(0, emp.outstanding - paid);
        if (paid > 0) {
          await prisma.payment.create({
            data: {
              employeeId: emp.id,
              cashAmount: req.body.cashPaid || 0,
              phonePeAmount: req.body.phonePePaid || 0,
              totalAmount: paid,
              notes: req.body.reason || 'Outstanding payment',
              createdById: req.user!.id,
            },
          });
        }
      }

      const updated = await prisma.employee.update({
        where: { id: emp.id },
        data: { outstanding, creditBalance: req.body.clear ? 0 : emp.creditBalance },
      });
      await writeAudit({
        actor: req.user!,
        branchId: emp.branchId,
        action: req.body.clear ? 'outstanding_clear' : 'outstanding_update',
        entityType: 'Employee',
        entityId: emp.id,
        before: { outstanding: emp.outstanding },
        after: { outstanding },
        reason: req.body.reason,
      });
      res.json({ success: true, data: updated });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/',
  validateBody(
    z.object({
      fullName: z.string().min(2),
      mobile: z.string().min(10),
      address: z.string().optional(),
      photoUrl: z.string().optional(),
      aadhaar: z.string().optional(),
      joiningDate: z.string().optional(),
      notes: z.string().optional(),
      branchId: z.string().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const branchId =
        req.user!.role === 'MAIN_ADMIN' ? req.body.branchId : req.user!.branchId;
      if (!branchId) throw new AppError('Branch required');
      assertBranchAccess(req, branchId);

      const branch = assertFound(await prisma.branch.findUnique({ where: { id: branchId } }));
      const employeeCode = await nextEmployeeCode(branch.code);

      const employee = await prisma.employee.create({
        data: {
          employeeCode,
          fullName: req.body.fullName,
          mobile: req.body.mobile,
          address: req.body.address,
          photoUrl: req.body.photoUrl,
          aadhaarEnc: req.body.aadhaar ? encrypt(req.body.aadhaar) : null,
          joiningDate: req.body.joiningDate ? new Date(req.body.joiningDate) : new Date(),
          notes: req.body.notes,
          branchId,
        },
      });

      await writeAudit({
        actor: req.user!,
        branchId,
        action: 'employee_create',
        entityType: 'Employee',
        entityId: employee.id,
        after: { ...employee, aadhaarEnc: undefined },
      });

      res.status(201).json({ success: true, data: employee });
    } catch (e) {
      next(e);
    }
  }
);

router.get('/:id', async (req, res, next) => {
  try {
    const employee = assertFound(
      await prisma.employee.findFirst({
        where: { id: req.params.id, deletedAt: null },
        include: {
          sessions: {
            orderBy: { sessionDate: 'desc' },
            take: 30,
            include: { lines: { include: { item: true } } },
          },
          payments: { orderBy: { paymentDate: 'desc' }, take: 30 },
        },
      })
    );
    assertBranchAccess(req, employee.branchId);
    res.json({ success: true, data: employee });
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const before = assertFound(await prisma.employee.findUnique({ where: { id: req.params.id } }));
    assertBranchAccess(req, before.branchId);
    if (!req.body.reason && req.body.status === 'inactive') {
      throw new AppError('Reason required when deactivating');
    }
    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: {
        fullName: req.body.fullName,
        mobile: req.body.mobile,
        address: req.body.address,
        photoUrl: req.body.photoUrl,
        notes: req.body.notes,
        status: req.body.status,
      },
    });
    await writeAudit({
      actor: req.user!,
      branchId: employee.branchId,
      action: 'employee_update',
      entityType: 'Employee',
      entityId: employee.id,
      before,
      after: employee,
      reason: req.body.reason,
    });
    res.json({ success: true, data: employee });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const reason = req.body?.reason || req.query.reason;
    if (!reason) throw new AppError('Reason required');
    const before = assertFound(await prisma.employee.findUnique({ where: { id: req.params.id } }));
    assertBranchAccess(req, before.branchId);
    await prisma.employee.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), status: 'inactive' },
    });
    await writeAudit({
      actor: req.user!,
      branchId: before.branchId,
      action: 'employee_soft_delete',
      entityType: 'Employee',
      entityId: before.id,
      reason: String(reason),
      severity: 'warning',
    });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
