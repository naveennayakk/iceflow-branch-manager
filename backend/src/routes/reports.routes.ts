import { Router } from 'express';
import { authenticate, requireRole, assertBranchAccess } from '../middleware/auth';
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import { startOfDay, endOfDay } from '../utils/ids';

const router = Router();
router.use(authenticate);

/** Daily income rows + expenses for Payments screen */
router.get('/daily-income', async (req, res, next) => {
  try {
    const branchId =
      req.user!.role === 'SUB_ADMIN' ? req.user!.branchId! : (req.query.branchId as string | undefined);
    if (branchId) assertBranchAccess(req, branchId);

    const days = Math.min(Number(req.query.days) || 30, 90);
    const from = startOfDay(new Date(Date.now() - (days - 1) * 86400000));
    const to = endOfDay();

    const sessions = await prisma.employeeSession.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        sessionDate: { gte: from, lte: to },
        status: 'finalized',
      },
    });

    const byDate: Record<
      string,
      { date: string; phonePe: number; cash: number; other: number; total: number; bills: number }
    > = {};
    for (const s of sessions) {
      const key = startOfDay(s.sessionDate).toISOString().slice(0, 10);
      if (!byDate[key]) {
        byDate[key] = { date: key, phonePe: 0, cash: 0, other: 0, total: 0, bills: 0 };
      }
      byDate[key].phonePe += s.phonePePaid;
      byDate[key].cash += s.cashPaid;
      byDate[key].other += s.otherPaid;
      byDate[key].bills += s.totalBill;
      byDate[key].total += s.phonePePaid + s.cashPaid + s.otherPaid;
    }

    const expenses = await prisma.expense.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        expenseDate: { gte: from, lte: to },
        deletedAt: null,
        status: { in: ['approved', 'pending'] },
      },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { expenseDate: 'desc' },
    });
    const approvedExpenseTotal = expenses
      .filter((e) => e.status === 'approved')
      .reduce((s, e) => s + e.amount, 0);

    const daily = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
    res.json({
      success: true,
      data: {
        daily,
        expenses,
        totals: {
          phonePe: daily.reduce((s, d) => s + d.phonePe, 0),
          cash: daily.reduce((s, d) => s + d.cash, 0),
          expenses: approvedExpenseTotal,
          income: daily.reduce((s, d) => s + d.total, 0),
          grandTotal: daily.reduce((s, d) => s + d.bills, 0),
        },
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    const branchId =
      req.user!.role === 'SUB_ADMIN' ? req.user!.branchId! : (req.query.branchId as string | undefined);
    if (branchId) assertBranchAccess(req, branchId);

    const from = req.query.from ? new Date(String(req.query.from)) : startOfDay();
    const to = req.query.to ? new Date(String(req.query.to)) : endOfDay();

    const sessions = await prisma.employeeSession.findMany({
      where: {
        ...(branchId ? { branchId } : {}),
        sessionDate: { gte: from, lte: to },
        status: 'finalized',
      },
      include: { employee: true, branch: true },
    });

    const cash = sessions.reduce((s, x) => s + x.cashPaid, 0);
    const phonePe = sessions.reduce((s, x) => s + x.phonePePaid, 0);
    const other = sessions.reduce((s, x) => s + x.otherPaid, 0);
    const bills = sessions.reduce((s, x) => s + x.totalBill, 0);
    const cashToCollect = Math.max(0, bills - phonePe);

    res.json({
      success: true,
      data: {
        summary: {
          grandTotal: bills,
          phonePe,
          cashToCollect,
          cash,
          other,
          grossCollection: cash + phonePe + other,
          bills,
        },
        sessions,
      },
    });
  } catch (e) {
    next(e);
  }
});

/** Main: today + period payments broken down by branch */
router.get('/payments-by-branch', requireRole('MAIN_ADMIN'), async (req, res, next) => {
  try {
    const from = req.query.from ? startOfDay(new Date(String(req.query.from))) : startOfDay();
    const to = req.query.to ? endOfDay(new Date(String(req.query.to))) : endOfDay();
    const branches = await prisma.branch.findMany({
      where: { isMain: false, deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
    });

    const rows = await Promise.all(
      branches.map(async (b) => {
        const sessions = await prisma.employeeSession.findMany({
          where: {
            branchId: b.id,
            sessionDate: { gte: from, lte: to },
            status: { in: ['finalized', 'stock_in_draft', 'stock_out_saved'] },
          },
          include: { employee: { select: { fullName: true, employeeCode: true } } },
        });
        const grandTotal = sessions.reduce((s, x) => s + x.totalBill, 0);
        const phonePe = sessions.reduce((s, x) => s + x.phonePePaid, 0);
        const cash = sessions.reduce((s, x) => s + x.cashPaid, 0);
        const cashToCollect = Math.max(0, grandTotal - phonePe);
        return {
          branch: { id: b.id, name: b.name, code: b.code },
          grandTotal,
          phonePe,
          cashToCollect,
          cashCollected: cash,
          sessionCount: sessions.length,
          sessions,
        };
      })
    );

    const totals = rows.reduce(
      (acc, r) => ({
        grandTotal: acc.grandTotal + r.grandTotal,
        phonePe: acc.phonePe + r.phonePe,
        cashToCollect: acc.cashToCollect + r.cashToCollect,
        cashCollected: acc.cashCollected + r.cashCollected,
      }),
      { grandTotal: 0, phonePe: 0, cashToCollect: 0, cashCollected: 0 }
    );

    res.json({ success: true, data: { from, to, branches: rows, totals } });
  } catch (e) {
    next(e);
  }
});

router.get('/profit', async (req, res, next) => {
  try {
    const branchId =
      req.user!.role === 'SUB_ADMIN' ? req.user!.branchId! : (req.query.branchId as string | undefined);
    if (!branchId && req.user!.role === 'SUB_ADMIN') throw new AppError('Branch required');
    if (branchId) assertBranchAccess(req, branchId);

    const from = req.query.from ? new Date(String(req.query.from)) : startOfDay(new Date(Date.now() - 30 * 86400000));
    const to = req.query.to ? new Date(String(req.query.to)) : endOfDay();

    const branchFilter = branchId ? { branchId } : {};

    const sessions = await prisma.employeeSession.findMany({
      where: { ...branchFilter, sessionDate: { gte: from, lte: to }, status: 'finalized' },
      include: { lines: true },
    });

    const grossCollection = sessions.reduce(
      (s, x) => s + x.cashPaid + x.phonePePaid + x.otherPaid,
      0
    );

    let stockCost = 0;
    for (const ses of sessions) {
      for (const line of ses.lines) {
        stockCost += line.soldQty * line.costRate;
      }
    }

    const expenses = await prisma.expense.findMany({
      where: {
        ...branchFilter,
        expenseDate: { gte: from, lte: to },
        deletedAt: null,
        status: 'approved',
      },
    });
    const expenseTotal = expenses.reduce((s, x) => s + x.amount, 0);

    const writeOffs = await prisma.stockMovement.findMany({
      where: {
        ...branchFilter,
        movementType: { in: ['write_off', 'damaged'] },
        createdAt: { gte: from, lte: to },
        approvalStatus: 'approved',
        deletedAt: null,
      },
    });
    const lossTotal = writeOffs.reduce((s, x) => s + x.quantity * (x.costRate || 0), 0);

    const netProfit = grossCollection - stockCost - expenseTotal - lossTotal;

    // Hide from default dashboard — only here; sub can see own
    res.json({
      success: true,
      data: {
        from,
        to,
        grossCollection,
        stockCost,
        expenses: expenseTotal,
        approvedLosses: lossTotal,
        netProfit,
        expenseBreakdown: expenses,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/branch-summary', requireRole('MAIN_ADMIN'), async (req, res, next) => {
  try {
    const branches = await prisma.branch.findMany({ where: { isMain: false, deletedAt: null } });
    const from = startOfDay();
    const to = endOfDay();
    const data = await Promise.all(
      branches.map(async (b) => {
        const sessions = await prisma.employeeSession.findMany({
          where: { branchId: b.id, sessionDate: { gte: from, lte: to }, status: 'finalized' },
          include: { lines: true },
        });
        const gross = sessions.reduce((s, x) => s + x.cashPaid + x.phonePePaid + x.otherPaid, 0);
        let cost = 0;
        for (const ses of sessions) for (const l of ses.lines) cost += l.soldQty * l.costRate;
        return { branch: b, gross, stockCost: cost, sessions: sessions.length };
      })
    );
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

export default router;
