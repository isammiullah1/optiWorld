import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../lib/errors.js';

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'SUPER_ADMIN' || req.auth.orgId !== null) {
    next(new AppError(403, 'FORBIDDEN', 'Super admin access is required'));
    return;
  }
  next();
}
