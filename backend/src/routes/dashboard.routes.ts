import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { prisma } from '../config/db';
import { startOfDay, endOfDay } from '../utils/ids';
import { listBalances } from '../services/stock.service';

const router = Router();
router.use(authenticate);

router.get('/main', async (req, res, next) => {
  try {
    if (req.user!.role !== 'MAIN_ADMIN') {
      return res.status(403).json({ success: false, error: 'Main admin only' });
    }
    const dayStart = startOfDay();
    const dayEnd = endOfDay();

    const [
      subBranches,
      activeBranches,
      pendingRequests,
      pendingDamage,
      todaySessions,
      outstanding,
      fraudOpen,
      recentAudit,
      events,
      lowStock,
    ] = await Promise.all([
      prisma.branch.count({ where: { isMain: false, deletedAt: null } }),
      prisma.branch.count({ where: { isMain: false, isActive: true, deletedAt: null } }),
      prisma.stockRequest.count({ where: { status: 'pending', deletedAt: null } }),
      prisma.damageRequest.count({ where: { status: 'pending', deletedAt: null } }),
      prisma.employeeSession.findMany({
        where: { sessionDate: { gte: dayStart, lte: dayEnd }, status: 'finalized' },
      }),
      prisma.employee.aggregate({
        where: { deletedAt: null },
        _sum: { outstanding: true },
      }),
      prisma.fraudAlert.count({ where: { status: 'open' } }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { actor: { select: { displayName: true, username: true } } },
      }),
      prisma.eventOrder.findMany({
        where: { eventDate: { gte: dayStart }, status: { in: ['upcoming', 'reserved'] }, deletedAt: null },
        take: 10,
        include: { branch: true },
        orderBy: { eventDate: 'asc' },
      }),
      prisma.stockBalance.findMany({
        include: { item: true, branch: true },
        take: 200,
      }),
    ]);

    const cashToday = todaySessions.reduce((s, x) => s + x.cashPaid, 0);
    const phonePeToday = todaySessions.reduce((s, x) => s + x.phonePePaid, 0);
    const low = lowStock.filter((b) => b.quantity <= (b.item.minStockThreshold || 10));

    const branchPerf = await prisma.branch.findMany({
      where: { isMain: false, deletedAt: null },
      select: { id: true, name: true, code: true },
    });

    const performance = await Promise.all(
      branchPerf.map(async (b) => {
        const sessions = await prisma.employeeSession.findMany({
          where: { branchId: b.id, sessionDate: { gte: dayStart, lte: dayEnd }, status: 'finalized' },
        });
        return {
          ...b,
          cash: sessions.reduce((s, x) => s + x.cashPaid, 0),
          phonePe: sessions.reduce((s, x) => s + x.phonePePaid, 0),
          bills: sessions.reduce((s, x) => s + x.totalBill, 0),
        };
      })
    );

    res.json({
      success: true,
      data: {
        totalSubBranches: subBranches,
        activeSubBranches: activeBranches,
        pendingStockRequests: pendingRequests,
        pendingDamageRequests: pendingDamage,
        todayCash: cashToday,
        todayPhonePe: phonePeToday,
        totalOutstanding: outstanding._sum.outstanding || 0,
        fraudAlerts: fraudOpen,
        lowStock: low,
        upcomingEvents: events,
        recentAudit,
        branchPerformance: performance,
        damagedPending: pendingDamage,
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/sub', async (req, res, next) => {
  try {
    const branchId =
      req.user!.role === 'SUB_ADMIN'
        ? req.user!.branchId
        : (req.query.branchId as string | undefined);
    if (!branchId) return res.status(400).json({ success: false, error: 'No branch' });
    if (req.user!.role === 'MAIN_ADMIN') {
      // Main may view any sub-branch workspace
    } else if (req.user!.branchId !== branchId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    const dayStart = startOfDay();
    const dayEnd = endOfDay();
    const balances = await listBalances(branchId);

    const employees = await prisma.employee.findMany({
      where: { branchId, deletedAt: null, status: 'active' },
      select: { id: true },
    });
    const sessions = await prisma.employeeSession.findMany({
      where: {
        branchId,
        sessionDate: { gte: dayStart, lte: dayEnd },
        status: { in: ['stock_out_saved', 'stock_in_draft', 'finalized'] },
      },
      select: { employeeId: true },
    });
    const presentIds = new Set(sessions.map((s) => s.employeeId));
    const totalEmployees = employees.length;
    const present = employees.filter((e) => presentIds.has(e.id)).length;
    const absent = totalEmployees - present;

    const notifications = await prisma.notification.findMany({
      where: { OR: [{ branchId }, { targetRole: 'SUB_ADMIN' }] },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    res.json({
      success: true,
      data: {
        branch,
        date: new Date().toISOString(),
        stockSummary: balances,
        attendance: { totalEmployees, present, absent },
        notifications,
      },
    });
  } catch (e) {
    next(e);
  }
});

export default router;
