import { z } from 'zod';

import { JOB_STATUSES } from '../enums/index.js';

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Enter a quantity')
  .refine((value) => Number(value) >= 0, 'Enter a quantity');
const positiveQuantity = quantity.refine((value) => Number(value) > 0, 'Enter a quantity');

export const LAB_INVENTORY_CATEGORIES = ['Lens blank', 'Coating', 'Material', 'Other'] as const;
export type LabInventoryCategory = (typeof LAB_INVENTORY_CATEGORIES)[number];

export const LabInventoryItemSchema = z.object({
  id: uuid,
  name: z.string(),
  category: z.string(),
  quantity: quantity,
  unit: z.string(),
  reorderLevel: quantity,
  lowStock: z.boolean(),
});

export const SaveLabInventorySchema = z.object({
  name: z.string().trim().min(1, 'Enter the item name.').max(120),
  category: z.string().trim().min(1, 'Choose a category.').max(40),
  quantity,
  unit: z.string().trim().min(1, 'Enter a unit.').max(20),
  reorderLevel: quantity,
});

export const AdjustLabStockSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('RECEIVED'),
    quantity: positiveQuantity,
    occurredOn: day,
    supplier: z.string().trim().max(120).optional().or(z.literal('')),
  }),
  z.object({
    kind: z.literal('USAGE'),
    quantity: positiveQuantity,
    labJobId: uuid.optional().or(z.literal('')),
  }),
]);

export const LabClientRowSchema = z.object({
  id: uuid,
  name: z.string(),
  username: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  about: z.string().nullable(),
  connectedAt: z.string().nullable(),
  type: z.enum(['OPTIWORLD', 'EXTERNAL']),
  totalJobs: z.number().int().nonnegative(),
  lastJobAt: z.string().nullable(),
});

export const LabClientJobSchema = z.object({
  id: uuid,
  referenceNumber: z.string(),
  patientName: z.string(),
  status: z.enum(JOB_STATUSES),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

export const LabClientJobsSchema = z.object({
  client: LabClientRowSchema.extend({
    averageTurnaroundHours: z.number().nullable(),
  }),
  jobs: z.array(LabClientJobSchema),
});

export const LabJobActivitySchema = z.object({
  from: day,
  to: day,
  days: z.array(
    z.object({
      date: day,
      received: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
    }),
  ),
});

export const LabTurnaroundSchema = z.object({
  from: day,
  to: day,
  stages: z.array(z.object({ status: z.enum(JOB_STATUSES), averageHours: z.number().nullable() })),
  jobs: z.array(
    z.object({
      id: uuid,
      referenceNumber: z.string(),
      patientName: z.string(),
      clientName: z.string().nullable(),
      status: z.enum(JOB_STATUSES),
      hours: z.number(),
      slow: z.boolean(),
    }),
  ),
});

export const LabJobHistoryQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(JOB_STATUSES).optional(),
  from: day.optional(),
  to: day.optional(),
});

export const LabJobHistorySchema = z.object({
  jobs: z.array(
    z.object({
      id: uuid,
      referenceNumber: z.string(),
      patientName: z.string(),
      clientName: z.string().nullable(),
      status: z.enum(JOB_STATUSES),
      createdAt: z.string(),
      completedAt: z.string().nullable(),
      isUrgent: z.boolean(),
    }),
  ),
});

export type LabInventoryItem = z.infer<typeof LabInventoryItemSchema>;
export type SaveLabInventoryRequest = z.infer<typeof SaveLabInventorySchema>;
export type AdjustLabStockRequest = z.infer<typeof AdjustLabStockSchema>;
export type LabClientRow = z.infer<typeof LabClientRowSchema>;
export type LabClientJobs = z.infer<typeof LabClientJobsSchema>;
export type LabJobActivity = z.infer<typeof LabJobActivitySchema>;
export type LabTurnaround = z.infer<typeof LabTurnaroundSchema>;
export type LabJobHistory = z.infer<typeof LabJobHistorySchema>;
