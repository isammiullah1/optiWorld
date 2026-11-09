import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { getEnv } from '../config/env.js';
import { createOnboardingController } from '../controllers/onboarding.controller.js';

export function createOnboardingRouter(): Router {
  const router = Router();
  const controller = createOnboardingController();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => getEnv().NODE_ENV === 'test',
    message: {
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Too many attempts. Try again later.' },
    },
  });
  router.post('/complete', limiter, controller.complete);
  router.get('/invite', limiter, controller.previewInvite);
  router.post('/accept-invite', limiter, controller.acceptInvite);
  return router;
}
