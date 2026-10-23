import { prisma } from '../config/db';
import { notifyMain } from './notification.service';

export async function createFraudAlert(input: {
  branchId?: string;
  alertType: string;
  title: string;
  description: string;
  severity?: string;
  entityType?: string;
  entityId?: string;
  meta?: unknown;
}) {
  const alert = await prisma.fraudAlert.create({
    data: {
      branchId: input.branchId,
      alertType: input.alertType,
      title: input.title,
      description: input.description,
      severity: input.severity ?? 'medium',
      entityType: input.entityType,
      entityId: input.entityId,
      metaJson: input.meta != null ? JSON.stringify(input.meta) : null,
    },
  });
  await notifyMain(input.title, input.description, 'fraud', { alertId: alert.id });
  return alert;
}

export async function checkSessionAnomalies(sessionId: string) {
  const session = await prisma.employeeSession.findUnique({
    where: { id: sessionId },
    include: { lines: true, employee: true },
  });
  if (!session) return;

  // Large payment vs bill
  const paid = session.cashPaid + session.phonePePaid + session.otherPaid;
  if (session.totalBill > 0 && paid > session.totalBill * 3) {
    await createFraudAlert({
      branchId: session.branchId,
      alertType: 'overpayment',
      title: 'Unusual overpayment',
      description: `Employee ${session.employee.fullName} paid ₹${paid} against bill ₹${session.totalBill}`,
      severity: 'high',
      entityType: 'EmployeeSession',
      entityId: sessionId,
    });
  }

  // 100% damage on stock-out
  for (const line of session.lines) {
    if (line.stockOutQty > 0 && line.damagedQty >= line.stockOutQty) {
      await createFraudAlert({
        branchId: session.branchId,
        alertType: 'full_damage',
        title: 'Full stock marked damaged',
        description: `Session ${session.sessionNo}: entire stock-out damaged for an item`,
        severity: 'high',
        entityType: 'SessionLine',
        entityId: line.id,
      });
    }
  }

  // Zero collection with high bill
  if (session.totalBill >= 500 && paid === 0 && session.newOutstanding === session.previousOutstanding + session.totalBill) {
    await createFraudAlert({
      branchId: session.branchId,
      alertType: 'zero_collection',
      title: 'High bill with zero collection',
      description: `Employee ${session.employee.fullName} bill ₹${session.totalBill} with no payment`,
      severity: 'medium',
      entityType: 'EmployeeSession',
      entityId: sessionId,
    });
  }
}

export async function listFraudAlerts(status?: string) {
  return prisma.fraudAlert.findMany({
    where: status ? { status } : undefined,
    include: { branch: { select: { id: true, name: true, code: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function resolveFraudAlert(id: string, userId: string, status: string) {
  return prisma.fraudAlert.update({
    where: { id },
    data: { status, resolvedById: userId, resolvedAt: new Date() },
  });
}
