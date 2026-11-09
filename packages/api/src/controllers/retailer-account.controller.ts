import type { Request, Response } from 'express';
import type { AuthSessionUser } from '@optiworld/shared';
import {
  CreateRetailerStaffSchema,
  UpdateRetailerAccountSchema,
  UpdateRetailerShopProfileSchema,
  UpdateRetailerStaffSchema,
} from '@optiworld/shared';
import { z } from 'zod';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import {
  createRetailerStaff,
  deleteRetailerStaff,
  getRetailerSessionProfile,
  listRetailerStaff,
  updateRetailerAccount,
  updateRetailerShopProfile,
  updateRetailerStaff,
} from '../services/retailer-account.service.js';

const UserIdSchema = z.object({ userId: z.string().uuid() });

export function createRetailerAccountController() {
  return {
    profile: asyncHandler(async (req: Request, res: Response) => {
      const data = await getRetailerSessionProfile(session(req));
      res.status(200).json({ success: true, data });
    }),
    updateProfile: asyncHandler(async (req: Request, res: Response) => {
      const input = UpdateRetailerShopProfileSchema.parse(req.body);
      const data = await updateRetailerShopProfile(session(req), input);
      res.status(200).json({ success: true, data });
    }),
    updateAccount: asyncHandler(async (req: Request, res: Response) => {
      const input = UpdateRetailerAccountSchema.parse(req.body);
      const data = await updateRetailerAccount(session(req), input);
      res.status(200).json({ success: true, data });
    }),
    staff: asyncHandler(async (req: Request, res: Response) => {
      const data = await listRetailerStaff(session(req));
      res.status(200).json({ success: true, data });
    }),
    createStaff: asyncHandler(async (req: Request, res: Response) => {
      const input = CreateRetailerStaffSchema.parse(req.body);
      const data = await createRetailerStaff(session(req), input);
      res.status(201).json({ success: true, data });
    }),
    updateStaff: asyncHandler(async (req: Request, res: Response) => {
      const params = UserIdSchema.parse(req.params);
      const input = UpdateRetailerStaffSchema.parse(req.body);
      const data = await updateRetailerStaff(session(req), params.userId, input);
      res.status(200).json({ success: true, data });
    }),
    deleteStaff: asyncHandler(async (req: Request, res: Response) => {
      const params = UserIdSchema.parse(req.params);
      const data = await deleteRetailerStaff(session(req), params.userId);
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
