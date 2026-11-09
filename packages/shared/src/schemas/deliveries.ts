import { z } from 'zod';

const uuid = z.string().uuid();
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);

export const DELIVERY_BOARDS = ['READY', 'DELIVERED'] as const;

export const DeliveryRowSchema = z.object({
  id: uuid,
  invoiceId: uuid,
  invoiceNumber: z.number().int().positive(),
  customerName: z.string(),
  address: z.string(),
  charge: money,
  total: money,
  references: z.string(),
  readyAt: z.string().datetime().nullable(),
  deliveredAt: z.string().datetime().nullable(),
});

export type DeliveryRow = z.infer<typeof DeliveryRowSchema>;

export const DeliveryListQuerySchema = z.object({
  readyPage: z.coerce.number().int().positive().default(1),
  deliveredPage: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(40).default(10),
});

export type DeliveryListQuery = z.infer<typeof DeliveryListQuerySchema>;

export const DeliveryListSchema = z.object({
  ready: z.array(DeliveryRowSchema),
  readyTotal: z.number().int().nonnegative(),
  delivered: z.array(DeliveryRowSchema),
  deliveredTotal: z.number().int().nonnegative(),
});

export type DeliveryList = z.infer<typeof DeliveryListSchema>;

export const MarkDeliveredResultSchema = z.object({
  id: uuid,
  sent: z.boolean(),
  message: z.string(),
});

export type MarkDeliveredResult = z.infer<typeof MarkDeliveredResultSchema>;
