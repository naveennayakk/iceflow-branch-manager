import { prisma } from '../config/db';

export async function nextEmployeeCode(branchCode: string): Promise<string> {
  const lastDigit = branchCode.replace(/\D/g, '').slice(-1) || '0';
  const prefix = lastDigit;
  const employees = await prisma.employee.findMany({
    where: { employeeCode: { startsWith: prefix } },
    select: { employeeCode: true },
    orderBy: { employeeCode: 'desc' },
    take: 50,
  });

  let maxSeq = 0;
  for (const e of employees) {
    const rest = e.employeeCode.slice(prefix.length);
    const n = parseInt(rest, 10);
    if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
  }

  const next = maxSeq + 1;
  const padded = next < 100 ? String(next).padStart(2, '0') : String(next);
  return `${prefix}${padded}`;
}

export async function nextDocNo(prefix: string, model: 'dispatch' | 'request' | 'session'): Promise<string> {
  const date = new Date();
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const base = `${prefix}-${ymd}-`;

  if (model === 'dispatch') {
    const last = await prisma.stockDispatch.findFirst({
      where: { dispatchNo: { startsWith: base } },
      orderBy: { dispatchNo: 'desc' },
    });
    const seq = last ? parseInt(last.dispatchNo.slice(base.length), 10) + 1 : 1;
    return `${base}${String(seq).padStart(4, '0')}`;
  }
  if (model === 'request') {
    const last = await prisma.stockRequest.findFirst({
      where: { requestNo: { startsWith: base } },
      orderBy: { requestNo: 'desc' },
    });
    const seq = last ? parseInt(last.requestNo.slice(base.length), 10) + 1 : 1;
    return `${base}${String(seq).padStart(4, '0')}`;
  }
  const last = await prisma.employeeSession.findFirst({
    where: { sessionNo: { startsWith: base } },
    orderBy: { sessionNo: 'desc' },
  });
  const seq = last ? parseInt(last.sessionNo.slice(base.length), 10) + 1 : 1;
  return `${base}${String(seq).padStart(4, '0')}`;
}

export function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
