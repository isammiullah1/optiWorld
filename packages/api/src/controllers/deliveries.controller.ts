import type { Request, Response } from 'express';
import { DeliveryListQuerySchema } from '@optiworld/shared';
import { z } from 'zod';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import { listDeliveries, markDelivered } from '../services/deliveries.service.js';

const DeliveryIdSchema = z.object({ id: z.string().uuid() });

export function createDeliveriesController() {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const query = DeliveryListQuerySchema.parse(req.query);
      const data = await listDeliveries(requireSession(req), query);
      res.status(200).json({ success: true, data });
    }),
    deliver: asyncHandler(async (req: Request, res: Response) => {
      const params = DeliveryIdSchema.parse(req.params);
      const data = await markDelivered(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
  };
}

function requireSession(req: Request) {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  return req.auth;
}
