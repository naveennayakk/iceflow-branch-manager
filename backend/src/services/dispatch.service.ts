import { prisma } from '../config/db';
import { AppError, assertFound } from '../utils/errors';
import { nextDocNo } from '../utils/ids';
import { getActiveRate } from './rate.service';
import { recordMovement } from './stock.service';
import { writeAudit } from './audit.service';
import { notify } from './notification.service';
import { AuthUser } from '../middleware/auth';

export async function createDispatch(input: {
  toBranchId: string;
  lines: Array<{ itemId: string; quantity: number; notes?: string }>;
  notes?: string;
  requestId?: string;
  actor: AuthUser;
}) {
  const main = await prisma.branch.findFirst({ where: { isMain: true, deletedAt: null } });
  if (!main) throw new AppError('Main branch not configured');
  if (input.actor.role !== 'MAIN_ADMIN') throw new AppError('Only Main Branch can dispatch', 403);

  const dispatchNo = await nextDocNo('DSP', 'dispatch');
  const lineData = [];
  for (const l of input.lines) {
    if (l.quantity <= 0) continue;
    const costRate = await getActiveRate(l.itemId, 'MAIN_TO_SUB');
    lineData.push({ itemId: l.itemId, quantity: l.quantity, costRate, notes: l.notes });
  }
  if (!lineData.length) throw new AppError('At least one line required');

  const dispatch = await prisma.stockDispatch.create({
    data: {
      dispatchNo,
      fromBranchId: main.id,
      toBranchId: input.toBranchId,
      status: 'approved',
      requestId: input.requestId,
      notes: input.notes,
      createdById: input.actor.id,
      lines: { create: lineData },
    },
    include: { lines: { include: { item: true } }, toBranch: true },
  });

  await writeAudit({
    actor: input.actor,
    action: 'dispatch_created',
    entityType: 'StockDispatch',
    entityId: dispatch.id,
    after: dispatch,
  });

  await notify({
    branchId: input.toBranchId,
    targetRole: 'SUB_ADMIN',
    title: 'Stock dispatch created',
    body: `Dispatch ${dispatchNo} is being prepared for your branch`,
    type: 'stock_request',
  });

  return dispatch;
}

export async function updateDispatchStatus(
  id: string,
  status: string,
  actor: AuthUser
) {
  const allowed = ['pending', 'approved', 'packed', 'sent', 'received', 'cancelled'];
  if (!allowed.includes(status)) throw new AppError('Invalid status');

  const dispatch = assertFound(
    await prisma.stockDispatch.findUnique({
      where: { id },
      include: { lines: true, fromBranch: true, toBranch: true },
    })
  );

  if (status === 'sent') {
    if (actor.role !== 'MAIN_ADMIN') throw new AppError('Only Main can mark sent', 403);
    for (const line of dispatch.lines) {
      await recordMovement({
        branchId: dispatch.fromBranchId,
        itemId: line.itemId,
        quantity: line.quantity,
        movementType: 'stock_sent_to_subbranch',
        actor,
        referenceType: 'dispatch',
        referenceId: dispatch.id,
        costRate: line.costRate,
        notes: `Dispatch ${dispatch.dispatchNo}`,
      });
    }
    await prisma.stockDispatch.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date() },
    });
    await notify({
      branchId: dispatch.toBranchId,
      targetRole: 'SUB_ADMIN',
      title: 'Stock in transit',
      body: `Dispatch ${dispatch.dispatchNo} is on the way`,
      type: 'stock_request',
    });
  } else if (status === 'received') {
    if (actor.role === 'SUB_ADMIN' && actor.branchId !== dispatch.toBranchId) {
      throw new AppError('Access denied', 403);
    }
    if (dispatch.status !== 'sent') throw new AppError('Dispatch must be sent first');
    for (const line of dispatch.lines) {
      await recordMovement({
        branchId: dispatch.toBranchId,
        itemId: line.itemId,
        quantity: line.quantity,
        movementType: 'stock_received_from_main',
        actor,
        referenceType: 'dispatch',
        referenceId: dispatch.id,
        costRate: line.costRate,
        notes: `Received ${dispatch.dispatchNo}`,
      });
    }
    await prisma.stockDispatch.update({
      where: { id },
      data: { status: 'received', receivedAt: new Date(), receivedById: actor.id },
    });
  } else if (status === 'packed') {
    if (actor.role !== 'MAIN_ADMIN') throw new AppError('Only Main can pack', 403);
    await prisma.stockDispatch.update({
      where: { id },
      data: { status: 'packed', packedAt: new Date() },
    });
  } else {
    await prisma.stockDispatch.update({ where: { id }, data: { status } });
  }

  await writeAudit({
    actor,
    action: `dispatch_${status}`,
    entityType: 'StockDispatch',
    entityId: id,
  });

  return prisma.stockDispatch.findUnique({
    where: { id },
    include: { lines: { include: { item: true } }, toBranch: true, fromBranch: true },
  });
}
