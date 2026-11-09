import type { Request, Response } from 'express';

import { SendPaymentReminderSchema, SendRemindersSchema } from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import {
  exportAgingPdf,
  exportAgingWorkbook,
  getAgingReport,
  getLedgerSummary,
  sendPaymentReminders,
} from '../services/ledger.service.js';

export function createLedgerController() {
  return {
    summary: asyncHandler(async (req: Request, res: Response) => {
      const data = await getLedgerSummary(requireSession(req));
      res.status(200).json({ success: true, data });
    }),
    aging: asyncHandler(async (req: Request, res: Response) => {
      const data = await getAgingReport(requireSession(req));
      res.status(200).json({ success: true, data });
    }),
    exportAging: asyncHandler(async (req: Request, res: Response) => {
      const file = await exportAgingWorkbook(requireSession(req));
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', 'attachment; filename="aging-report.xlsx"');
      res.status(200).send(file);
    }),
    exportAgingPdf: asyncHandler(async (req: Request, res: Response) => {
      const file = await exportAgingPdf(requireSession(req));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="aging-report.pdf"');
      res.status(200).send(file);
    }),
    sendReminders: asyncHandler(async (req: Request, res: Response) => {
      const input = SendRemindersSchema.parse(req.body ?? {});
      const data = await sendPaymentReminders(requireSession(req), input.customerIds);
      res.status(200).json({ success: true, data });
    }),
    sendWhatsApp: asyncHandler(async (req: Request, res: Response) => {
      const input = SendPaymentReminderSchema.parse(req.body);
      const data = await sendPaymentReminders(requireSession(req), input.customerIds);
      res.status(200).json({ success: true, data });
    }),
  };
}

function requireSession(req: Request) {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  return req.auth;
}
