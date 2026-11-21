import { z } from 'zod';

import { JOB_STATUSES } from '../enums/index.js';
import { isShopPhone, shopPhoneMessage } from '../phone/shop-phone.js';

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

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const signedMoney = z.string().regex(/^-?\d{1,10}(\.\d{1,2})?$/);

export const LabInventoryItemSchema = z.object({
  id: uuid,
  name: z.string(),
  category: z.string(),
  quantity: quantity,
  unit: z.string(),
  unitCost: money.nullable(),
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
    unitCost: money,
  }),
  z.object({
    kind: z.literal('USAGE'),
    quantity: positiveQuantity,
    labJobId: uuid.optional().or(z.literal('')),
  }),
]);

const optionalDetail = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

export const SaveExternalLabClientSchema = z.object({
  name: z.string().trim().min(1, 'Enter the retailer name.').max(120),
  phone: z
    .string()
    .trim()
    .max(30, 'Phone must be 30 characters or fewer.')
    .optional()
    .or(z.literal(''))
    .superRefine((value, ctx) => {
      const phone = value ?? '';
      if (phone.length > 0 && !isShopPhone(phone)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: shopPhoneMessage(phone) });
      }
    }),
  city: optionalDetail(80),
  address: optionalDetail(240),
  about: optionalDetail(500),
});

export type SaveExternalLabClientRequest = z.infer<typeof SaveExternalLabClientSchema>;

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
  activeJobs: z.number().int().nonnegative(),
  outstanding: money,
  liveJobs: z.array(
    z.object({
      id: uuid,
      referenceNumber: z.string(),
      patientName: z.string(),
      status: z.enum(JOB_STATUSES),
    }),
  ),
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

const nullableMoney = money.nullable();
const count = z.number().int().nonnegative();

export const LabIncomeQuerySchema = z.object({
  from: day,
  to: day,
  party: z.string().trim().max(40).optional(),
  service: z.string().trim().max(80).optional(),
  billStatus: z.enum(['OPEN', 'ISSUED', 'CLEARED', 'VOID']).optional(),
  status: z.enum(JOB_STATUSES).optional(),
  urgent: z.enum(['true', 'false']).optional(),
  finishedBy: uuid.optional(),
});

const partyRank = z.object({
  id: z.string(),
  name: z.string(),
  jobs: count,
  income: money,
  outstanding: money,
  average: money,
});

export const LabIncomeSchema = z.object({
  from: day,
  to: day,
  summary: z.object({
    finishedSales: count,
    income: money,
    discount: money,
    adjustments: signedMoney,
    collected: money,
    outstanding: money,
    shopIncome: money,
    walkInIncome: money,
    materialCost: nullableMoney,
    profit: signedMoney.nullable(),
    costMissing: z.boolean(),
    openOnFinished: count,
    openValue: money,
    voided: count,
  }),
  daily: z.array(
    z.object({
      date: day,
      jobs: count,
      income: money,
      collected: money,
      outstanding: money,
    }),
  ),
  retailers: z.array(partyRank),
  clients: z.array(partyRank),
  services: z.array(
    z.object({
      name: z.string(),
      jobs: count,
      quantity: count,
      income: money,
    }),
  ),
  finishers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      jobs: count,
      income: money,
    }),
  ),
  openJobs: z.array(
    z.object({
      id: uuid,
      referenceNumber: z.string(),
      customerName: z.string(),
      partyName: z.string(),
      finishedOn: day,
      total: money,
    }),
  ),
  voidedJobs: z.array(
    z.object({
      id: uuid,
      referenceNumber: z.string(),
      customerName: z.string(),
      partyName: z.string(),
      finishedOn: day,
      total: money,
    }),
  ),
  sales: z.array(
    z.object({
      id: uuid,
      referenceNumber: z.string(),
      customerName: z.string(),
      partyName: z.string(),
      partyKind: z.enum(['SHOP', 'WALK_IN']),
      finishedOn: day,
      services: z.string(),
      income: money,
      materialCost: nullableMoney,
      profit: signedMoney.nullable(),
      costMissing: z.boolean(),
      billStatus: z.enum(['ISSUED', 'CLEARED']),
      finishedBy: z.string(),
    }),
  ),
  usedOnSales: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      quantity: z.string(),
      unit: z.string(),
      jobs: count,
      cost: nullableMoney,
      costMissing: z.boolean(),
    }),
  ),
  received: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      quantity: z.string(),
      unit: z.string(),
      supplier: z.string(),
      occurredOn: day,
      unitCost: nullableMoney,
    }),
  ),
  unassignedUse: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      quantity: z.string(),
      unit: z.string(),
      occurredOn: day,
    }),
  ),
  lowStock: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      quantity: z.string(),
      unit: z.string(),
      reorderLevel: z.string(),
    }),
  ),
});

export type LabIncomeQuery = z.infer<typeof LabIncomeQuerySchema>;
export type LabIncome = z.infer<typeof LabIncomeSchema>;

export type LabInventoryItem = z.infer<typeof LabInventoryItemSchema>;
export type SaveLabInventoryRequest = z.infer<typeof SaveLabInventorySchema>;
export type AdjustLabStockRequest = z.infer<typeof AdjustLabStockSchema>;
export type LabClientRow = z.infer<typeof LabClientRowSchema>;
export type LabClientJobs = z.infer<typeof LabClientJobsSchema>;
export type LabJobActivity = z.infer<typeof LabJobActivitySchema>;
export type LabTurnaround = z.infer<typeof LabTurnaroundSchema>;
export type LabJobHistory = z.infer<typeof LabJobHistorySchema>;
