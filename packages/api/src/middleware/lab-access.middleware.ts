import type { NextFunction, Request, Response } from 'express';
import { prisma } from '@optiworld/db';
import type { LabFeature } from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { assertLabFeature } from '../services/lab-account.service.js';

export function requireActiveLabUser(req: Request, _res: Response, next: NextFunction): void {
  const auth = req.auth;
  if (!auth?.userId || !auth.orgId) {
    next(new AppError(401, 'UNAUTHORIZED', 'Sign in is required'));
    return;
  }
  void prisma.user
    .findFirst({
      where: { id: auth.userId, orgId: auth.orgId, isActive: true },
      select: { id: true },
    })
    .then((user) => {
      if (!user) {
        next(new AppError(403, 'FORBIDDEN', 'This account is inactive'));
        return;
      }
      next();
    })
    .catch(next);
}

export function requireLabFeature(feature: LabFeature) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, 'UNAUTHORIZED', 'Sign in is required'));
      return;
    }
    void assertLabFeature(req.auth, feature)
      .then(() => next())
      .catch(next);
  };
}
