import type { Request, Response } from 'express';
import { z } from 'zod';

import { AlertListQuerySchema } from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import {
  listOrgAlerts,
  markAllOrgAlertsRead,
  markOrgAlertRead,
} from '../services/retailer-dashboard.service.js';

export function createAlertsController() {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const query = AlertListQuerySchema.parse(req.query);
      const result = await listOrgAlerts(requireSession(req), {
        limit: query.limit,
        includeRead: query.includeRead === 'true',
        category: query.category ?? 'ALL',
      });
      res.status(200).json({ success: true, data: result.rows, meta: result.meta });
    }),
    readOne: asyncHandler(async (req: Request, res: Response) => {
      const params = z.object({ id: z.string().uuid() }).parse(req.params);
      const data = await markOrgAlertRead(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    readAll: asyncHandler(async (req: Request, res: Response) => {
      const data = await markAllOrgAlertsRead(requireSession(req));
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
