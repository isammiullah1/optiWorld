import { prisma } from '@optiworld/db';
import { Router } from 'express';

import { asyncHandler } from '../lib/async-handler.js';
import { readBillLogo } from '../lib/bill-logo-store.js';
import { AppError } from '../lib/errors.js';

const LOGO_KEY = /^[a-f0-9]{32}\.(png|jpg|webp)$/;

export function createPublicBillLogoRouter(): Router {
  const router = Router();
  router.get(
    '/:key',
    asyncHandler(async (req, res) => {
      const key = typeof req.params.key === 'string' ? req.params.key : '';
      if (!LOGO_KEY.test(key)) {
        throw new AppError(404, 'NOT_FOUND', 'This logo was not found');
      }
      const org = await prisma.organisation.findFirst({
        where: { billLogoKey: key, deletedAt: null },
        select: { id: true },
      });
      const file = org ? await readBillLogo(key) : null;
      if (!file) {
        throw new AppError(404, 'NOT_FOUND', 'This logo was not found');
      }
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.type(file.contentType);
      res.send(file.bytes);
    }),
  );
  return router;
}
