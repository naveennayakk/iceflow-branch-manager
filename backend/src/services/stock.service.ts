import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import { writeAudit } from './audit.service';
import { AuthUser } from '../middleware/auth';
import { getActiveRate } from './rate.service';

const OUT_TYPES = new Set([
  'stock_sent_to_subbranch',
  'stock_out_to_employee',
  'damaged',
  'expiry',
  'write_off',
  'adjustment_out',
  'event_reserved',
  'event_delivered',
  'return_to_main',
]);

export async function getBalance(branchId: string, itemId: string): Promise<number> {
  const bal = await prisma.stockBalance.findUnique({
    where: { branchId_itemId: { branchId, itemId } },
  });
  return bal?.quantity ?? 0;
}

export async function listBalances(branchId: string) {
  return prisma.stockBalance.findMany({
    where: { branchId },
    include: { item: { include: { category: true } } },
    orderBy: { item: { name: 'asc' } },
  });
}

export async function recordMovement(input: {
  branchId: string;
  itemId: string;
  quantity: number;
  movementType: string;
  actor: AuthUser;
  referenceType?: string;
  referenceId?: string;
  employeeId?: string;
  sessionId?: string;
  notes?: string;
  approvalStatus?: string;
  entrySource?: string;
  costRate?: number;
  employeeRate?: number;
  skipBalanceCheck?: boolean;
}) {
  if (input.quantity <= 0) throw new AppError('Quantity must be positive');

  const direction = OUT_TYPES.has(input.movementType) ? 'out' : 'in';
  const delta = direction === 'in' ? input.quantity : -input.quantity;

  const current = await getBalance(input.branchId, input.itemId);
  if (direction === 'out' && !input.skipBalanceCheck && current < input.quantity) {
    throw new AppError(
      `Insufficient stock. Available: ${current}, requested: ${input.quantity}`,
      400,
      'INSUFFICIENT_STOCK'
    );
  }

  const costRate =
    input.costRate ?? (await getActiveRate(input.itemId, 'MAIN_TO_SUB', new Date(), input.branchId));
  const employeeRate =
    input.employeeRate ??
    (await getActiveRate(input.itemId, 'SUB_TO_EMPLOYEE', new Date(), input.branchId));

  const movement = await prisma.$transaction(async (tx) => {
    const mov = await tx.stockMovement.create({
      data: {
        branchId: input.branchId,
        itemId: input.itemId,
        quantity: input.quantity,
        movementType: input.movementType,
        direction,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        employeeId: input.employeeId,
        sessionId: input.sessionId,
        costRate,
        employeeRate,
        createdById: input.actor.id,
        notes: input.notes,
        approvalStatus: input.approvalStatus ?? 'approved',
        entrySource: input.entrySource ?? 'manual',
      },
    });

    await tx.stockBalance.upsert({
      where: { branchId_itemId: { branchId: input.branchId, itemId: input.itemId } },
      create: { branchId: input.branchId, itemId: input.itemId, quantity: Math.max(0, delta) },
      update: { quantity: { increment: delta } },
    });

    // Clamp negative safety (should not happen with checks)
    const bal = await tx.stockBalance.findUnique({
      where: { branchId_itemId: { branchId: input.branchId, itemId: input.itemId } },
    });
    if (bal && bal.quantity < 0) {
      throw new AppError('Stock ledger inconsistency detected', 409, 'LEDGER_INCONSISTENT');
    }

    return mov;
  });

  await writeAudit({
    actor: input.actor,
    branchId: input.branchId,
    action: `stock_${input.movementType}`,
    entityType: 'StockMovement',
    entityId: movement.id,
    after: movement,
    reason: input.notes,
  });

  return movement;
}

export async function listMovements(filters: {
  branchId?: string;
  itemId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}) {
  return prisma.stockMovement.findMany({
    where: {
      branchId: filters.branchId,
      itemId: filters.itemId,
      deletedAt: null,
      createdAt: { gte: filters.from, lte: filters.to },
    },
    include: {
      item: true,
      employee: { select: { id: true, fullName: true, employeeCode: true } },
      createdBy: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: filters.limit ?? 200,
  });
}
