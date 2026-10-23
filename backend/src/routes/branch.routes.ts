import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, assertBranchAccess } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { prisma } from '../config/db';
import { hashPassword, generateTempPassword } from '../utils/crypto';
import { writeAudit } from '../services/audit.service';
import { AppError, assertFound } from '../utils/errors';

const router = Router();
router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    if (req.user!.role === 'SUB_ADMIN') {
      const branch = await prisma.branch.findUnique({ where: { id: req.user!.branchId! } });
      return res.json({ success: true, data: branch ? [branch] : [] });
    }
    const branches = await prisma.branch.findMany({
      where: { deletedAt: null, isMain: false },
      orderBy: { name: 'asc' },
    });
    res.json({ success: true, data: branches });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/',
  requireRole('MAIN_ADMIN'),
  validateBody(
    z.object({
      code: z.string().min(2),
      name: z.string().min(2),
      address: z.string().optional(),
      phone: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      language: z.string().optional(),
      adminUsername: z.string().min(3),
      adminDisplayName: z.string().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const exists = await prisma.branch.findUnique({ where: { code: req.body.code } });
      if (exists) throw new AppError('Branch code already exists');

      const tempPassword = generateTempPassword();
      const passwordHash = await hashPassword(tempPassword);

      const branch = await prisma.$transaction(async (tx) => {
        const b = await tx.branch.create({
          data: {
            code: req.body.code.toUpperCase(),
            name: req.body.name,
            address: req.body.address,
            phone: req.body.phone,
            city: req.body.city,
            state: req.body.state,
            language: req.body.language || 'en',
            isMain: false,
          },
        });
        await tx.user.create({
          data: {
            username: req.body.adminUsername,
            passwordHash,
            role: 'SUB_ADMIN',
            branchId: b.id,
            displayName: req.body.adminDisplayName || `${req.body.name} Admin`,
            mustChangePassword: true,
            language: req.body.language || 'en',
          },
        });
        return b;
      });

      await writeAudit({
        actor: req.user!,
        action: 'branch_create',
        entityType: 'Branch',
        entityId: branch.id,
        after: branch,
        severity: 'warning',
      });

      res.status(201).json({
        success: true,
        data: { branch, temporaryPassword: tempPassword, username: req.body.adminUsername },
      });
    } catch (e) {
      next(e);
    }
  }
);

router.patch(
  '/:id',
  requireRole('MAIN_ADMIN'),
  validateBody(
    z.object({
      name: z.string().optional(),
      address: z.string().optional(),
      phone: z.string().optional(),
      isActive: z.boolean().optional(),
      isLocked: z.boolean().optional(),
      canEditRates: z.boolean().optional(),
      canWriteOff: z.boolean().optional(),
      canAdjustStock: z.boolean().optional(),
      language: z.string().optional(),
      reason: z.string().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const before = assertFound(await prisma.branch.findUnique({ where: { id: req.params.id } }));
      const { reason, ...data } = req.body;
      const branch = await prisma.branch.update({ where: { id: req.params.id }, data });
      await writeAudit({
        actor: req.user!,
        action: 'branch_update',
        entityType: 'Branch',
        entityId: branch.id,
        before,
        after: branch,
        reason,
      });
      res.json({ success: true, data: branch });
    } catch (e) {
      next(e);
    }
  }
);

router.delete('/:id', requireRole('MAIN_ADMIN'), async (req, res, next) => {
  try {
    const reason = (req.body?.reason as string) || req.query.reason;
    if (!reason) throw new AppError('Reason required for delete');
    const before = assertFound(await prisma.branch.findUnique({ where: { id: req.params.id } }));
    await prisma.branch.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await writeAudit({
      actor: req.user!,
      action: 'branch_soft_delete',
      entityType: 'Branch',
      entityId: req.params.id,
      before,
      reason: String(reason),
      severity: 'critical',
    });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    assertBranchAccess(req, req.params.id);
    const branch = assertFound(
      await prisma.branch.findFirst({ where: { id: req.params.id, deletedAt: null } })
    );
    res.json({ success: true, data: branch });
  } catch (e) {
    next(e);
  }
});

export default router;
