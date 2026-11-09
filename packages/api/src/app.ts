import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { getEnv } from './config/env.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { createAdminRouter } from './routes/admin.routes.js';
import { createPublicBillLogoRouter } from './routes/bill-logo.routes.js';
import { createAlertsRouter } from './routes/alerts.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createCatalogRouter } from './routes/catalog.routes.js';
import { createLabJobsRouter, createLabRouter } from './routes/lab-jobs.routes.js';
import { createImportRouter } from './routes/import.routes.js';
import { createOnboardingRouter } from './routes/onboarding.routes.js';
import { createOrderChatRouter } from './routes/order-chat.routes.js';
import { createRetailerRouter } from './routes/retailer.routes.js';
import { createSyncRouter } from './routes/sync.routes.js';
import { createWhatsAppRouter } from './routes/whatsapp.routes.js';
import { createWholesalerRouter } from './routes/wholesaler.routes.js';
import type { Mailer } from './services/mailer.js';

export function createApp(options?: { mailer?: Mailer }): Express {
  const env = getEnv();
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: [env.NEXTAUTH_URL, env.ADMIN_NEXTAUTH_URL].filter(Boolean),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ success: true, data: { status: 'ok' } });
  });

  app.use('/api/v1/alerts', createAlertsRouter());
  app.use('/api/v1/auth', createAuthRouter(options?.mailer));
  app.use('/api/v1/admin', createAdminRouter(options?.mailer));
  app.use('/api/v1/onboarding', createOnboardingRouter());
  app.use('/api/v1/import', createImportRouter());
  app.use('/api/v1/public/bill-logos', createPublicBillLogoRouter());
  app.use('/api/v1/retailer', createRetailerRouter());
  app.use('/api/v1/sync', createSyncRouter());
  app.use('/api/v1/whatsapp', createWhatsAppRouter());
  app.use('/api/v1/catalog', createCatalogRouter());
  app.use('/api/v1/lab-jobs', createLabJobsRouter());
  app.use('/api/v1/lab', createLabRouter());
  app.use('/api/v1/orders', createOrderChatRouter());
  app.use('/api/v1/wholesaler', createWholesalerRouter());
  app.use(errorMiddleware);

  return app;
}
