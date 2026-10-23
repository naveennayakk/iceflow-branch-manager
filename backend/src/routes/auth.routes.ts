import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { validateBody } from '../middleware/validate';
import { authenticate, requireRole } from '../middleware/auth';
import * as auth from '../services/auth.service';
import { env } from '../config/env';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.loginRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts' },
});

router.post(
  '/login',
  loginLimiter,
  validateBody(
    z.object({
      username: z.string().min(2),
      password: z.string().min(4),
      totp: z.string().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const result = await auth.login(req.body.username, req.body.password, {
        ip: req.ip,
        device: req.headers['user-agent'],
        totp: req.body.totp,
      });
      res.json({ success: true, data: result });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/refresh',
  validateBody(z.object({ refreshToken: z.string() })),
  async (req, res, next) => {
    try {
      const data = await auth.refreshTokens(req.body.refreshToken, {
        ip: req.ip,
        device: req.headers['user-agent'],
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await auth.logout(req.body?.refreshToken, req.user!.id);
    res.json({ success: true, message: 'Logged out' });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/change-password',
  authenticate,
  validateBody(z.object({ currentPassword: z.string(), newPassword: z.string().min(8) })),
  async (req, res, next) => {
    try {
      await auth.changePassword(req.user!.id, req.body.currentPassword, req.body.newPassword);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/pin',
  authenticate,
  validateBody(z.object({ pin: z.string().min(4).max(8) })),
  async (req, res, next) => {
    try {
      await auth.setPin(req.user!.id, req.body.pin);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/verify-pin',
  authenticate,
  validateBody(z.object({ pin: z.string() })),
  async (req, res, next) => {
    try {
      const ok = await auth.verifyPin(req.user!.id, req.body.pin);
      res.json({ success: true, data: { valid: ok } });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/reset-sub-password',
  authenticate,
  requireRole('MAIN_ADMIN'),
  validateBody(z.object({ branchId: z.string(), reason: z.string().min(3) })),
  async (req, res, next) => {
    try {
      const data = await auth.resetSubBranchPassword(
        req.body.branchId,
        req.user!.id,
        req.body.reason
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

router.get('/me', authenticate, async (req, res) => {
  res.json({ success: true, data: req.user });
});

export default router;
