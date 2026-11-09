import { z } from 'zod';

import { ALERT_TYPES, INVOICE_STATUSES } from '../enums/index.js';

export const DashboardMonthSchema = z.object({
  month: z.string(),
  label: z.string(),
  total: z.string(),
  isCurrent: z.boolean(),
});

export const DashboardStatsSchema = z.object({
  todaySales: z.string(),
  yesterdaySales: z.string(),
  salesChangePercent: z.number().nullable(),
  outstandingDues: z.string(),
  outstandingCustomerCount: z.number().int().nonnegative(),
  stockItemCount: z.number().int().nonnegative(),
  lowStockCount: z.number().int().nonnegative(),
  activeLabJobCount: z.number().int().nonnegative(),
  readyLabJobCount: z.number().int().nonnegative(),
  monthlySales: z.array(DashboardMonthSchema).length(6),
});

export type DashboardStats = z.infer<typeof DashboardStatsSchema>;

export const RetailerInvoiceRowSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.number().int().positive(),
  customerName: z.string(),
  amount: z.string(),
  status: z.enum(INVOICE_STATUSES),
  issuedAt: z.string().datetime(),
});

export type RetailerInvoiceRow = z.infer<typeof RetailerInvoiceRowSchema>;

export const RetailerInvoiceDetailSchema = RetailerInvoiceRowSchema.extend({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      productName: z.string(),
      quantity: z.number().int().positive(),
      unitPrice: z.string(),
    }),
  ),
});

export type RetailerInvoiceDetail = z.infer<typeof RetailerInvoiceDetailSchema>;

export const ALERT_CATEGORIES = [
  'ALL',
  'LOW_STOCK',
  'PAYMENTS',
  'LAB_JOBS',
  'ORDERS',
  'REVIEWS',
] as const;
export type AlertCategory = (typeof ALERT_CATEGORIES)[number];

export const AlertListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(5),
  includeRead: z.enum(['true', 'false']).optional(),
  category: z.enum(ALERT_CATEGORIES).optional(),
});

export const RetailerAlertSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(ALERT_TYPES),
  title: z.string(),
  body: z.string(),
  isRead: z.boolean(),
  relatedEntityId: z.string().uuid().nullable(),
  relatedEntityType: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type RetailerAlert = z.infer<typeof RetailerAlertSchema>;

export const PageMetaSchema = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

export type PageMeta = z.infer<typeof PageMetaSchema>;
