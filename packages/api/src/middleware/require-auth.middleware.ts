import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHORIZED', 'Sign in is required'));
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    next(new AppError(401, 'UNAUTHORIZED', 'Sign in is required'));
    return;
  }

  try {
    const session = verifyAccessToken(token);
    req.auth = session;
    req.user = {
      userId: session.userId,
      orgId: session.orgId,
      orgType: session.orgType,
      role: session.role,
    };
    next();
  } catch (error) {
    next(error);
  }
}
