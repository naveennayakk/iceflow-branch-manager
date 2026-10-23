import { prisma } from '../config/db';
import { AuthUser } from '../middleware/auth';

interface AuditInput {
  actor?: AuthUser | null;
  branchId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string;
  ip?: string;
  device?: string;
  severity?: string;
}

export async function writeAudit(input: AuditInput) {
  return prisma.auditLog.create({
    data: {
      actorId: input.actor?.id ?? null,
      branchId: input.branchId ?? input.actor?.branchId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeJson: input.before != null ? JSON.stringify(input.before) : null,
      afterJson: input.after != null ? JSON.stringify(input.after) : null,
      reason: input.reason ?? null,
      ipAddress: input.ip ?? null,
      deviceInfo: input.device ?? null,
      severity: input.severity ?? 'info',
    },
  });
}

export async function listAuditLogs(filters: {
  branchId?: string;
  entityType?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  return prisma.auditLog.findMany({
    where: {
      branchId: filters.branchId,
      entityType: filters.entityType,
      actorId: filters.actorId,
      createdAt: {
        gte: filters.from,
        lte: filters.to,
      },
    },
    include: { actor: { select: { id: true, username: true, displayName: true } } },
    orderBy: { createdAt: 'desc' },
    take: filters.limit ?? 100,
  });
}
