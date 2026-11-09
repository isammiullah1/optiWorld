import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../lib/errors.js';

export function requireActiveOrg(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(new AppError(401, 'UNAUTHORIZED', 'Sign in is required'));
    return;
  }
  if (req.auth.orgStatus !== 'ACTIVE') {
    next(new AppError(403, 'FORBIDDEN', 'This organisation is not active'));
    return;
  }
  if (req.auth.subscriptionStatus !== 'ACTIVE') {
    next(new AppError(403, 'SUBSCRIPTION_INACTIVE', 'An active subscription is required'));
    return;
  }
  next();
}
