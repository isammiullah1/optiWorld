import { Router } from 'express';

import { createSyncController } from '../controllers/sync.controller.js';
import { requireActiveOrg } from '../middleware/require-active-org.middleware.js';
import { requireActiveSubscription } from '../middleware/require-active-subscription.middleware.js';
import { requireAuth } from '../middleware/require-auth.middleware.js';
import { requireOrgType } from '../middleware/require-org-type.middleware.js';
import { requireRole } from '../middleware/require-role.middleware.js';

const retailerChain = [
  requireAuth,
  requireActiveOrg,
  requireOrgType('RETAILER'),
  requireRole('OWNER', 'STAFF'),
  requireActiveSubscription,
] as const;

export function createSyncRouter(): Router {
  const router = Router();
  const controller = createSyncController();

  router.post('/push', ...retailerChain, controller.push);
  router.get('/pull', ...retailerChain, controller.pull);
  router.post('/resolve-conflict', ...retailerChain, controller.resolveConflict);

  return router;
}
