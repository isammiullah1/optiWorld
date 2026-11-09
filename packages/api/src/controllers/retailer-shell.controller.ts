import type { Request, Response } from 'express';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import { getRetailerShell } from '../services/retailer-shell.service.js';

export function createRetailerShellController() {
  return {
    shell: asyncHandler(async (req: Request, res: Response) => {
      if (!req.auth) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
      }
      const data = await getRetailerShell(req.auth);
      res.status(200).json({ success: true, data });
    }),
  };
}
