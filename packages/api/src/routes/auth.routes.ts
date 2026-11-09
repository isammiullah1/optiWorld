import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { getEnv } from '../config/env.js';
import { requireAuth } from '../middleware/require-auth.middleware.js';
import { createAuthController } from '../controllers/auth.controller.js';
import { createSendGridMailer, type Mailer } from '../services/mailer.js';

export function createAuthRouter(mailer: Mailer = createSendGridMailer()): Router {
  const router = Router();
  const controller = createAuthController(mailer);
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => getEnv().NODE_ENV === 'test',
    message: {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Too many attempts. Try again later.',
      },
    },
  });
  const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => getEnv().NODE_ENV === 'test',
    message: {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Too many reset requests. Try again later.',
      },
    },
  });

  router.post('/login', loginLimiter, controller.login);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.post('/forgot-password', forgotPasswordLimiter, controller.forgotPassword);
  router.post('/reset-password/validate', controller.validateResetPassword);
  router.post('/reset-password', controller.resetPassword);
  router.get('/me', requireAuth, controller.me);

  return router;
}
