import { z } from 'zod';

import { RecordActivitySchema } from './record-activity.js';

import {
  CUSTOMER_GENDERS,
  INVOICE_STATUSES,
  JOB_STATUSES,
  PAYMENT_METHODS,
} from '../enums/index.js';
import { prescriptionIssuePaths, type PrescriptionReading } from '../prescription/reading.js';
import { LinePrescriptionInputSchema } from './customers.js';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const uuid = z.string().uuid();

export const EyePowerSchema = z.object({
  sphere: z.string().max(20).default(''),
  cylinder: z.string().max(20).default(''),
  axis: z.string().max(20).default(''),
});

export const LabPrescriptionObject = z.object({
  labOrgId: uuid,
  referenceNumber: z.string().regex(/^(?:OW-\d{4}-\d{3}|OW-LAB-\d{4}-[A-Z0-9]{5})$/),
  right: EyePowerSchema,
  left: EyePowerSchema,
  add: z.string().max(20).default(''),
  pd: z.string().max(20).default(''),
  notes: z.string().max(500).default(''),
  frameType: z.string().max(80).optional(),
  frameMaterial: z.string().max(80).optional(),
  eyeSize: z.string().max(20).optional(),
  specialInstructions: z.string().max(500).optional(),
});

export function withLabPrescriptionRules<T extends z.ZodTypeAny>(schema: T): T {
  return schema.superRefine((value, ctx) => {
    if (!value || typeof value !== 'object') {
      return;
    }
    const record = value as Record<string, unknown>;
    const right = record.right;
    const left = record.left;
    if (
      !right ||
      !left ||
      typeof record.add !== 'string' ||
      typeof record.pd !== 'string' ||
      typeof record.notes !== 'string'
    ) {
      return;
    }
    for (const issue of prescriptionIssuePaths({
      right: right as PrescriptionReading['right'],
      left: left as PrescriptionReading['left'],
      add: record.add,
      pd: record.pd,
      notes: record.notes,
    })) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    }
  }) as unknown as T;
}

export const LabPrescriptionSchema = withLabPrescriptionRules(LabPrescriptionObject);

export type LabPrescription = z.infer<typeof LabPrescriptionSchema>;

export const CreatePosInvoiceSchema = z
  .object({
    localId: uuid,
    customerId: uuid,
    paymentType: z.enum(['CASH', 'CREDIT']),
    amountReceived: money.optional(),
    discount: money,
    items: z
      .array(
        z.object({
          inventoryBatchId: uuid,
          quantity: z.number().int().positive().max(10_000),
          unitPrice: money,
          prescription: LinePrescriptionInputSchema.optional(),
        }),
      )
      .min(1)
      .max(100),
    labPrescription: LabPrescriptionSchema.optional(),
    billLabOrgId: z.string().uuid().optional(),
    assignAllToLab: z.boolean().optional(),
    deliveryAddress: z.string().trim().max(300).optional(),
    deliveryCharge: money.optional(),
  })
  .superRefine((value, ctx) => {
    const address = value.deliveryAddress?.trim() ?? '';
    if (address.length > 0 && !value.deliveryCharge) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter the delivery charges',
        path: ['deliveryCharge'],
      });
    }
  });

export type CreatePosInvoiceRequest = z.infer<typeof CreatePosInvoiceSchema>;

export const InventorySearchHitSchema = z.object({
  id: uuid,
  priceCode: z.string(),
  productName: z.string(),
  brand: z.string().nullable(),
  category: z.string(),
  prescriptionRequired: z.boolean().nullable(),
  salePrice: money,
  stockQty: z.number().int().nonnegative(),
  lowStock: z.boolean(),
});

export type InventorySearchHit = z.infer<typeof InventorySearchHitSchema>;

export const CustomerSearchHitSchema = z.object({
  id: uuid,
  name: z.string(),
  phone: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  gender: z.enum(CUSTOMER_GENDERS).nullable(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  referredBy: z.string().nullable(),
  creditLimit: money,
  outstanding: money,
  lastPurchaseAt: z.string().datetime().nullable(),
});

export type CustomerSearchHit = z.infer<typeof CustomerSearchHitSchema>;

export const ConnectedLabSchema = z.object({
  id: uuid,
  name: z.string(),
});

export type ConnectedLab = z.infer<typeof ConnectedLabSchema>;

const receiptEye = z.object({
  sphere: z.string(),
  cylinder: z.string(),
  axis: z.string(),
});

export const ReceiptPrescriptionSchema = z.object({
  right: receiptEye,
  left: receiptEye,
  add: z.string(),
  pd: z.string(),
  notes: z.string(),
});

export type ReceiptPrescription = z.infer<typeof ReceiptPrescriptionSchema>;

export const PosReceiptItemSchema = z.object({
  id: uuid,
  productName: z.string(),
  priceCode: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: money,
  lineTotal: money,
  prescriptionSummary: z.string().nullable(),
  prescription: ReceiptPrescriptionSchema.nullable(),
});

export const PosReceiptSchema = z.object({
  id: uuid,
  invoiceNumber: z.number().int().positive(),
  issuedAt: z.string().datetime(),
  businessName: z.string(),
  customerName: z.string(),
  customerPhone: z.string().nullable(),
  customerWhatsapp: z.string().nullable(),
  customerGender: z.enum(CUSTOMER_GENDERS).nullable(),
  customerDateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  paymentType: z.enum(PAYMENT_METHODS),
  outstanding: money,
  amountPaid: money,
  payments: z.array(
    z.object({
      amount: money,
      recordedAt: z.string().datetime(),
      notes: z.string().nullable(),
    }),
  ),
  status: z.enum(INVOICE_STATUSES),
  subtotal: money,
  discount: money,
  deliveryCharge: money,
  deliveryAddress: z.string().nullable(),
  total: money,
  labReference: z.string().nullable(),
  cancelledAt: z.string().datetime().nullable(),
  labJobs: z.array(
    z.object({
      id: uuid,
      referenceNumber: z.string(),
      status: z.enum(JOB_STATUSES),
      labOrgId: uuid,
      labName: z.string(),
    }),
  ),
  billHeading: z.string(),
  billTagline: z.string(),
  billTerms: z.string(),
  billLogoUrl: z.string().nullable(),
  businessPhone: z.string().nullable(),
  businessAddress: z.string().nullable(),
  items: z.array(PosReceiptItemSchema),
  activity: z.array(RecordActivitySchema).optional(),
});

export type PosReceipt = z.infer<typeof PosReceiptSchema>;

export const CancelInvoiceSchema = z.object({
  reason: z.string().trim().min(1, 'Write why this bill is being cancelled.').max(500),
});

export type CancelInvoiceRequest = z.infer<typeof CancelInvoiceSchema>;

export const SendInvoiceLabSchema = z.object({
  labOrgId: uuid,
});

export type SendInvoiceLabRequest = z.infer<typeof SendInvoiceLabSchema>;

export const UpdateInvoicePrescriptionSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: uuid,
        prescription: ReceiptPrescriptionSchema,
      }),
    )
    .min(1),
});

export type UpdateInvoicePrescriptionRequest = z.infer<typeof UpdateInvoicePrescriptionSchema>;

export const FinalizeInvoiceLabSchema = z.object({
  prescriptions: z
    .array(
      z.object({
        itemId: uuid,
        prescription: ReceiptPrescriptionSchema,
      }),
    )
    .default([]),
  additions: z
    .array(
      z.object({
        inventoryBatchId: uuid,
        quantity: z.number().int().positive().max(99),
        unitPrice: money,
        prescription: ReceiptPrescriptionSchema.optional(),
      }),
    )
    .max(20)
    .default([]),
});

export type FinalizeInvoiceLabRequest = z.infer<typeof FinalizeInvoiceLabSchema>;

export const InvoiceNoticeSchema = z.object({
  id: uuid,
  sent: z.boolean(),
  message: z.string(),
});

export type InvoiceNotice = z.infer<typeof InvoiceNoticeSchema>;

export const ClearInvoiceCreditSchema = z.object({
  amount: money.optional(),
});

export type ClearInvoiceCreditRequest = z.infer<typeof ClearInvoiceCreditSchema>;

export const SendReceiptRequestSchema = z.object({
  invoiceId: uuid,
});

export type SendReceiptRequest = z.infer<typeof SendReceiptRequestSchema>;

export const SendReceiptResultSchema = z.object({
  sent: z.boolean(),
  message: z.string(),
});

export type SendReceiptResult = z.infer<typeof SendReceiptResultSchema>;
