import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, assertBranchAccess } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { prisma } from '../config/db';
import { listNotifications, markRead, notify } from '../services/notification.service';
import { listAuditLogs } from '../services/audit.service';
import { listFraudAlerts, resolveFraudAlert } from '../services/fraud.service';
import { createBackup, listBackups, restoreBackup, exportJsonSnapshot } from '../services/backup.service';
import { parseVoiceCommand, resolveCommand } from '../ai/ashok.service';
import { ashokLlmChat, ollamaAvailable } from '../ai/ollama.service';
import { AppError, assertFound } from '../utils/errors';
import { writeAudit } from '../services/audit.service';
import { expenseUpload } from '../middleware/upload';

const router = Router();

// Expenses — branch-wise; sub uploads receipt; main approves
router.get('/expenses', authenticate, async (req, res, next) => {
  try {
    const branchId =
      req.user!.role === 'SUB_ADMIN' ? req.user!.branchId! : (req.query.branchId as string | undefined);
    if (branchId) assertBranchAccess(req, branchId);
    const status = req.query.status as string | undefined;
    const data = await prisma.expense.findMany({
      where: {
        deletedAt: null,
        ...(branchId ? { branchId } : {}),
        ...(status ? { status } : {}),
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: { expenseDate: 'desc' },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/expenses',
  authenticate,
  expenseUpload.single('receipt'),
  async (req, res, next) => {
    try {
      const category = String(req.body.category || '');
      const amount = Number(req.body.amount);
      const description = String(req.body.description || '');
      const expenseDate = String(req.body.expenseDate || '');
      const bodyBranchId = req.body.branchId as string | undefined;

      const allowed = ['maintenance', 'miscellaneous', 'utilities', 'transport', 'staff', 'other'];
      if (!allowed.includes(category)) throw new AppError('Invalid category');
      if (!amount || amount <= 0) throw new AppError('Amount required');
      if (description.length < 2) throw new AppError('Description required');
      if (!expenseDate) throw new AppError('expenseDate required');

      const branchId = req.user!.role === 'SUB_ADMIN' ? req.user!.branchId! : bodyBranchId;
      if (!branchId) throw new AppError('branchId required');
      assertBranchAccess(req, branchId);

      const file = req.file;
      const data = await prisma.expense.create({
        data: {
          branchId,
          category,
          amount,
          description,
          expenseDate: new Date(expenseDate),
          createdById: req.user!.id,
          status: 'pending',
          receiptUrl: file ? file.filename : null,
          receiptName: file ? file.originalname : null,
        },
        include: { branch: { select: { id: true, name: true, code: true } } },
      });
      await writeAudit({
        actor: req.user!,
        branchId,
        action: 'expense_create',
        entityType: 'Expense',
        entityId: data.id,
        after: data,
      });
      await notify({
        title: 'Expense pending approval',
        body: `${data.branch?.name || 'Branch'}: ₹${amount} — ${description}`,
        type: 'expense',
        targetRole: 'MAIN_ADMIN',
        branchId,
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/expenses/:id/review',
  authenticate,
  requireRole('MAIN_ADMIN'),
  validateBody(
    z.object({
      status: z.enum(['approved', 'rejected']),
      reviewNote: z.string().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const before = assertFound(await prisma.expense.findUnique({ where: { id: req.params.id } }));
      if (before.status !== 'pending') throw new AppError('Expense already reviewed');
      const data = await prisma.expense.update({
        where: { id: req.params.id },
        data: {
          status: req.body.status,
          reviewNote: req.body.reviewNote || null,
          reviewedById: req.user!.id,
          reviewedAt: new Date(),
        },
        include: { branch: { select: { id: true, name: true, code: true } } },
      });
      await writeAudit({
        actor: req.user!,
        branchId: data.branchId,
        action: `expense_${req.body.status}`,
        entityType: 'Expense',
        entityId: data.id,
        before,
        after: data,
        reason: req.body.reviewNote,
      });
      await notify({
        title: `Expense ${req.body.status}`,
        body: `₹${data.amount} — ${data.description}`,
        type: 'expense',
        targetRole: 'SUB_ADMIN',
        branchId: data.branchId,
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

// Events
router.get('/events', authenticate, async (req, res, next) => {
  try {
    const branchId =
      req.user!.role === 'SUB_ADMIN' ? req.user!.branchId! : (req.query.branchId as string | undefined);
    const data = await prisma.eventOrder.findMany({
      where: { ...(branchId ? { branchId } : {}), deletedAt: null },
      include: { lines: { include: { item: true } }, branch: true },
      orderBy: { eventDate: 'asc' },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/events',
  authenticate,
  validateBody(
    z.object({
      eventName: z.string().min(1),
      customerName: z.string().optional(),
      customerPhone: z.string().min(10),
      customerPhone2: z.string().optional(),
      eventDate: z.string(),
      advancePaid: z.number().min(0).optional(),
      cashFixed: z.number().min(0).optional(),
      notes: z.string().optional(),
      branchId: z.string().optional(),
      lines: z
        .array(
          z.object({
            itemId: z.string(),
            quantity: z.number().positive(),
            rate: z.number().min(0),
          })
        )
        .optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const branchId = req.user!.role === 'SUB_ADMIN' ? req.user!.branchId! : req.body.branchId;
      if (!branchId) throw new AppError('branchId required');
      assertBranchAccess(req, branchId);
      const lines = (req.body.lines || []).map(
        (l: { itemId: string; quantity: number; rate: number }) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          rate: l.rate,
          amount: l.quantity * l.rate,
        })
      );
      const linesTotal = lines.reduce((s: number, l: { amount: number }) => s + l.amount, 0);
      const cashFixed = req.body.cashFixed ?? 0;
      const totalAmount = cashFixed > 0 ? cashFixed : linesTotal;
      const data = await prisma.eventOrder.create({
        data: {
          branchId,
          eventName: req.body.eventName,
          customerName: req.body.customerName,
          customerPhone: req.body.customerPhone,
          customerPhone2: req.body.customerPhone2 || null,
          eventDate: new Date(req.body.eventDate),
          advancePaid: req.body.advancePaid ?? 0,
          cashFixed,
          notes: req.body.notes,
          totalAmount,
          createdById: req.user!.id,
          lines: { create: lines },
        },
        include: { lines: { include: { item: true } } },
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

// Holidays
router.get('/holidays', authenticate, async (req, res, next) => {
  try {
    const data = await prisma.holiday.findMany({ orderBy: { date: 'asc' } });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/holidays',
  authenticate,
  requireRole('MAIN_ADMIN'),
  validateBody(
    z.object({
      name: z.string(),
      date: z.string(),
      isNational: z.boolean().optional(),
      branchId: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const data = await prisma.holiday.create({
        data: {
          name: req.body.name,
          date: new Date(req.body.date),
          isNational: req.body.isNational ?? false,
          branchId: req.body.branchId,
          notes: req.body.notes,
        },
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

// Notifications
router.get('/notifications', authenticate, async (req, res, next) => {
  try {
    const data = await listNotifications(req.user!.id, req.user!.role, req.user!.branchId);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.post('/notifications/:id/read', authenticate, async (req, res, next) => {
  try {
    await markRead(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/notifications/broadcast',
  authenticate,
  requireRole('MAIN_ADMIN'),
  validateBody(z.object({ title: z.string(), body: z.string(), branchId: z.string().optional() })),
  async (req, res, next) => {
    try {
      const data = await notify({
        title: req.body.title,
        body: req.body.body,
        type: 'system',
        targetRole: req.body.branchId ? 'SUB_ADMIN' : 'ALL',
        branchId: req.body.branchId,
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

// Audit
router.get('/audit', authenticate, requireRole('MAIN_ADMIN'), async (req, res, next) => {
  try {
    const data = await listAuditLogs({
      branchId: req.query.branchId as string | undefined,
      entityType: req.query.entityType as string | undefined,
      limit: 200,
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// Fraud
router.get('/fraud', authenticate, requireRole('MAIN_ADMIN'), async (req, res, next) => {
  try {
    const data = await listFraudAlerts(req.query.status as string | undefined);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/fraud/:id/resolve',
  authenticate,
  requireRole('MAIN_ADMIN'),
  validateBody(z.object({ status: z.enum(['resolved', 'dismissed', 'investigating']) })),
  async (req, res, next) => {
    try {
      const data = await resolveFraudAlert(req.params.id, req.user!.id, req.body.status);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

// Backup
router.get('/backups', authenticate, requireRole('MAIN_ADMIN'), async (_req, res, next) => {
  try {
    res.json({ success: true, data: await listBackups() });
  } catch (e) {
    next(e);
  }
});

router.post('/backups', authenticate, requireRole('MAIN_ADMIN'), async (req, res, next) => {
  try {
    const data = await createBackup(req.user!.id, req.body?.notes);
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/backups/:id/restore',
  authenticate,
  requireRole('MAIN_ADMIN'),
  validateBody(z.object({ reason: z.string().min(3), confirm: z.literal(true) })),
  async (req, res, next) => {
    try {
      await writeAudit({
        actor: req.user!,
        action: 'restore_backup',
        entityType: 'BackupRecord',
        entityId: req.params.id,
        reason: req.body.reason,
        severity: 'critical',
      });
      const data = await restoreBackup(req.params.id, req.user!.id);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

router.get('/export', authenticate, requireRole('MAIN_ADMIN'), async (_req, res, next) => {
  try {
    const data = await exportJsonSnapshot();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// Settings
router.get('/settings', authenticate, async (_req, res, next) => {
  try {
    const data = await prisma.appSetting.findMany();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

router.put(
  '/settings/:key',
  authenticate,
  requireRole('MAIN_ADMIN'),
  validateBody(z.object({ value: z.string() })),
  async (req, res, next) => {
    try {
      const data = await prisma.appSetting.upsert({
        where: { key: req.params.key },
        create: { key: req.params.key, value: req.body.value, updatedBy: req.user!.id },
        update: { value: req.body.value, updatedBy: req.user!.id },
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

// Ashok AI
router.post(
  '/ashok/parse',
  authenticate,
  validateBody(z.object({ transcript: z.string(), language: z.string().optional() })),
  async (req, res, next) => {
    try {
      const parsed = parseVoiceCommand(req.body.transcript);
      const resolved = await resolveCommand(parsed, req.user!);
      res.json({ success: true, data: resolved });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/ashok/chat',
  authenticate,
  validateBody(z.object({ message: z.string(), language: z.string().optional() })),
  async (req, res, next) => {
    try {
      const data = await ashokLlmChat(req.body.message, req.user!, req.body.language || 'en');
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

router.get('/ashok/status', authenticate, async (_req, res, next) => {
  try {
    const llm = await ollamaAvailable();
    res.json({
      success: true,
      data: {
        llm,
        provider: llm ? 'ollama' : 'database',
        model: process.env.OLLAMA_MODEL || 'llama3.2',
        mode: 'live-db',
      },
    });
  } catch (e) {
    next(e);
  }
});

// Sync queue
router.post(
  '/sync/push',
  authenticate,
  validateBody(
    z.object({
      clientId: z.string(),
      events: z.array(
        z.object({
          entityType: z.string(),
          entityId: z.string(),
          operation: z.enum(['create', 'update', 'delete']),
          payload: z.unknown(),
        })
      ),
    })
  ),
  async (req, res, next) => {
    try {
      const created = [];
      for (const ev of req.body.events) {
        const row = await prisma.syncEvent.create({
          data: {
            clientId: req.body.clientId,
            userId: req.user!.id,
            branchId: req.user!.branchId,
            entityType: ev.entityType,
            entityId: ev.entityId,
            operation: ev.operation,
            payloadJson: JSON.stringify(ev.payload),
            status: 'synced',
            syncedAt: new Date(),
          },
        });
        created.push(row);
      }
      res.json({ success: true, data: created });
    } catch (e) {
      next(e);
    }
  }
);

router.get('/sync/pull', authenticate, async (req, res, next) => {
  try {
    const since = req.query.since ? new Date(String(req.query.since)) : new Date(0);
    const branchId = req.user!.branchId;
    const data = await prisma.syncEvent.findMany({
      where: {
        createdAt: { gt: since },
        status: 'synced',
        ...(req.user!.role === 'SUB_ADMIN' ? { branchId: branchId! } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    res.json({ success: true, data, serverTime: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
});

export default router;
