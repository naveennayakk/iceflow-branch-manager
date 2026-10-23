import { Router } from 'express';
import { z } from 'zod';
import { authenticate, assertBranchAccess, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  openOrGetSession,
  saveStockOut,
  saveStockInDraft,
  voidSession,
} from '../services/session.service';
import { prisma } from '../config/db';
import { AppError } from '../utils/errors';
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { env } from '../config/env';

const router = Router();
router.use(authenticate);

router.post(
  '/open',
  validateBody(z.object({ employeeId: z.string(), sessionDate: z.string().optional() })),
  async (req, res, next) => {
    try {
      const session = await openOrGetSession(
        req.body.employeeId,
        req.user!,
        req.body.sessionDate ? new Date(req.body.sessionDate) : new Date()
      );
      res.json({ success: true, data: session });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/:id/stock-out',
  validateBody(
    z.object({
      lines: z.array(
        z.object({
          itemId: z.string(),
          quantity: z.number().min(0),
          entrySource: z.enum(['manual', 'voice', 'imported', 'adjustment']).optional(),
        })
      ),
    })
  ),
  async (req, res, next) => {
    try {
      const session = await saveStockOut(req.params.id, req.body.lines, req.user!);
      res.json({ success: true, data: session });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/:id/stock-in',
  validateBody(
    z.object({
      lines: z.array(
        z.object({
          itemId: z.string(),
          stockInQty: z.number().min(0),
          damagedQty: z.number().min(0).optional(),
          damagedReason: z.string().optional(),
          entrySource: z.enum(['manual', 'voice', 'imported', 'adjustment']).optional(),
        })
      ),
      payments: z
        .object({
          cashPaid: z.number().min(0).optional(),
          phonePePaid: z.number().min(0).optional(),
          otherPaid: z.number().min(0).optional(),
          phonePeRef: z.string().optional(),
          otherPaymentNote: z.string().optional(),
        })
        .default({}),
      finalize: z.boolean().optional(),
      confirmExcess: z.boolean().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      // Preview excess before finalize
      if (req.body.finalize) {
        const existing = await prisma.employeeSession.findUnique({
          where: { id: req.params.id },
          include: { lines: true },
        });
        if (!existing) throw new AppError('Session not found', 404);
        let totalBill = 0;
        for (const line of req.body.lines) {
          const ex = existing.lines.find((l) => l.itemId === line.itemId);
          if (!ex) throw new AppError('Item missing from stock-out');
          if (line.stockInQty + (line.damagedQty || 0) > ex.stockOutQty) {
            throw new AppError('Stock-in + damaged cannot exceed stock-out');
          }
          totalBill += (ex.stockOutQty - line.stockInQty) * ex.employeeRate;
        }
        const paid =
          (req.body.payments.cashPaid || 0) +
          (req.body.payments.phonePePaid || 0) +
          (req.body.payments.otherPaid || 0);
        const result = existing.previousOutstanding + totalBill - paid;
        if (result < 0 && !req.body.confirmExcess) {
          return res.status(409).json({
            success: false,
            code: 'EXCESS_CONFIRM_REQUIRED',
            error: 'Excess Amount / Change to Return — confirmation required',
            data: { excessAmount: Math.abs(result), totalBill, totalPaid: paid },
          });
        }
      }

      const session = await saveStockInDraft(
        req.params.id,
        req.body.lines,
        req.body.payments,
        req.user!,
        !!req.body.finalize
      );
      res.json({ success: true, data: session });
    } catch (e) {
      next(e);
    }
  }
);

router.post(
  '/:id/void',
  requireRole('MAIN_ADMIN'),
  validateBody(z.object({ reason: z.string().min(3) })),
  async (req, res, next) => {
    try {
      const data = await voidSession(req.params.id, req.body.reason, req.user!);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
);

router.get('/:id', async (req, res, next) => {
  try {
    const session = await prisma.employeeSession.findUnique({
      where: { id: req.params.id },
      include: {
        lines: { include: { item: true } },
        employee: true,
        payments: true,
        voiceEntries: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!session) throw new AppError('Not found', 404);
    assertBranchAccess(req, session.branchId);
    res.json({ success: true, data: session });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/bill-pdf', async (req, res, next) => {
  try {
    const session = await prisma.employeeSession.findUnique({
      where: { id: req.params.id },
      include: { lines: { include: { item: true } }, employee: true, branch: true },
    });
    if (!session) throw new AppError('Not found', 404);
    assertBranchAccess(req, session.branchId);

    fs.mkdirSync(env.uploadDir, { recursive: true });
    const filename = `bill-${session.sessionNo}.pdf`;
    const filepath = path.join(env.uploadDir, filename);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);
      doc.fontSize(18).text('IceFlow — Employee Bill', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Branch: ${session.branch.name}`);
      doc.text(`Employee: ${session.employee.fullName} (${session.employee.employeeCode})`);
      doc.text(`Date: ${session.sessionDate.toDateString()}`);
      doc.text(`Session: ${session.sessionNo}`);
      doc.moveDown();
      doc.text('Item                  Out   In   Sold   Rate   Amount');
      doc.moveDown(0.5);
      for (const line of session.lines) {
        doc.text(
          `${line.item.name.padEnd(18).slice(0, 18)}  ${line.stockOutQty}    ${line.stockInQty}    ${line.soldQty}    ${line.employeeRate}    ${line.amount}`
        );
      }
      doc.moveDown();
      doc.text(`Previous Outstanding: ₹${session.previousOutstanding}`);
      doc.text(`Total Bill: ₹${session.totalBill}`);
      doc.text(`PhonePe: ₹${session.phonePePaid}`);
      doc.text(`Cash: ₹${session.cashPaid}`);
      doc.text(`Other: ₹${session.otherPaid}`);
      doc.text(`New Outstanding: ₹${session.newOutstanding}`);
      if (session.excessAmount > 0) doc.text(`Excess / Change: ₹${session.excessAmount}`);
      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    await prisma.employeeSession.update({
      where: { id: session.id },
      data: { billPdfPath: filepath },
    });

    res.json({ success: true, data: { path: filepath, filename } });
  } catch (e) {
    next(e);
  }
});

export default router;
