import type { NextFunction, Request, Response } from 'express';
import { ACTIVE_SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '@optiworld/shared';

import { AppError } from '../lib/errors.js';

export function requireActiveSubscription(req: Request, _res: Response, next: NextFunction): void {
  const status = req.auth?.subscriptionStatus;
  if (!status || !isActiveSubscription(status)) {
    next(new AppError(403, 'SUBSCRIPTION_INACTIVE', 'An active subscription is required'));
    return;
  }
  next();
}

function isActiveSubscription(status: SubscriptionStatus): boolean {
  return (ACTIVE_SUBSCRIPTION_STATUSES as readonly SubscriptionStatus[]).includes(status);
}
