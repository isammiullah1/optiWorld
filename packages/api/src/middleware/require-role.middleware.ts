import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@optiworld/shared';

import { AppError } from '../lib/errors.js';

export function requireRole(...roles: readonly UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.auth?.role;
    if (!role || !roles.includes(role)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have permission for this action'));
      return;
    }
    next();
  };
}
