import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';

function dbPath(): string {
  // DATABASE_URL like file:../../data/iceflow.db relative to prisma folder
  const url = env.databaseUrl.replace(/^file:/, '');
  return path.resolve(__dirname, '../../prisma', url);
}

export async function createBackup(createdById?: string, notes?: string, type = 'manual') {
  fs.mkdirSync(env.backupDir, { recursive: true });
  const src = dbPath();
  if (!fs.existsSync(src)) throw new AppError('Database file not found', 500);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `iceflow-backup-${stamp}.db`;
  const filepath = path.join(env.backupDir, filename);
  fs.copyFileSync(src, filepath);
  const stat = fs.statSync(filepath);

  const record = await prisma.backupRecord.create({
    data: {
      filename,
      filepath,
      sizeBytes: stat.size,
      type,
      createdById,
      notes,
    },
  });
  return record;
}

export async function listBackups() {
  return prisma.backupRecord.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
}

export async function restoreBackup(backupId: string, createdById?: string) {
  const backup = await prisma.backupRecord.findUnique({ where: { id: backupId } });
  if (!backup || !fs.existsSync(backup.filepath)) {
    throw new AppError('Backup not found', 404);
  }

  // Safety: create pre-restore backup first
  await createBackup(createdById, `Pre-restore before ${backup.filename}`, 'pre_restore');

  const dest = dbPath();
  fs.copyFileSync(backup.filepath, dest);
  return { success: true, restoredFrom: backup.filename };
}

export async function exportJsonSnapshot() {
  const [
    branches,
    items,
    employees,
    sessions,
    movements,
    payments,
    expenses,
    rates,
  ] = await Promise.all([
    prisma.branch.findMany(),
    prisma.item.findMany(),
    prisma.employee.findMany(),
    prisma.employeeSession.findMany({ include: { lines: true } }),
    prisma.stockMovement.findMany({ take: 5000, orderBy: { createdAt: 'desc' } }),
    prisma.payment.findMany({ take: 5000 }),
    prisma.expense.findMany(),
    prisma.rateHistory.findMany(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    branches,
    items,
    employees,
    sessions,
    movements,
    payments,
    expenses,
    rates,
  };
}
