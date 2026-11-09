import type { Request, Response } from 'express';
import {
  AdminOrgListQuerySchema,
  AdminSubscriptionQuerySchema,
  AdminUserQuerySchema,
  CreateAdminOrgSchema,
  InviteOrganisationSchema,
  PatchAdminOrgSchema,
  PatchAdminSubscriptionSchema,
  PatchAdminUserSchema,
} from '@optiworld/shared';
import { z } from 'zod';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import {
  createAdminOrganisation,
  getAdminOrganisation,
  inviteOrganisation,
  listAdminOrganisations,
  updateAdminOrganisation,
  updateAdminSubscription,
} from '../services/admin-organisations.service.js';
import {
  extendExpiringWeek,
  getAdminDashboard,
  getPlatformHealth,
  listAdminSubscriptions,
  listAdminUsers,
  updateAdminUser,
} from '../services/admin-portal.service.js';
import type { Mailer } from '../services/mailer.js';

const IdSchema = z.object({ id: z.string().uuid() });

export function createAdminController(mailer: Mailer) {
  return {
    dashboard: asyncHandler(async (_req: Request, res: Response) => {
      res.status(200).json({ success: true, data: await getAdminDashboard() });
    }),
    organisations: asyncHandler(async (req: Request, res: Response) => {
      const query = AdminOrgListQuerySchema.parse(cleanQuery(req.query));
      res.status(200).json({ success: true, data: await listAdminOrganisations(query) });
    }),
    createOrganisation: asyncHandler(async (req: Request, res: Response) => {
      const input = CreateAdminOrgSchema.parse(req.body);
      const data = await createAdminOrganisation(adminId(req), input, mailer);
      res.status(201).json({ success: true, data });
    }),
    invite: asyncHandler(async (req: Request, res: Response) => {
      const input = InviteOrganisationSchema.parse(req.body);
      const data = await inviteOrganisation(adminId(req), input, mailer);
      res.status(200).json({ success: true, data });
    }),
    organisation: asyncHandler(async (req: Request, res: Response) => {
      const params = IdSchema.parse(req.params);
      res.status(200).json({ success: true, data: await getAdminOrganisation(params.id) });
    }),
    updateOrganisation: asyncHandler(async (req: Request, res: Response) => {
      const params = IdSchema.parse(req.params);
      const input = PatchAdminOrgSchema.parse(req.body);
      res
        .status(200)
        .json({
          success: true,
          data: await updateAdminOrganisation(adminId(req), params.id, input),
        });
    }),
    updateSubscription: asyncHandler(async (req: Request, res: Response) => {
      const params = IdSchema.parse(req.params);
      const input = PatchAdminSubscriptionSchema.parse(req.body);
      res
        .status(200)
        .json({
          success: true,
          data: await updateAdminSubscription(adminId(req), params.id, input),
        });
    }),
    subscriptions: asyncHandler(async (req: Request, res: Response) => {
      const query = AdminSubscriptionQuerySchema.parse(cleanQuery(req.query));
      res.status(200).json({ success: true, data: await listAdminSubscriptions(query.filter) });
    }),
    extendWeek: asyncHandler(async (req: Request, res: Response) => {
      res.status(200).json({ success: true, data: await extendExpiringWeek(adminId(req)) });
    }),
    users: asyncHandler(async (req: Request, res: Response) => {
      const query = AdminUserQuerySchema.parse(cleanQuery(req.query));
      res.status(200).json({ success: true, data: await listAdminUsers(query) });
    }),
    updateUser: asyncHandler(async (req: Request, res: Response) => {
      const params = IdSchema.parse(req.params);
      const input = PatchAdminUserSchema.parse(req.body);
      res
        .status(200)
        .json({
          success: true,
          data: await updateAdminUser(adminId(req), params.id, input.isActive),
        });
    }),
    health: asyncHandler(async (_req: Request, res: Response) => {
      res.status(200).json({ success: true, data: await getPlatformHealth() });
    }),
  };
}

function adminId(req: Request): string {
  if (!req.auth || req.auth.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'Super admin access is required');
  }
  return req.auth.userId;
}

function cleanQuery(query: Request['query']): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value.length > 0) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}
