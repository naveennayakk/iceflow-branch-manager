import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, assertBranchAccess } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { listBalances, listMovements, recordMovement } from '../services/stock.service';
import { createDispatch, updateDispatchStatus } from '../services/dispatch.service';
import { prisma } from '../config/db';
import { nextDocNo } from '../utils/ids';
import { notifyMain } from '../services/notification.service';
import { AppError } from '../utils/errors';
import { writeAudit } from '../services/audit.service';

const router = Router();
router.use(authenticate);

router.get('/balances', async (req, res, next) => {
  try {
    const branchId =
      req.user!.role === 'SUB_ADMIN'
        ? req.user!.branchId!
        : (req.query.branchId as string) || req.user!.branchId;
    if (!branchId) throw new AppError('branchId required');
    assertBranchAccess(req, branchId);
    const data = await listBalances(branchId);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.get('/movements', async (req, res, next) => {
  try {
    const branchId =
      req.user!.role === 'SUB_ADMIN' ? req.user!.branchId! : (req.query.branchId as string | undefined);
    if (branchId) assertBranchAccess(req, branchId);
    const data = await listMovements({
      branchId,
      itemId: req.query.itemId as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : 200,
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/adjust',
  requireRole('MAIN_ADMIN'),
  validateBody(
    z.object({
      branchId: z.string(),
      itemId: z.string(),
      quantity: z.number().positive(),
      direction: z.enum(['in', 'out']),
      reason: z.string().min(3),
    })
  ),
  async (req, res, next) => {
    try {
      const mov = await recordMovement({
        branchId: req.body.branchId,
        itemId: req.body.itemId,
        quantity: req.body.quantity,
        movementType: req.body.direction === 'in' ? 'adjustment_in' : 'adjustment_out',
        actor: req.user!,
        notes: req.body.reason,
        entrySource: 'adjustment',
      });
      res.status(201).json({ success: true, data: mov });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/opening-balance',
  requireRole('MAIN_ADMIN'),
  validateBody(
    z.object({
      branchId: z.string(),
      itemId: z.string(),
      quantity: z.number().positive(),
      reason: z.string().min(3),
    })
  ),
  async (req, res, next) => {
    try {
      const mov = await recordMovement({
        branchId: req.body.branchId,
        itemId: req.body.itemId,
        quantity: req.body.quantity,
        movementType: 'opening_balance',
        actor: req.user!,
        notes: req.body.reason,
      });
      res.status(201).json({ success: true, data: mov });
    } catch (e) {
      next(e);
    }
  }
);

// Requests
router.post(
  '/requests',
  validateBody(
    z.object({
      notes: z.string().optional(),
      branchId: z.string().optional(),
      lines: z.array(z.object({ itemId: z.string(), quantityAsked: z.number().positive() })),
    })
  ),
  async (req, res, next) => {
    try {
      const branchId =
        req.user!.role === 'SUB_ADMIN' ? req.user!.branchId! : req.body.branchId;
      if (!branchId) throw new AppError('branchId required');
      assertBranchAccess(req, branchId);

      const requestNo = await nextDocNo('REQ', 'request');
      const request = await prisma.stockRequest.create({
        data: {
          requestNo,
          branchId,
          notes: req.body.notes,
          createdById: req.user!.id,
          lines: {
            create: req.body.lines.map((l: { itemId: string; quantityAsked: number }) => ({
              itemId: l.itemId,
              quantityAsked: l.quantityAsked,
            })),
          },
        },
        include: { lines: { include: { item: true } } },
      });
      await notifyMain(
        'New stock request',
        `Request ${requestNo} from branch`,
        'stock_request',
        { requestId: request.id }
      );
      res.status(201).json({ success: true, data: request });
    } catch (e) {
      next(e);
    }
  }
);

router.get('/requests', async (req, res, next) => {
  try {
    const branchId =
      req.user!.role === 'SUB_ADMIN'
        ? req.user!.branchId!
        : (req.query.branchId as string | undefined);
    if (branchId) assertBranchAccess(req, branchId);
    const where = {
      deletedAt: null as null,
      ...(branchId ? { branchId } : {}),
      ...(req.query.status ? { status: String(req.query.status) } : {}),
    };
    const rows = await prisma.stockRequest.findMany({
      where,
      include: { lines: { include: { item: true } }, branch: true },
      orderBy: { createdAt: 'desc' },
    });

    const data = await Promise.all(
      rows.map(async (r) => {
        const dispatch = await prisma.stockDispatch.findFirst({
          where: { requestId: r.id, deletedAt: null },
          include: { lines: { include: { item: true } } },
          orderBy: { createdAt: 'desc' },
        });
        const lines = r.lines.map((l) => {
          const pack = l.item.packSize || 1;
          return {
            ...l,
            boxesAsked: pack > 0 ? Math.round((l.quantityAsked / pack) * 100) / 100 : l.quantityAsked,
            boxesApproved:
              l.quantityApproved != null && pack > 0
                ? Math.round((l.quantityApproved / pack) * 100) / 100
                : l.quantityApproved,
          };
        });
        const dispatchLines = dispatch?.lines.map((l) => ({
          ...l,
          amount: l.quantity * l.costRate,
          boxes: l.item.packSize > 0 ? Math.round((l.quantity / l.item.packSize) * 100) / 100 : l.quantity,
        }));
        const dispatchTotal = dispatchLines?.reduce((s, l) => s + l.amount, 0) ?? null;
        return {
          ...r,
          lines,
          dispatch: dispatch
            ? { ...dispatch, lines: dispatchLines, totalAmount: dispatchTotal }
            : null,
        };
      })
    );

    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/requests/:id/review',
  requireRole('MAIN_ADMIN'),
  validateBody(
    z.object({
      status: z.enum(['approved', 'partial', 'rejected']),
      reviewNotes: z.string().optional(),
      lines: z
        .array(z.object({ id: z.string(), quantityApproved: z.number().min(0) }))
        .optional(),
      createDispatch: z.boolean().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const request = await prisma.stockRequest.findUnique({
        where: { id: req.params.id },
        include: { lines: true },
      });
      if (!request) throw new AppError('Not found', 404);

      if (req.body.lines) {
        for (const l of req.body.lines) {
          await prisma.stockRequestLine.update({
            where: { id: l.id },
            data: { quantityApproved: l.quantityApproved },
          });
        }
      }

      await prisma.stockRequest.update({
        where: { id: req.params.id },
        data: {
          status: req.body.status,
          reviewNotes: req.body.reviewNotes,
          reviewedById: req.user!.id,
        },
      });

      let dispatch = null;
      if (req.body.createDispatch && req.body.status !== 'rejected') {
        const lines = await prisma.stockRequestLine.findMany({ where: { requestId: request.id } });
        dispatch = await createDispatch({
          toBranchId: request.branchId,
          requestId: request.id,
          actor: req.user!,
          lines: lines
            .filter((l) => (l.quantityApproved ?? l.quantityAsked) > 0)
            .map((l) => ({
              itemId: l.itemId,
              quantity: l.quantityApproved ?? l.quantityAsked,
            })),
        });
      }

      res.json({ success: true, data: { requestId: request.id, dispatch } });
    } catch (e) {
      next(e);
    }
  }
);

// Dispatches
router.post(
  '/dispatches',
  requireRole('MAIN_ADMIN'),
  validateBody(
    z.object({
      toBranchId: z.string(),
      notes: z.string().optional(),
      lines: z.array(z.object({ itemId: z.string(), quantity: z.number().positive() })),
    })
  ),
  async (req, res, next) => {
    try {
      const data = await createDispatch({ ...req.body, actor: req.user! });
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

router.get('/dispatches', async (req, res, next) => {
  try {
    const where =
      req.user!.role === 'SUB_ADMIN'
        ? { toBranchId: req.user!.branchId!, deletedAt: null }
        : { deletedAt: null };
    const rows = await prisma.stockDispatch.findMany({
      where,
      include: { lines: { include: { item: true } }, toBranch: true, fromBranch: true },
      orderBy: { createdAt: 'desc' },
    });

    // Attach linked stock request (what was asked) + line amounts
    const data = await Promise.all(
      rows.map(async (d) => {
        const request = d.requestId
          ? await prisma.stockRequest.findUnique({
              where: { id: d.requestId },
              include: {
                lines: { include: { item: true } },
                branch: { select: { id: true, name: true, code: true } },
              },
            })
          : null;
        const lines = d.lines.map((l) => ({
          ...l,
          amount: l.quantity * l.costRate,
          boxes:
            l.item.packSize > 0 ? Math.round((l.quantity / l.item.packSize) * 100) / 100 : l.quantity,
        }));
        const totalAmount = lines.reduce((s, l) => s + l.amount, 0);
        const totalPieces = lines.reduce((s, l) => s + l.quantity, 0);
        return { ...d, lines, totalAmount, totalPieces, request };
      })
    );

    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/dispatches/:id/status',
  validateBody(z.object({ status: z.string() })),
  async (req, res, next) => {
    try {
      const data = await updateDispatchStatus(req.params.id, req.body.status, req.user!);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

// Damage
router.post(
  '/damage',
  validateBody(
    z.object({
      itemId: z.string(),
      quantity: z.number().positive(),
      reason: z.string().min(3),
      photoUrl: z.string().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const branchId = req.user!.branchId;
      if (!branchId && req.user!.role === 'SUB_ADMIN') throw new AppError('Branch required');
      const bid = branchId || (req.body.branchId as string);
      if (!bid) throw new AppError('branchId required');
      assertBranchAccess(req, bid);

      const d = await prisma.damageRequest.create({
        data: {
          branchId: bid,
          itemId: req.body.itemId,
          quantity: req.body.quantity,
          reason: req.body.reason,
          photoUrl: req.body.photoUrl,
          createdById: req.user!.id,
          status: 'pending',
        },
      });
      await notifyMain('Damage request', req.body.reason, 'damage', { id: d.id });
      res.status(201).json({ success: true, data: d });
    } catch (e) {
      next(e);
    }
  }
);

router.get('/damage', async (req, res, next) => {
  try {
    const where =
      req.user!.role === 'SUB_ADMIN'
        ? { branchId: req.user!.branchId!, deletedAt: null }
        : { deletedAt: null };
    const data = await prisma.damageRequest.findMany({
      where,
      include: { item: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/damage/:id/review',
  requireRole('MAIN_ADMIN'),
  validateBody(z.object({ status: z.enum(['approved', 'rejected']), reviewNotes: z.string().optional() })),
  async (req, res, next) => {
    try {
      const d = await prisma.damageRequest.findUnique({ where: { id: req.params.id } });
      if (!d) throw new AppError('Not found', 404);
      await prisma.damageRequest.update({
        where: { id: d.id },
        data: {
          status: req.body.status,
          reviewNotes: req.body.reviewNotes,
          reviewedById: req.user!.id,
        },
      });
      if (req.body.status === 'approved') {
        await recordMovement({
          branchId: d.branchId,
          itemId: d.itemId,
          quantity: d.quantity,
          movementType: 'write_off',
          actor: req.user!,
          notes: d.reason,
          referenceType: 'damage',
          referenceId: d.id,
        });
      }
      await writeAudit({
        actor: req.user!,
        action: `damage_${req.body.status}`,
        entityType: 'DamageRequest',
        entityId: d.id,
        reason: req.body.reviewNotes,
      });
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
