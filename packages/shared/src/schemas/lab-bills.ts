import { z } from 'zod';

import { JOB_STATUSES } from '../enums/index.js';

const uuid = z.string().uuid();
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const signedMoney = z.string().regex(/^-?\d{1,10}(\.\d{1,2})?$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const LAB_BILL_STATUSES = ['OPEN', 'ISSUED', 'CLEARED', 'VOID'] as const;
export type LabBillStatus = (typeof LAB_BILL_STATUSES)[number];

export const LabServiceSchema = z.object({
  id: uuid,
  name: z.string(),
  price: money,
  isActive: z.boolean(),
});

export type LabServiceRow = z.infer<typeof LabServiceSchema>;

export const SaveLabServiceSchema = z.object({
  name: z.string().trim().min(1, 'Enter the service name.').max(80),
  price: money,
  isActive: z.boolean(),
});

export type SaveLabServiceRequest = z.infer<typeof SaveLabServiceSchema>;

export const LabBillLineSchema = z.object({
  id: uuid,
  serviceName: z.string(),
  listPrice: money,
  unitPrice: money,
  quantity: z.number().int().positive(),
  lineTotal: money,
});

export const LabBillAdjustmentSchema = z.object({
  id: uuid,
  note: z.string(),
  amount: signedMoney,
  createdAt: z.string().datetime(),
});

export const LabBillSchema = z.object({
  id: uuid,
  referenceNumber: z.string(),
  patientName: z.string(),
  jobStatus: z.enum(JOB_STATUSES),
  jobSummary: z.string(),
  labOrgId: uuid,
  labName: z.string(),
  patientPhone: z.string(),
  retailerName: z.string().nullable(),
  clientName: z.string().nullable(),
  status: z.enum(LAB_BILL_STATUSES),
  discount: money,
  discountReason: z.string().nullable(),
  total: money,
  amountPaid: money,
  lines: z.array(LabBillLineSchema),
  adjustments: z.array(LabBillAdjustmentSchema),
  issuedAt: z.string().datetime().nullable(),
  clearedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type LabBill = z.infer<typeof LabBillSchema>;

export const LabBillListQuerySchema = z.object({
  from: day.optional(),
  to: day.optional(),
  status: z.enum(LAB_BILL_STATUSES).optional(),
  labOrgId: uuid.optional(),
  labClientId: uuid.optional(),
  format: z.enum(['xlsx', 'pdf']).optional(),
});

export type LabBillListQuery = z.infer<typeof LabBillListQuerySchema>;

export const UpdateLabBillSchema = z.object({
  discount: money,
  discountReason: z.string().trim().max(200).optional().or(z.literal('')),
  lines: z
    .array(
      z.object({
        id: uuid,
        unitPrice: money,
        quantity: z.number().int().positive().max(100),
      }),
    )
    .min(1),
});

export type UpdateLabBillRequest = z.infer<typeof UpdateLabBillSchema>;

export const AddLabBillLineSchema = z.object({
  labServiceId: uuid,
  quantity: z.number().int().positive().max(100).default(1),
});

export type AddLabBillLineRequest = z.infer<typeof AddLabBillLineSchema>;

export const LabBillAdjustmentRequestSchema = z.object({
  note: z.string().trim().min(1, 'Write what changed.').max(200),
  amount: signedMoney,
});

export type LabBillAdjustmentRequest = z.infer<typeof LabBillAdjustmentRequestSchema>;

export const LabServiceIdsSchema = z.array(uuid).min(1, 'Choose at least one lab service.').max(20);

export const LabBillIdsSchema = z.object({
  billIds: z.array(uuid).min(1, 'Select at least one bill.').max(100),
});

export type LabBillIdsRequest = z.infer<typeof LabBillIdsSchema>;
