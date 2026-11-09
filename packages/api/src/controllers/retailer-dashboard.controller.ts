import type { Request, Response } from 'express';
import { z } from 'zod';

import { AlertListQuerySchema } from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import {
  getDashboardStats,
  getRetailerInvoice,
  listRetailerAlerts,
  listRetailerInvoices,
  markAllRetailerAlertsRead,
  markRetailerAlertRead,
} from '../services/retailer-dashboard.service.js';

const LimitSchema = z.coerce.number().int().min(1).max(50);
const InvoiceParamsSchema = z.object({ invoiceId: z.string().uuid() });

export function createRetailerDashboardController() {
  return {
    stats: asyncHandler(async (req: Request, res: Response) => {
      const data = await getDashboardStats(requireSession(req));
      res.status(200).json({ success: true, data });
    }),

    invoices: asyncHandler(async (req: Request, res: Response) => {
      const limit = readLimit(req.query.limit, 10);
      const result = await listRetailerInvoices(requireSession(req), limit);
      res.status(200).json({ success: true, data: result.rows, meta: result.meta });
    }),

    invoice: asyncHandler(async (req: Request, res: Response) => {
      const params = InvoiceParamsSchema.parse(req.params);
      const data = await getRetailerInvoice(requireSession(req), params.invoiceId);
      res.status(200).json({ success: true, data });
    }),

    alerts: asyncHandler(async (req: Request, res: Response) => {
      const query = AlertListQuerySchema.parse(req.query);
      const result = await listRetailerAlerts(requireSession(req), {
        limit: query.limit,
        includeRead: query.includeRead === 'true',
        category: query.category ?? 'ALL',
      });
      res.status(200).json({ success: true, data: result.rows, meta: result.meta });
    }),
    readAlert: asyncHandler(async (req: Request, res: Response) => {
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const data = await markRetailerAlertRead(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    readAllAlerts: asyncHandler(async (req: Request, res: Response) => {
      const data = await markAllRetailerAlertsRead(requireSession(req));
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

function readLimit(value: unknown, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === '') {
    return fallback;
  }
  return LimitSchema.parse(raw);
}
