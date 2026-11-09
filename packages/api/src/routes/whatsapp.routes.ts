import { Router } from 'express';

import { createLedgerController } from '../controllers/ledger.controller.js';
import { createPosBillingController } from '../controllers/pos-billing.controller.js';
import { requireActiveOrg } from '../middleware/require-active-org.middleware.js';
import { requireAuth } from '../middleware/require-auth.middleware.js';
import { requireOrgType } from '../middleware/require-org-type.middleware.js';
import { requireRole } from '../middleware/require-role.middleware.js';

export function createWhatsAppRouter(): Router {
  const router = Router();
  const pos = createPosBillingController();
  const ledger = createLedgerController();
  router.post(
    '/send-receipt',
    requireAuth,
    requireActiveOrg,
    requireOrgType('RETAILER'),
    pos.sendReceipt,
  );
  router.post(
    '/send-payment-reminder',
    requireAuth,
    requireActiveOrg,
    requireOrgType('RETAILER'),
    requireRole('OWNER'),
    ledger.sendWhatsApp,
  );
  return router;
}
