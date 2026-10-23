import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import { writeAudit } from './audit.service';
import { AuthUser } from '../middleware/auth';

export async function getActiveRate(
  itemId: string,
  rateType: 'MAIN_TO_SUB' | 'SUB_TO_EMPLOYEE',
  at: Date = new Date(),
  branchId?: string | null
): Promise<number> {
  // Prefer branch-specific override, then global
  const branchRate = branchId
    ? await prisma.rateHistory.findFirst({
        where: {
          itemId,
          rateType,
          branchId,
          effectiveFrom: { lte: at },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
        },
        orderBy: { effectiveFrom: 'desc' },
      })
    : null;

  if (branchRate) return branchRate.amount;

  const global = await prisma.rateHistory.findFirst({
    where: {
      itemId,
      rateType,
      branchId: null,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  return global?.amount ?? 0;
}

export async function setRate(input: {
  itemId: string;
  rateType: 'MAIN_TO_SUB' | 'SUB_TO_EMPLOYEE';
  amount: number;
  effectiveFrom: Date;
  reason: string;
  actor: AuthUser;
  branchId?: string | null;
}) {
  if (input.amount < 0) throw new AppError('Rate cannot be negative');
  if (!input.reason?.trim()) throw new AppError('Reason is required for rate changes');

  const current = await prisma.rateHistory.findFirst({
    where: {
      itemId: input.itemId,
      rateType: input.rateType,
      branchId: input.branchId ?? null,
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: input.effectiveFrom } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (current && !current.effectiveTo) {
    await prisma.rateHistory.update({
      where: { id: current.id },
      data: { effectiveTo: input.effectiveFrom },
    });
  }

  const created = await prisma.rateHistory.create({
    data: {
      itemId: input.itemId,
      rateType: input.rateType,
      amount: input.amount,
      effectiveFrom: input.effectiveFrom,
      changedBy: input.actor.id,
      reason: input.reason,
      branchId: input.branchId ?? null,
    },
  });

  await writeAudit({
    actor: input.actor,
    action: 'rate_change',
    entityType: 'RateHistory',
    entityId: created.id,
    before: current,
    after: created,
    reason: input.reason,
    severity: 'warning',
  });

  return created;
}

export async function listRateHistory(itemId: string) {
  return prisma.rateHistory.findMany({
    where: { itemId },
    orderBy: { effectiveFrom: 'desc' },
  });
}
