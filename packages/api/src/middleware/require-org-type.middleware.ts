import type { NextFunction, Request, Response } from 'express';
import type { OrgType } from '@optiworld/shared';

import { AppError } from '../lib/errors.js';

export function requireOrgType(...types: readonly OrgType[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const orgType = req.auth?.orgType;
    if (!orgType || !types.includes(orgType)) {
      next(new AppError(403, 'FORBIDDEN', 'This area is not available for your organisation'));
      return;
    }
    next();
  };
}
