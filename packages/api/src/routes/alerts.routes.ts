import { Router } from 'express';

import { createAlertsController } from '../controllers/alerts.controller.js';
import { requireActiveOrg } from '../middleware/require-active-org.middleware.js';
import { requireAuth } from '../middleware/require-auth.middleware.js';

export function createAlertsRouter(): Router {
  const router = Router();
  const alerts = createAlertsController();
  const chain = [requireAuth, requireActiveOrg] as const;
  router.get('/', ...chain, alerts.list);
  router.patch('/read-all', ...chain, alerts.readAll);
  router.patch('/:id/read', ...chain, alerts.readOne);
  return router;
}
