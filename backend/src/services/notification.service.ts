import { prisma } from '../config/db';

interface NotifyInput {
  userId?: string;
  branchId?: string;
  targetRole?: string;
  title: string;
  body: string;
  type: string;
  severity?: string;
  linkUrl?: string;
  meta?: unknown;
}

export async function notify(input: NotifyInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId ?? null,
      branchId: input.branchId ?? null,
      targetRole: input.targetRole ?? null,
      title: input.title,
      body: input.body,
      type: input.type,
      severity: input.severity ?? 'info',
      linkUrl: input.linkUrl ?? null,
      metaJson: input.meta != null ? JSON.stringify(input.meta) : null,
    },
  });
}

export async function notifyMain(title: string, body: string, type: string, meta?: unknown) {
  return notify({
    targetRole: 'MAIN_ADMIN',
    title,
    body,
    type,
    severity: type === 'fraud' ? 'critical' : 'warning',
    meta,
  });
}

export async function listNotifications(userId: string, role: string, branchId: string | null) {
  return prisma.notification.findMany({
    where: {
      OR: [
        { userId },
        { targetRole: role },
        { targetRole: 'ALL' },
        ...(branchId ? [{ branchId }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function markRead(id: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id, OR: [{ userId }, { userId: null }] },
    data: { isRead: true },
  });
}
