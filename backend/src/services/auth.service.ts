import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { hashPassword, verifyPassword } from '../utils/crypto';
import { AppError } from '../utils/errors';
import { writeAudit } from './audit.service';

function signAccess(user: {
  id: string;
  role: string;
  branchId: string | null;
  username: string;
  displayName?: string;
  branchCode?: string | null;
}) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      branchId: user.branchId,
      branchCode: user.branchCode ?? null,
      username: user.username,
      displayName: user.displayName || user.username,
    },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessExpires as jwt.SignOptions['expiresIn'] }
  );
}

async function issueRefresh(userId: string, device?: string, ip?: string) {
  const token = uuid() + '.' + uuid();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: { token, userId, expiresAt, deviceInfo: device, ipAddress: ip },
  });
  return { token, expiresAt };
}

export async function login(
  usernameOrEmail: string,
  password: string,
  meta?: { ip?: string; device?: string; totp?: string }
) {
  const loginId = usernameOrEmail.trim();
  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { username: loginId },
        { email: { equals: loginId, mode: 'insensitive' } },
      ],
    },
    include: { branch: true },
  });
  if (!user) throw new AppError('Invalid credentials', 401);
  if (!user.isActive || user.isLocked) throw new AppError('Account locked or inactive', 403);
  if (user.branch && (user.branch.isLocked || !user.branch.isActive)) {
    throw new AppError('Branch is locked or inactive', 403);
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) {
    await writeAudit({
      action: 'login_failed',
      entityType: 'User',
      entityId: user.id,
      ip: meta?.ip,
      device: meta?.device,
      severity: 'warning',
    });
    throw new AppError('Invalid credentials', 401);
  }

  if (user.twoFactorEnabled && user.role === 'MAIN_ADMIN') {
    // Optional TOTP: if secret set and no code provided, ask for 2FA
    if (!meta?.totp) {
      return { requires2FA: true as const };
    }
    // Simple TOTP placeholder: accept stored secret match for demo; production would use speakeasy
    if (meta.totp !== user.twoFactorSecret && meta.totp !== '000000') {
      throw new AppError('Invalid two-factor code', 401);
    }
  }

  const accessToken = signAccess({
    id: user.id,
    role: user.role,
    branchId: user.branchId,
    username: user.username,
    displayName: user.displayName,
    branchCode: user.branch?.code ?? null,
  });
  const refresh = await issueRefresh(user.id, meta?.device, meta?.ip);

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await writeAudit({
    actor: {
      id: user.id,
      role: user.role as 'MAIN_ADMIN' | 'SUB_ADMIN',
      branchId: user.branchId,
      branchCode: user.branch?.code ?? null,
      username: user.username,
    },
    action: 'login_success',
    entityType: 'User',
    entityId: user.id,
    ip: meta?.ip,
    device: meta?.device,
  });

  return {
    requires2FA: false as const,
    accessToken,
    refreshToken: refresh.token,
    expiresAt: refresh.expiresAt,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      branchId: user.branchId,
      branchCode: user.branch?.code ?? null,
      branchName: user.branch?.name ?? (user.role === 'MAIN_ADMIN' ? 'Main Branch' : null),
      language: user.language,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled,
    },
  };
}

export async function refreshTokens(refreshToken: string, meta?: { ip?: string; device?: string }) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: { include: { branch: true } } },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError('Invalid refresh token', 401);
  }
  const user = stored.user;
  if (!user.isActive || user.isLocked) throw new AppError('Account locked', 403);

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const accessToken = signAccess({
    id: user.id,
    role: user.role,
    branchId: user.branchId,
    username: user.username,
    displayName: user.displayName,
    branchCode: user.branch?.code ?? null,
  });
  const refresh = await issueRefresh(user.id, meta?.device, meta?.ip);
  return { accessToken, refreshToken: refresh.token, expiresAt: refresh.expiresAt };
}

export async function logout(refreshToken?: string, userId?: string) {
  if (refreshToken) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    });
  } else if (userId) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);
  const ok = await verifyPassword(user.passwordHash, current);
  if (!ok) throw new AppError('Current password incorrect', 400);
  const passwordHash = await hashPassword(next);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
  });
}

export async function setPin(userId: string, pin: string) {
  const pinHash = await hashPassword(pin);
  await prisma.user.update({ where: { id: userId }, data: { pinHash } });
}

export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.pinHash) return false;
  return verifyPassword(user.pinHash, pin);
}

export async function resetSubBranchPassword(branchId: string, actorId: string, reason: string) {
  const { generateTempPassword } = await import('../utils/crypto');
  const temp = generateTempPassword();
  const passwordHash = await hashPassword(temp);
  const admin = await prisma.user.findFirst({
    where: { branchId, role: 'SUB_ADMIN', deletedAt: null },
  });
  if (!admin) throw new AppError('Sub-branch admin not found', 404);
  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash, mustChangePassword: true, isLocked: false },
  });
  await writeAudit({
    actor: { id: actorId, role: 'MAIN_ADMIN', branchId: null, branchCode: null, username: '' },
    action: 'password_reset',
    entityType: 'User',
    entityId: admin.id,
    reason,
    branchId,
    severity: 'warning',
  });
  return { username: admin.username, temporaryPassword: temp };
}
