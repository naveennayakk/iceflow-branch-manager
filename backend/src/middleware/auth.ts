import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { prisma } from '../config/db';

export interface AuthUser {
  id: string;
  role: 'MAIN_ADMIN' | 'SUB_ADMIN';
  branchId: string | null;
  branchCode: string | null;
  username: string;
  displayName?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      requestMeta?: { ip: string; device: string };
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new AppError('Authentication required', 401));
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, env.jwtAccessSecret) as {
      sub: string;
      role: 'MAIN_ADMIN' | 'SUB_ADMIN';
      branchId: string | null;
      branchCode: string | null;
      username: string;
      displayName?: string;
    };
    req.user = {
      id: payload.sub,
      role: payload.role,
      branchId: payload.branchId,
      branchCode: payload.branchCode,
      username: payload.username,
      displayName: payload.displayName || payload.username,
    };
    req.requestMeta = {
      ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '',
      device: req.headers['user-agent'] || '',
    };
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}

export function requireRole(...roles: Array<'MAIN_ADMIN' | 'SUB_ADMIN'>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('Authentication required', 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
}

/** Sub-admin may only access own branch; Main can access all. */
export function assertBranchAccess(req: Request, branchId: string) {
  if (req.user?.role === 'MAIN_ADMIN') return;
  if (req.user?.branchId !== branchId) {
    throw new AppError('Access denied to this branch', 403);
  }
}

export async function requireActiveUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError('Authentication required', 401));
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || !user.isActive || user.isLocked || user.deletedAt) {
    return next(new AppError('Account locked or inactive', 403));
  }
  if (user.branchId) {
    const branch = await prisma.branch.findUnique({ where: { id: user.branchId } });
    if (!branch || !branch.isActive || branch.isLocked || branch.deletedAt) {
      return next(new AppError('Branch is locked or inactive', 403));
    }
  }
  next();
}
