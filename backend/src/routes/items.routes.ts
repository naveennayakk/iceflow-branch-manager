import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { prisma } from '../config/db';
import { setRate, listRateHistory, getActiveRate } from '../services/rate.service';
import { writeAudit } from '../services/audit.service';
import { AppError, assertFound } from '../utils/errors';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const items = await prisma.item.findMany({
      where: { deletedAt: null },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    const withRates = await Promise.all(
      items.map(async (item) => ({
        ...item,
        mainToSubRate: await getActiveRate(item.id, 'MAIN_TO_SUB'),
        subToEmployeeRate: await getActiveRate(item.id, 'SUB_TO_EMPLOYEE'),
      }))
    );
    res.json({ success: true, data: withRates });
  } catch (e) {
    next(e);
  }
});

router.get('/categories', async (_req, res, next) => {
  try {
    const cats = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, data: cats });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/categories',
  requireRole('MAIN_ADMIN'),
  validateBody(z.object({ name: z.string().min(2), sortOrder: z.number().optional() })),
  async (req, res, next) => {
    try {
      const cat = await prisma.category.create({ data: req.body });
      res.status(201).json({ success: true, data: cat });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/',
  requireRole('MAIN_ADMIN'),
  validateBody(
    z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      categoryId: z.string().optional(),
      unit: z.string().optional(),
      packSize: z.number().int().positive().optional(),
      packLabel: z.string().optional(),
      minStockThreshold: z.number().optional(),
      mainToSubRate: z.number().min(0),
      subToEmployeeRate: z.number().min(0),
      reason: z.string().default('Initial rate'),
    })
  ),
  async (req, res, next) => {
    try {
      const item = await prisma.item.create({
        data: {
          code: req.body.code.toUpperCase(),
          name: req.body.name,
          categoryId: req.body.categoryId,
          unit: req.body.unit || 'pieces',
          packSize: req.body.packSize ?? 1,
          packLabel: req.body.packLabel || 'box',
          minStockThreshold: req.body.minStockThreshold ?? 10,
        },
      });
      await setRate({
        itemId: item.id,
        rateType: 'MAIN_TO_SUB',
        amount: req.body.mainToSubRate,
        effectiveFrom: new Date(),
        reason: req.body.reason,
        actor: req.user!,
      });
      await setRate({
        itemId: item.id,
        rateType: 'SUB_TO_EMPLOYEE',
        amount: req.body.subToEmployeeRate,
        effectiveFrom: new Date(),
        reason: req.body.reason,
        actor: req.user!,
      });
      await writeAudit({
        actor: req.user!,
        action: 'item_create',
        entityType: 'Item',
        entityId: item.id,
        after: item,
      });
      res.status(201).json({ success: true, data: item });
    } catch (e) {
      next(e);
    }
  }
);

router.patch('/:id', requireRole('MAIN_ADMIN'), async (req, res, next) => {
  try {
    const before = assertFound(await prisma.item.findUnique({ where: { id: req.params.id } }));
    const item = await prisma.item.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name,
        categoryId: req.body.categoryId,
        unit: req.body.unit,
        packSize: req.body.packSize != null ? Number(req.body.packSize) : undefined,
        packLabel: req.body.packLabel,
        minStockThreshold: req.body.minStockThreshold,
        isActive: req.body.isActive,
        imageUrl: req.body.imageUrl,
      },
    });
    await writeAudit({
      actor: req.user!,
      action: 'item_update',
      entityType: 'Item',
      entityId: item.id,
      before,
      after: item,
      reason: req.body.reason,
    });
    res.json({ success: true, data: item });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/:id/rates',
  requireRole('MAIN_ADMIN'),
  validateBody(
    z.object({
      rateType: z.enum(['MAIN_TO_SUB', 'SUB_TO_EMPLOYEE']),
      amount: z.number().min(0),
      effectiveFrom: z.string().optional(),
      reason: z.string().min(3),
      branchId: z.string().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const rate = await setRate({
        itemId: req.params.id,
        rateType: req.body.rateType,
        amount: req.body.amount,
        effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : new Date(),
        reason: req.body.reason,
        actor: req.user!,
        branchId: req.body.branchId,
      });
      res.status(201).json({ success: true, data: rate });
    } catch (e) {
      next(e);
    }
  }
);

router.get('/:id/rates', async (req, res, next) => {
  try {
    const rates = await listRateHistory(req.params.id);
    res.json({ success: true, data: rates });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/requests',
  requireRole('SUB_ADMIN'),
  validateBody(
    z.object({
      proposedName: z.string().min(2),
      proposedCode: z.string().optional(),
      category: z.string().optional(),
      unit: z.string().optional(),
      notes: z.string().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      if (!req.user!.branchId) throw new AppError('Branch required');
      const r = await prisma.itemRequest.create({
        data: {
          ...req.body,
          branchId: req.user!.branchId,
          createdById: req.user!.id,
        },
      });
      res.status(201).json({ success: true, data: r });
    } catch (e) {
      next(e);
    }
  }
);

export default router;
