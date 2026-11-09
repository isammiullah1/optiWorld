import { Router } from 'express';

import { createImportController } from '../controllers/import.controller.js';
import { requireAuth } from '../middleware/require-auth.middleware.js';
import { requireOrgType } from '../middleware/require-org-type.middleware.js';
import { requireRole } from '../middleware/require-role.middleware.js';

const retailerOwner = [requireAuth, requireOrgType('RETAILER'), requireRole('OWNER')] as const;

export function createImportRouter(): Router {
  const router = Router();
  const controller = createImportController();
  router.get('/templates/:kind', ...retailerOwner, controller.template);
  router.post('/customers', ...retailerOwner, controller.customers);
  router.post('/inventory', ...retailerOwner, controller.inventory);
  router.post('/dues', ...retailerOwner, controller.dues);
  return router;
}
