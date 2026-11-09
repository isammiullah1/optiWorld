import type { Request, Response } from 'express';
import {
  OrderIdParamSchema,
  UpdateOrderStatusSchema,
  type AuthSessionUser,
} from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import { emitOrderBroadcasts } from '../realtime/hub.js';
import { notifyRetailerOrderStatus } from '../services/order-notify.service.js';
import {
  confirmOrder,
  getOrderChat,
  getSuggestedReplies,
  requestConfirmedCancellation,
  updateOrderStatus,
} from '../services/order-chat.service.js';

export function createOrderChatController(): {
  messages: ReturnType<typeof asyncHandler>;
  suggestedReplies: ReturnType<typeof asyncHandler>;
  updateStatus: ReturnType<typeof asyncHandler>;
  confirm: ReturnType<typeof asyncHandler>;
  requestCancellation: ReturnType<typeof asyncHandler>;
} {
  return {
    messages: asyncHandler(async (req: Request, res: Response) => {
      const { orderId } = OrderIdParamSchema.parse(req.params);
      const data = await getOrderChat(session(req), orderId);
      res.status(200).json({ success: true, data });
    }),
    suggestedReplies: asyncHandler(async (req: Request, res: Response) => {
      const { orderId } = OrderIdParamSchema.parse(req.params);
      const data = await getSuggestedReplies(session(req), orderId);
      res.status(200).json({ success: true, data });
    }),
    updateStatus: asyncHandler(async (req: Request, res: Response) => {
      const { orderId } = OrderIdParamSchema.parse(req.params);
      const body = UpdateOrderStatusSchema.parse(req.body);
      const outcome = await updateOrderStatus(session(req), orderId, body.status);
      emitOrderBroadcasts(orderId, outcome.broadcasts);
      const whatsapp = await notifyRetailerOrderStatus(session(req), orderId, body.status);
      res.status(200).json({ success: true, data: { ...outcome.result, whatsapp } });
    }),
    confirm: asyncHandler(async (req: Request, res: Response) => {
      const { orderId } = OrderIdParamSchema.parse(req.params);
      const outcome = await confirmOrder(session(req), orderId);
      emitOrderBroadcasts(orderId, outcome.broadcasts);
      res.status(200).json({ success: true, data: outcome.result });
    }),
    requestCancellation: asyncHandler(async (req: Request, res: Response) => {
      const { orderId } = OrderIdParamSchema.parse(req.params);
      const data = await requestConfirmedCancellation(session(req), orderId);
      res.status(200).json({ success: true, data });
    }),
  };
}

function session(req: Request): AuthSessionUser {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  return req.auth;
}
