import { Router } from 'express';

import { createCatalogOrdersController } from '../controllers/catalog-orders.controller.js';
import { applyVisibilityMode } from '../middleware/apply-visibility-mode.middleware.js';
import { requireActiveOrg } from '../middleware/require-active-org.middleware.js';
import { requireApprovedConnection } from '../middleware/require-approved-connection.middleware.js';
import { requireAuth } from '../middleware/require-auth.middleware.js';
import { requireOrgType } from '../middleware/require-org-type.middleware.js';

const retailer = [requireAuth, requireActiveOrg, requireOrgType('RETAILER')] as const;

export function createCatalogRouter(): Router {
  const router = Router();
  const catalog = createCatalogOrdersController();
  router.get('/search', (_req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  });
  router.get(
    '/:wholesalerId',
    ...retailer,
    requireApprovedConnection('wholesalerId'),
    applyVisibilityMode,
    catalog.catalog,
  );
  return router;
}
