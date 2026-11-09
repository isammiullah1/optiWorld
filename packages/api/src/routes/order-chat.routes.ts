import { Router } from 'express';

import { createCatalogOrdersController } from '../controllers/catalog-orders.controller.js';
import { createOrderChatController } from '../controllers/order-chat.controller.js';
import { requireActiveOrg } from '../middleware/require-active-org.middleware.js';
import { requireActiveSubscription } from '../middleware/require-active-subscription.middleware.js';
import { requireAuth } from '../middleware/require-auth.middleware.js';
import { requireOrgType } from '../middleware/require-org-type.middleware.js';
import { requireRole } from '../middleware/require-role.middleware.js';

const sessionChain = [requireAuth, requireActiveOrg, requireActiveSubscription] as const;

export function createOrderChatRouter(): Router {
  const router = Router();
  const controller = createOrderChatController();
  const catalog = createCatalogOrdersController();
  const retailer = [
    ...sessionChain,
    requireOrgType('RETAILER'),
    requireRole('OWNER', 'STAFF'),
  ] as const;

  router.post('/', ...retailer, catalog.createOrder);
  router.patch('/:orderId/items', ...retailer, catalog.updateItems);
  router.post('/:orderId/cancel', ...retailer, catalog.cancelPending);
  router.post('/:orderId/cancel-request', ...retailer, controller.requestCancellation);
  router.get('/:orderId', ...sessionChain, catalog.getOrder);
  router.get('/:orderId/chat/messages', ...sessionChain, controller.messages);
  router.get(
    '/:orderId/chat/suggested-replies',
    ...sessionChain,
    requireOrgType('WHOLESALER'),
    requireRole('ADMIN', 'ORDER_HANDLER'),
    controller.suggestedReplies,
  );
  router.post(
    '/:orderId/confirm',
    ...sessionChain,
    requireOrgType('WHOLESALER'),
    requireRole('ADMIN', 'ORDER_HANDLER'),
    controller.confirm,
  );
  router.patch(
    '/:orderId/status',
    ...sessionChain,
    requireOrgType('WHOLESALER'),
    requireRole('ADMIN', 'ORDER_HANDLER'),
    controller.updateStatus,
  );

  return router;
}
