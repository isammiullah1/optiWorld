import { z } from 'zod';

import {
  CONFLICT_RESOLUTIONS,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  SYNC_STATUSES,
} from '../enums/index.js';
import { LinePrescriptionInputSchema } from './customers.js';
import { LabPrescriptionSchema } from './pos-billing.js';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const uuid = z.string().uuid();

export const OfflineInvoiceItemSchema = z.object({
  localItemId: uuid,
  inventoryBatchId: uuid,
  quantity: z.number().int().positive().max(10_000),
  unitPrice: money,
  prescription: LinePrescriptionInputSchema.optional(),
});

export const OfflineInvoiceSchema = z.object({
  localId: uuid,
  customerId: uuid,
  status: z.enum(INVOICE_STATUSES),
  paymentType: z.enum(PAYMENT_METHODS),
  amountReceived: money.optional(),
  discount: money,
  issuedAt: z.string().datetime(),
  items: z.array(OfflineInvoiceItemSchema).min(1).max(100),
  labJob: LabPrescriptionSchema.optional(),
  billLabOrgId: z.string().uuid().optional(),
  assignAllToLab: z.boolean().optional(),
  deliveryAddress: z.string().trim().max(300).optional(),
  deliveryCharge: money.optional(),
  customerName: z.string().trim().min(1).max(120).optional(),
  customerPhone: z.string().trim().max(30).nullable().optional(),
});

export const SyncPushRequestSchema = z.object({
  invoices: z.array(OfflineInvoiceSchema).min(1).max(50),
});

export const SyncPullQuerySchema = z.object({
  since: z.string().datetime().optional(),
});

export const ResolveConflictSchema = z
  .object({
    clientLocalId: uuid,
    resolution: z.enum(CONFLICT_RESOLUTIONS),
    invoice: OfflineInvoiceSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.resolution !== 'ACCEPT_LOCAL') {
      return;
    }
    if (!value.invoice) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['invoice'],
        message: 'The device copy of the sale is required',
      });
      return;
    }
    if (value.invoice.localId !== value.clientLocalId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['invoice', 'localId'],
        message: 'The sale id does not match the conflict being resolved',
      });
    }
  });

export const PosInvoiceItemSchema = z.object({
  localItemId: uuid,
  inventoryBatchId: uuid,
  productName: z.string(),
  priceCode: z.string(),
  quantity: z.number().int().nonnegative(),
  unitPrice: money,
  salePrice: money,
  stockShortfall: z.number().int().nonnegative(),
  prescription: LinePrescriptionInputSchema.optional(),
});

export const PosInvoiceSchema = z.object({
  localId: uuid,
  serverId: uuid.nullable(),
  invoiceNumber: z.number().int().positive().nullable(),
  customerId: uuid,
  status: z.enum(INVOICE_STATUSES),
  paymentType: z.enum(PAYMENT_METHODS),
  amountReceived: money.optional(),
  total: money,
  discount: money,
  syncStatus: z.enum(SYNC_STATUSES),
  needsReview: z.boolean(),
  reviewReason: z.string().nullable(),
  issuedAt: z.string().datetime(),
  items: z.array(PosInvoiceItemSchema),
  labJob: LabPrescriptionSchema.optional(),
  billLabOrgId: z.string().uuid().optional(),
  assignAllToLab: z.boolean().optional(),
  deliveryAddress: z.string().trim().max(300).optional(),
  deliveryCharge: money.optional(),
});

export const CustomerCacheSchema = z.object({
  id: uuid,
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  creditLimit: money,
  updatedAt: z.string().datetime(),
});

export const InventoryCacheSchema = z.object({
  id: uuid,
  priceCode: z.string(),
  prefix: z.string(),
  productName: z.string(),
  category: z.string(),
  prescriptionRequired: z.boolean().nullable().optional(),
  salePrice: money,
  stockQty: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export const StockShortfallSchema = z.object({
  inventoryBatchId: uuid,
  requested: z.number().int().nonnegative(),
  deducted: z.number().int().nonnegative(),
  shortfall: z.number().int().nonnegative(),
});

export const SyncInvoiceResultSchema = z.object({
  localId: uuid,
  syncStatus: z.enum(['SYNCED', 'CONFLICT']),
  serverId: uuid.nullable(),
  invoiceNumber: z.number().int().positive().nullable(),
  needsReview: z.boolean(),
  reviewReason: z.string().nullable(),
  stockShortfalls: z.array(StockShortfallSchema),
});

export const ServerInvoiceSchema = PosInvoiceSchema.omit({ syncStatus: true }).extend({
  id: uuid,
  clientLocalId: uuid.nullable(),
  updatedAt: z.string().datetime(),
});

export const SyncedInvoiceRefSchema = z.object({
  localId: uuid,
  serverId: uuid.nullable(),
  invoiceNumber: z.number().int().positive().nullable(),
});

export const SyncPushResponseSchema = z.object({
  results: z.array(SyncInvoiceResultSchema),
  invoices: z.array(SyncedInvoiceRefSchema),
});

export const SyncPullResponseSchema = z.object({
  serverTime: z.string().datetime(),
  changedAt: z.string().datetime().optional(),
  customers: z.object({
    upserted: z.array(CustomerCacheSchema),
    deletedIds: z.array(uuid),
  }),
  inventoryBatches: z.object({
    upserted: z.array(InventoryCacheSchema),
    deletedIds: z.array(uuid),
  }),
  invoices: z.array(ServerInvoiceSchema),
});

export const ResolveConflictResponseSchema = z.object({
  resolution: z.enum(CONFLICT_RESOLUTIONS),
  invoice: ServerInvoiceSchema.nullable(),
});

export type OfflineInvoice = z.infer<typeof OfflineInvoiceSchema>;
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;
export type ResolveConflictRequest = z.infer<typeof ResolveConflictSchema>;
export type PosInvoice = z.infer<typeof PosInvoiceSchema>;
export type PosInvoiceItem = z.infer<typeof PosInvoiceItemSchema>;
export type CustomerCache = z.infer<typeof CustomerCacheSchema>;
export type InventoryCache = z.infer<typeof InventoryCacheSchema>;
export type SyncInvoiceResult = z.infer<typeof SyncInvoiceResultSchema>;
export type ServerInvoice = z.infer<typeof ServerInvoiceSchema>;
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;
export type ResolveConflictResponse = z.infer<typeof ResolveConflictResponseSchema>;
