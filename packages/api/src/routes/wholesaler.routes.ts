import { Router } from 'express';

import { createWholesalerController } from '../controllers/wholesaler.controller.js';
import { requireActiveOrg } from '../middleware/require-active-org.middleware.js';
import { requireAuth } from '../middleware/require-auth.middleware.js';
import { requireOrgType } from '../middleware/require-org-type.middleware.js';
import { requireRole } from '../middleware/require-role.middleware.js';

const chain = [
  requireAuth,
  requireActiveOrg,
  requireOrgType('WHOLESALER'),
  requireRole('ADMIN', 'ORDER_HANDLER'),
] as const;

export function createWholesalerRouter(): Router {
  const router = Router();
  const controller = createWholesalerController();

  router.get('/profile', ...chain, controller.profile);
  router.patch('/profile', ...chain, controller.updateProfile);
  router.get('/reports/order-activity/export', ...chain, controller.exportOrderHistory);
  router.get('/reports/order-activity', ...chain, controller.orderActivity);
  router.get('/reports/catalog-activity', ...chain, controller.catalogActivity);
  router.get('/shell', ...chain, controller.shell);
  router.get('/dashboard', ...chain, controller.dashboard);
  router.get('/orders', ...chain, controller.orders);
  router.get('/retailers/search', ...chain, controller.searchRetailers);
  router.post('/retailers/connect', ...chain, controller.connectRetailer);
  router.get('/connections', ...chain, controller.connections);
  router.get('/quote-requests', ...chain, controller.quoteRequests);
  router.patch('/connections/:connectionId/approve', ...chain, controller.approveConnection);
  router.patch('/connections/:connectionId/decline', ...chain, controller.declineConnection);
  router.patch('/connections/:connectionId/cancel', ...chain, controller.cancelConnection);
  router.patch('/connections/:connectionId/visibility', ...chain, controller.updateVisibility);
  router.get('/catalog/categories', ...chain, controller.categories);
  router.post('/catalog/categories', ...chain, controller.createCategory);
  router.patch('/catalog/availability', ...chain, controller.setAvailability);
  router.get('/catalog', ...chain, controller.listCatalog);
  router.post('/catalog', ...chain, controller.createProduct);
  router.patch('/catalog/:productId', ...chain, controller.updateProduct);
  router.delete('/catalog/:productId', ...chain, controller.deleteProduct);

  return router;
}
