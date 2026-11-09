import { z } from 'zod';

import { CHANGE_RESPONSE_ACTIONS } from '../enums/index.js';

const uuid = z.string().uuid();
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);

export const JoinOrderChatSchema = z.object({
  orderId: uuid,
});

export const SendMessageSchema = z.object({
  orderId: uuid,
  content: z.string().trim().min(1).max(2_000),
  messageType: z.enum(['TEXT', 'SYSTEM']).default('TEXT'),
});

export const ProposedOrderChangeSchema = z.object({
  catalogProductId: uuid,
  quantity: z.number().int().positive().max(100_000),
  agreedPrice: money.nullable(),
  productName: z.string().trim().min(1).max(160).optional(),
  fromQuantity: z.number().int().nonnegative().max(100_000).optional(),
});

export const OrderAmendmentLineSchema = z.object({
  productName: z.string(),
  fromQuantity: z.number().int().nonnegative(),
  toQuantity: z.number().int().positive(),
});

export const ProposeChangeSchema = z.object({
  orderId: uuid,
  changes: z.array(ProposedOrderChangeSchema).min(1).max(20),
});

export const RespondToChangeSchema = z.object({
  changeRequestId: uuid,
  action: z.enum(CHANGE_RESPONSE_ACTIONS),
});

export const ConfirmOrderSchema = z.object({
  orderId: uuid,
});

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(['DISPATCHED', 'DELIVERED']),
});

export const OrderIdParamSchema = z.object({
  orderId: uuid,
});

export type ProposedOrderChange = z.infer<typeof ProposedOrderChangeSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type ProposeChangeInput = z.infer<typeof ProposeChangeSchema>;
export type RespondToChangeInput = z.infer<typeof RespondToChangeSchema>;
