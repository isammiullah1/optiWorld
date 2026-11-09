import type { Request, Response } from 'express';

import { ReportExportSchema, ReportRangeQuerySchema } from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import { spreadsheetType } from '../lib/text-pdf.js';
import {
  exportReportPdf,
  exportReportWorkbook,
  getCreditReport,
  getInventoryReport,
  getSalesReport,
} from '../services/reports.service.js';

export function createReportsController() {
  return {
    sales: asyncHandler(async (req: Request, res: Response) => {
      const query = ReportRangeQuerySchema.parse(req.query);
      const data = await getSalesReport(requireSession(req), query.from, query.to);
      res.status(200).json({ success: true, data });
    }),
    inventory: asyncHandler(async (req: Request, res: Response) => {
      const query = ReportRangeQuerySchema.parse(req.query);
      const data = await getInventoryReport(requireSession(req), query.from, query.to);
      res.status(200).json({ success: true, data });
    }),
    credit: asyncHandler(async (req: Request, res: Response) => {
      const data = await getCreditReport(requireSession(req));
      res.status(200).json({ success: true, data });
    }),
    exportReport: asyncHandler(async (req: Request, res: Response) => {
      const input = ReportExportSchema.parse(req.body);
      const session = requireSession(req);
      if (input.reportType === 'CREDIT' && session.role !== 'OWNER') {
        throw new AppError(403, 'FORBIDDEN', 'Outstanding credit is visible to the owner');
      }
      if (input.reportType === 'INVENTORY' && session.role !== 'OWNER') {
        throw new AppError(403, 'FORBIDDEN', 'Stock movement is visible to the owner');
      }
      const file =
        input.format === 'pdf'
          ? await exportReportPdf(
              session,
              input.reportType,
              input.dateRange.from,
              input.dateRange.to,
            )
          : await exportReportWorkbook(
              session,
              input.reportType,
              input.dateRange.from,
              input.dateRange.to,
            );
      res.setHeader('Content-Type', spreadsheetType(file.filename));
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.status(200).send(file.body);
    }),
  };
}

function requireSession(req: Request) {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  return req.auth;
}
