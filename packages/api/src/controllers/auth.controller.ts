import type { Request, Response } from 'express';
import {
  ForgotPasswordSchema,
  LoginSchema,
  RefreshTokenSchema,
  ResetPasswordSchema,
} from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import * as authService from '../services/auth.service.js';
import type { Mailer } from '../services/mailer.js';

export function createAuthController(mailer: Mailer) {
  return {
    login: asyncHandler(async (req: Request, res: Response) => {
      const body = LoginSchema.parse(req.body);
      const data = await authService.login(body.email, body.password);
      res.status(200).json({ success: true, data });
    }),

    refresh: asyncHandler(async (req: Request, res: Response) => {
      const body = RefreshTokenSchema.parse(req.body);
      const data = await authService.refresh(body.refreshToken);
      res.status(200).json({ success: true, data });
    }),

    logout: asyncHandler(async (req: Request, res: Response) => {
      const body = RefreshTokenSchema.parse(req.body);
      await authService.logout(body.refreshToken);
      res.status(200).json({ success: true, data: { revoked: true } });
    }),

    forgotPassword: asyncHandler(async (req: Request, res: Response) => {
      const body = ForgotPasswordSchema.parse(req.body);
      const message = await authService.forgotPassword(body.email, mailer);
      res.status(200).json({ success: true, data: { message } });
    }),

    validateResetPassword: asyncHandler(async (req: Request, res: Response) => {
      const body = ResetPasswordSchema.pick({ token: true }).parse(req.body);
      await authService.validatePasswordResetToken(body.token);
      res.status(200).json({ success: true, data: { valid: true } });
    }),

    resetPassword: asyncHandler(async (req: Request, res: Response) => {
      const body = ResetPasswordSchema.parse(req.body);
      const { email } = await authService.resetPassword(body.token, body.password);
      res.status(200).json({ success: true, data: { reset: true, email } });
    }),

    me: asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
      }
      const user = await authService.getCurrentUser(req.auth.userId);
      res.status(200).json({ success: true, data: user });
    }),
  };
}
