import { prisma } from '../config/db';
import { AppError, assertFound } from '../utils/errors';
import { nextDocNo, startOfDay } from '../utils/ids';
import { getActiveRate } from './rate.service';
import { recordMovement, getBalance } from './stock.service';
import { writeAudit } from './audit.service';
import { notifyMain } from './notification.service';
import { AuthUser } from '../middleware/auth';
import { checkSessionAnomalies } from './fraud.service';

function calcLine(stockOut: number, stockIn: number, damaged: number, rate: number) {
  if (stockIn < 0 || stockOut < 0 || damaged < 0) {
    throw new AppError('Quantities cannot be negative');
  }
  if (stockIn + damaged > stockOut) {
    throw new AppError('Stock-in + damaged cannot exceed stock-out');
  }
  const sold = stockOut - stockIn; // damaged still counts as sold/lost for bill unless handled separately
  // Business rule: damaged is separate from normal stock-in; sold = stockOut - stockIn
  // Damaged reduces returnable but still may need write-off — bill uses sold qty from good returns
  const soldQty = stockOut - stockIn;
  const amount = soldQty * rate;
  return { soldQty, amount };
}

export async function openOrGetSession(
  employeeId: string,
  actor: AuthUser,
  sessionDate = new Date()
) {
  const employee = assertFound(
    await prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null, status: 'active' },
    }),
    'Employee not found'
  );
  if (actor.role === 'SUB_ADMIN' && actor.branchId !== employee.branchId) {
    throw new AppError('Access denied', 403);
  }

  const day = startOfDay(sessionDate);
  let session = await prisma.employeeSession.findUnique({
    where: { employeeId_sessionDate: { employeeId, sessionDate: day } },
    include: {
      lines: { include: { item: true } },
      employee: true,
    },
  });

  if (!session) {
    const sessionNo = await nextDocNo('SES', 'session');
    session = await prisma.employeeSession.create({
      data: {
        sessionNo,
        employeeId,
        branchId: employee.branchId,
        sessionDate: day,
        status: 'draft',
        previousOutstanding: employee.outstanding,
        createdById: actor.id,
      },
      include: {
        lines: { include: { item: true } },
        employee: true,
      },
    });
  }

  return session;
}

export async function saveStockOut(
  sessionId: string,
  lines: Array<{ itemId: string; quantity: number; entrySource?: string }>,
  actor: AuthUser
) {
  const session = assertFound(
    await prisma.employeeSession.findUnique({
      where: { id: sessionId },
      include: { lines: true, employee: true },
    }),
    'Session not found'
  );
  if (['finalized', 'voided'].includes(session.status)) {
    throw new AppError('Cannot edit finalized/voided session');
  }
  if (actor.role === 'SUB_ADMIN' && actor.branchId !== session.branchId) {
    throw new AppError('Access denied', 403);
  }

  for (const line of lines) {
    if (line.quantity < 0) throw new AppError('Invalid quantity');
    if (line.quantity === 0) continue;

    const available = await getBalance(session.branchId, line.itemId);
    const existing = session.lines.find((l) => l.itemId === line.itemId);
    const alreadyOut = existing?.stockOutQty ?? 0;
    const additional = line.quantity - alreadyOut;

    if (additional > available) {
      throw new AppError(`Insufficient stock for item. Available: ${available}`);
    }

    const empRate = await getActiveRate(
      line.itemId,
      'SUB_TO_EMPLOYEE',
      session.sessionDate,
      session.branchId
    );
    const costRate = await getActiveRate(
      line.itemId,
      'MAIN_TO_SUB',
      session.sessionDate,
      session.branchId
    );

    await prisma.sessionLine.upsert({
      where: { sessionId_itemId: { sessionId, itemId: line.itemId } },
      create: {
        sessionId,
        itemId: line.itemId,
        stockOutQty: line.quantity,
        employeeRate: empRate,
        costRate,
        entrySource: line.entrySource ?? 'manual',
        isDraft: false,
      },
      update: {
        stockOutQty: line.quantity,
        employeeRate: existing?.employeeRate || empRate, // freeze if already set
        entrySource: line.entrySource ?? existing?.entrySource ?? 'manual',
      },
    });

    if (additional > 0) {
      await recordMovement({
        branchId: session.branchId,
        itemId: line.itemId,
        quantity: additional,
        movementType: 'stock_out_to_employee',
        actor,
        employeeId: session.employeeId,
        sessionId: session.id,
        referenceType: 'session',
        referenceId: session.id,
        employeeRate: empRate,
        costRate,
        entrySource: line.entrySource ?? 'manual',
      });
    } else if (additional < 0) {
      // Return excess previously issued back to branch (only before finalize)
      await recordMovement({
        branchId: session.branchId,
        itemId: line.itemId,
        quantity: Math.abs(additional),
        movementType: 'stock_in_from_employee',
        actor,
        employeeId: session.employeeId,
        sessionId: session.id,
        referenceType: 'session',
        referenceId: session.id,
        notes: 'Stock-out correction',
        entrySource: line.entrySource ?? 'manual',
      });
    }
  }

  await prisma.employeeSession.update({
    where: { id: sessionId },
    data: { status: 'stock_out_saved' },
  });

  await writeAudit({
    actor,
    branchId: session.branchId,
    action: 'morning_stock_out',
    entityType: 'EmployeeSession',
    entityId: sessionId,
    after: { lines },
  });

  return openOrGetSession(session.employeeId, actor, session.sessionDate);
}

export async function saveStockInDraft(
  sessionId: string,
  lines: Array<{
    itemId: string;
    stockInQty: number;
    damagedQty?: number;
    damagedReason?: string;
    entrySource?: string;
  }>,
  payments: {
    cashPaid?: number;
    phonePePaid?: number;
    otherPaid?: number;
    phonePeRef?: string;
    otherPaymentNote?: string;
  },
  actor: AuthUser,
  finalize = false
) {
  const session = assertFound(
    await prisma.employeeSession.findUnique({
      where: { id: sessionId },
      include: { lines: true, employee: true },
    }),
    'Session not found'
  );
  if (session.status === 'finalized') throw new AppError('Session already finalized');
  if (session.status === 'voided') throw new AppError('Session is voided');
  if (actor.role === 'SUB_ADMIN' && actor.branchId !== session.branchId) {
    throw new AppError('Access denied', 403);
  }

  let totalBill = 0;
  const updates: Array<{
    itemId: string;
    stockInQty: number;
    damagedQty: number;
    soldQty: number;
    amount: number;
    employeeRate: number;
  }> = [];

  for (const line of lines) {
    const existing = session.lines.find((l) => l.itemId === line.itemId);
    if (!existing) throw new AppError(`Item not in morning stock-out: ${line.itemId}`);
    const damaged = line.damagedQty ?? 0;
    const { soldQty, amount } = calcLine(
      existing.stockOutQty,
      line.stockInQty,
      damaged,
      existing.employeeRate
    );
    totalBill += amount;
    updates.push({
      itemId: line.itemId,
      stockInQty: line.stockInQty,
      damagedQty: damaged,
      soldQty,
      amount,
      employeeRate: existing.employeeRate,
    });

    await prisma.sessionLine.update({
      where: { sessionId_itemId: { sessionId, itemId: line.itemId } },
      data: {
        stockInQty: line.stockInQty,
        damagedQty: damaged,
        damagedReason: line.damagedReason,
        soldQty,
        amount,
        entrySource: line.entrySource ?? existing.entrySource,
        isDraft: !finalize,
      },
    });
  }

  const cashPaid = payments.cashPaid ?? 0;
  const phonePePaid = payments.phonePePaid ?? 0;
  const otherPaid = payments.otherPaid ?? 0;
  if (cashPaid < 0 || phonePePaid < 0 || otherPaid < 0) {
    throw new AppError('Payment amounts cannot be negative');
  }
  const totalPaid = cashPaid + phonePePaid + otherPaid;
  const previous = session.previousOutstanding;
  let newOutstanding = previous + totalBill - totalPaid;
  let excessAmount = 0;
  if (newOutstanding < 0) {
    excessAmount = Math.abs(newOutstanding);
    newOutstanding = -excessAmount; // store as credit (negative outstanding)
  }

  await prisma.employeeSession.update({
    where: { id: sessionId },
    data: {
      totalBill,
      cashPaid,
      phonePePaid,
      otherPaid,
      phonePeRef: payments.phonePeRef,
      otherPaymentNote: payments.otherPaymentNote,
      newOutstanding,
      excessAmount,
      status: finalize ? 'finalized' : 'stock_in_draft',
      finalizedAt: finalize ? new Date() : null,
      isCleared: finalize && newOutstanding === 0,
    },
  });

  if (!finalize) {
    return openOrGetSession(session.employeeId, actor, session.sessionDate);
  }

  // Finalize: ledger stock-in, damage, payments, employee outstanding
  for (const u of updates) {
    if (u.stockInQty > 0) {
      await recordMovement({
        branchId: session.branchId,
        itemId: u.itemId,
        quantity: u.stockInQty,
        movementType: 'stock_in_from_employee',
        actor,
        employeeId: session.employeeId,
        sessionId,
        referenceType: 'session',
        referenceId: sessionId,
        employeeRate: u.employeeRate,
      });
    }
    if (u.damagedQty > 0) {
      // Damaged left with employee path: record damaged (no stock return)
      await prisma.damageRequest.create({
        data: {
          branchId: session.branchId,
          itemId: u.itemId,
          quantity: u.damagedQty,
          reason: 'Damaged return from employee session',
          status: 'pending',
          createdById: actor.id,
          sessionId,
          employeeId: session.employeeId,
        },
      });
      await notifyMain(
        'Damage write-off pending',
        `Branch session ${session.sessionNo} reported damaged stock`,
        'damage',
        { sessionId, itemId: u.itemId, qty: u.damagedQty }
      );
    }
  }

  if (totalPaid > 0) {
    await prisma.payment.create({
      data: {
        employeeId: session.employeeId,
        sessionId,
        cashAmount: cashPaid,
        phonePeAmount: phonePePaid,
        otherAmount: otherPaid,
        phonePeRef: payments.phonePeRef,
        totalAmount: totalPaid,
        createdById: actor.id,
      },
    });
  }

  await prisma.employee.update({
    where: { id: session.employeeId },
    data: {
      outstanding: Math.max(0, newOutstanding),
      creditBalance: excessAmount,
    },
  });

  await writeAudit({
    actor,
    branchId: session.branchId,
    action: 'finalize_day',
    entityType: 'EmployeeSession',
    entityId: sessionId,
    after: { totalBill, totalPaid, newOutstanding, excessAmount },
    severity: 'warning',
  });

  await checkSessionAnomalies(sessionId);

  return openOrGetSession(session.employeeId, actor, session.sessionDate);
}

export async function voidSession(sessionId: string, reason: string, actor: AuthUser) {
  if (!reason?.trim()) throw new AppError('Reason required');
  const session = assertFound(
    await prisma.employeeSession.findUnique({ where: { id: sessionId }, include: { lines: true } })
  );
  if (session.status !== 'finalized') throw new AppError('Only finalized sessions can be voided');
  if (actor.role !== 'MAIN_ADMIN') throw new AppError('Only Main Branch can void', 403);

  await prisma.employeeSession.update({
    where: { id: sessionId },
    data: { status: 'voided', voidedAt: new Date(), voidReason: reason, deletedAt: new Date() },
  });

  await writeAudit({
    actor,
    branchId: session.branchId,
    action: 'void_session',
    entityType: 'EmployeeSession',
    entityId: sessionId,
    reason,
    severity: 'critical',
  });

  await notifyMain('Session voided', `Session ${session.sessionNo} voided: ${reason}`, 'audit');
  return { success: true };
}
