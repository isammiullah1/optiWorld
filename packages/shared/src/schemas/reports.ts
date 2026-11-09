import { z } from 'zod';

import { RecordActivitySchema } from './record-activity.js';

import { CUSTOMER_GENDERS, INVOICE_STATUSES, PAYMENT_METHODS } from '../enums/index.js';

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.string();

export const REPORT_TYPES = ['SALES', 'INVENTORY', 'CREDIT'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const CREDIT_RISKS = ['current', 'watch', 'overdue', 'severe'] as const;
export type CreditRisk = (typeof CREDIT_RISKS)[number];

export const ReportRangeQuerySchema = z
  .object({
    from: day,
    to: day,
  })
  .refine((value) => value.from <= value.to, {
    message: 'The start date must be on or before the end date',
  });

export const ReportExportSchema = z.object({
  reportType: z.enum(REPORT_TYPES),
  dateRange: ReportRangeQuerySchema,
  format: z.enum(['xlsx', 'pdf']).optional(),
});

export type ReportExportRequest = z.infer<typeof ReportExportSchema>;

export const SalesReportSchema = z.object({
  from: day,
  to: day,
  revenue: money,
  invoiceCount: z.number().int().nonnegative(),
  averageValue: money,
  cashTotal: money,
  creditTotal: money,
  daily: z.array(z.object({ date: day, total: money })),
  topProducts: z.array(
    z.object({
      productName: z.string(),
      quantity: z.number().int().nonnegative(),
      total: money,
    }),
  ),
  invoices: z.array(
    z.object({
      id: uuid,
      invoiceNumber: z.number().int().positive(),
      customerId: uuid,
      customerName: z.string(),
      gender: z.enum(CUSTOMER_GENDERS).nullable(),
      products: z.array(z.string()),
      total: money,
      outstanding: money,
      paymentType: z.enum(PAYMENT_METHODS),
      status: z.enum(INVOICE_STATUSES),
      hasPrescription: z.boolean(),
      cancelled: z.boolean(),
      issuedAt: z.string().datetime(),
      activity: z.array(RecordActivitySchema).optional(),
    }),
  ),
});

export type SalesReport = z.infer<typeof SalesReportSchema>;

export const InventoryReportSchema = z.object({
  from: day,
  to: day,
  itemsSold: z.number().int().nonnegative(),
  unitsMoved: z.number().int().nonnegative(),
  lowStockEvents: z.number().int().nonnegative(),
  rows: z.array(
    z.object({
      batchId: uuid,
      productName: z.string(),
      priceCode: z.string(),
      opening: z.number().int(),
      added: z.number().int().nonnegative(),
      sold: z.number().int().nonnegative(),
      profit: money,
      units: z.number().int().nonnegative(),
      closing: z.number().int(),
    }),
  ),
  lowStockItems: z.array(
    z.object({
      id: uuid,
      title: z.string(),
      body: z.string(),
      createdAt: z.string().datetime(),
      batchId: uuid.nullable(),
    }),
  ),
});

export type InventoryReport = z.infer<typeof InventoryReportSchema>;

export const CreditReportSchema = z.object({
  months: z
    .array(
      z.object({
        label: z.string(),
        total: money,
      }),
    )
    .length(6),
  rows: z.array(
    z.object({
      customerId: uuid,
      customerName: z.string(),
      total: money,
      risk: z.enum(CREDIT_RISKS),
    }),
  ),
});

export type CreditReport = z.infer<typeof CreditReportSchema>;
