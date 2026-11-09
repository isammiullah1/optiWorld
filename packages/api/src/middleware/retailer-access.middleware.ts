import type { NextFunction, Request, Response } from 'express';
import type { RetailerFeature } from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import {
  assertRetailerAnyFeature,
  assertRetailerFeature,
} from '../services/retailer-account.service.js';

export function requireRetailerFeature(feature: RetailerFeature) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, 'UNAUTHORIZED', 'Sign in is required'));
      return;
    }
    void assertRetailerFeature(req.auth, feature)
      .then(() => next())
      .catch(next);
  };
}

export function requireRetailerAnyFeature(features: readonly RetailerFeature[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(new AppError(401, 'UNAUTHORIZED', 'Sign in is required'));
      return;
    }
    void assertRetailerAnyFeature(req.auth, features)
      .then(() => next())
      .catch(next);
  };
}
