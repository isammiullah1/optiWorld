import { z } from 'zod';

import { RecordActivitySchema } from './record-activity.js';

import { CUSTOMER_GENDERS, INVOICE_STATUSES, PAYMENT_METHODS } from '../enums/index.js';
import { AgingReportSchema } from './ledger.js';

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const money = z.string();

export const REPORT_TYPES = ['SALES', 'INVENTORY', 'CREDIT', 'CUSTOMERS'] as const;
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

export const InventoryReportQuerySchema = ReportRangeQuerySchema.and(
  z.object({
    quietDays: z.coerce.number().int().min(1).max(365).default(60),
  }),
);

export const ReportExportSchema = z.object({
  reportType: z.enum(REPORT_TYPES),
  dateRange: ReportRangeQuerySchema,
  format: z.enum(['xlsx', 'pdf']).optional(),
  quietDays: z.number().int().min(1).max(365).optional(),
});

export type ReportExportRequest = z.infer<typeof ReportExportSchema>;

export const SalesReportSchema = z.object({
  from: day,
  to: day,
  revenue: money,
  costIncurred: money.nullable(),
  labExpense: money.nullable(),
  labExpensePending: money.nullable(),
  profit: money.nullable(),
  profitRows: z.array(
    z.object({
      id: uuid,
      invoiceNumber: z.number().int().positive(),
      customerName: z.string(),
      products: z.string(),
      sale: money,
      cost: money.nullable(),
      profit: money.nullable(),
      costMissing: z.boolean(),
      labPending: z.boolean(),
    }),
  ),
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
      removed: z.boolean(),
      removalReason: z.string().nullable(),
      removedBy: z.string().nullable(),
      issuedAt: z.string().datetime(),
      activity: z.array(RecordActivitySchema).optional(),
    }),
  ),
  dailySummary: z.array(
    z.object({
      date: day,
      invoiceCount: z.number().int().nonnegative(),
      sale: money,
      discount: money,
      cash: money,
      credit: money,
      cost: money.nullable(),
      labExpense: money.nullable(),
      profit: money.nullable(),
      margin: money.nullable(),
      costMissing: z.boolean(),
    }),
  ),
  byProduct: z.array(
    z.object({
      productName: z.string(),
      category: z.string(),
      quantity: z.number().int().nonnegative(),
      sale: money,
      discount: money,
      cost: money.nullable(),
      profit: money.nullable(),
      margin: money.nullable(),
      costMissing: z.boolean(),
    }),
  ),
  byCategory: z.array(
    z.object({
      category: z.string(),
      quantity: z.number().int().nonnegative(),
      sale: money,
      discount: money,
      cost: money.nullable(),
      profit: money.nullable(),
      margin: money.nullable(),
      costMissing: z.boolean(),
    }),
  ),
  byPayment: z.array(
    z.object({
      method: z.enum(PAYMENT_METHODS),
      label: z.string(),
      invoiceCount: z.number().int().nonnegative(),
      sale: money,
    }),
  ),
  byCashier: z.array(
    z.object({
      name: z.string(),
      invoiceCount: z.number().int().nonnegative(),
      sale: money,
    }),
  ),
  discounts: z.array(
    z.object({
      invoiceId: uuid,
      invoiceNumber: z.number().int().positive(),
      customerName: z.string(),
      discount: money,
      total: money,
    }),
  ),
  returns: z.array(
    z.object({
      invoiceId: uuid,
      invoiceNumber: z.number().int().positive(),
      customerName: z.string(),
      amount: money,
      reason: z.string().nullable(),
      by: z.string().nullable(),
      kind: z.enum(['CANCELLED', 'REMOVED']),
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
  stockValue: z.object({
    cost: money,
    sale: money,
    missingCost: z.number().int().nonnegative(),
  }),
  valuation: z.array(
    z.object({
      batchId: uuid,
      productName: z.string(),
      priceCode: z.string(),
      quantity: z.number().int().nonnegative(),
      costValue: money.nullable(),
      saleValue: money,
      costMissing: z.boolean(),
    }),
  ),
  reorder: z.array(
    z.object({
      batchId: uuid,
      productName: z.string(),
      priceCode: z.string(),
      quantity: z.number().int(),
      threshold: z.number().int().nonnegative(),
      reorder: z.number().int().nonnegative(),
    }),
  ),
  ledger: z.array(
    z.object({
      id: uuid,
      at: z.string().datetime(),
      productName: z.string(),
      kind: z.enum(['In', 'Out', 'Adjustment']),
      quantity: z.number().int(),
      balance: z.number().int(),
      note: z.string().nullable(),
      by: z.string().nullable(),
    }),
  ),
  deadStock: z.array(
    z.object({
      batchId: uuid,
      productName: z.string(),
      priceCode: z.string(),
      quantity: z.number().int().positive(),
      lastSaleAt: z.string().datetime().nullable(),
    }),
  ),
  quietDays: z.number().int().min(1).max(365),
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

const CustomerSaleSchema = z.object({
  customerId: uuid,
  customerName: z.string(),
  invoiceCount: z.number().int().nonnegative(),
  sale: money,
  outstanding: money.nullable(),
});

export const CustomerReportSchema = z.object({
  from: day,
  to: day,
  top: z.array(CustomerSaleSchema),
  acquired: z.object({
    newCount: z.number().int().nonnegative(),
    returningCount: z.number().int().nonnegative(),
    newSale: money,
    returningSale: money,
    newCustomers: z.array(CustomerSaleSchema),
    returningCustomers: z.array(CustomerSaleSchema),
  }),
  outstanding: AgingReportSchema.nullable(),
  inactive: z.array(
    z.object({
      customerId: uuid,
      customerName: z.string(),
      lastVisit: z.string().datetime().nullable(),
      outstanding: money.nullable(),
    }),
  ),
});

export type CustomerReport = z.infer<typeof CustomerReportSchema>;
