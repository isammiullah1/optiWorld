import type { Request, Response } from 'express';
import type { AuthSessionUser } from '@optiworld/shared';
import {
  CreateLabStaffSchema,
  UpdateLabAccountSchema,
  UpdateLabProfileSchema,
  UpdateLabStaffSchema,
} from '@optiworld/shared';
import { z } from 'zod';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import {
  createLabStaff,
  deleteLabStaff,
  getLabSessionProfile,
  listLabStaff,
  updateLabAccount,
  updateLabProfile,
  updateLabStaff,
} from '../services/lab-account.service.js';

const UserIdSchema = z.object({ userId: z.string().uuid() });

export function createLabAccountController() {
  return {
    profile: asyncHandler(async (req: Request, res: Response) => {
      const data = await getLabSessionProfile(session(req));
      res.status(200).json({ success: true, data });
    }),
    updateProfile: asyncHandler(async (req: Request, res: Response) => {
      const input = UpdateLabProfileSchema.parse(req.body);
      const data = await updateLabProfile(session(req), input);
      res.status(200).json({ success: true, data });
    }),
    updateAccount: asyncHandler(async (req: Request, res: Response) => {
      const input = UpdateLabAccountSchema.parse(req.body);
      const data = await updateLabAccount(session(req), input);
      res.status(200).json({ success: true, data });
    }),
    staff: asyncHandler(async (req: Request, res: Response) => {
      const data = await listLabStaff(session(req));
      res.status(200).json({ success: true, data });
    }),
    createStaff: asyncHandler(async (req: Request, res: Response) => {
      const input = CreateLabStaffSchema.parse(req.body);
      const data = await createLabStaff(session(req), input);
      res.status(201).json({ success: true, data });
    }),
    updateStaff: asyncHandler(async (req: Request, res: Response) => {
      const params = UserIdSchema.parse(req.params);
      const input = UpdateLabStaffSchema.parse(req.body);
      const data = await updateLabStaff(session(req), params.userId, input);
      res.status(200).json({ success: true, data });
    }),
    deleteStaff: asyncHandler(async (req: Request, res: Response) => {
      const params = UserIdSchema.parse(req.params);
      const data = await deleteLabStaff(session(req), params.userId);
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
