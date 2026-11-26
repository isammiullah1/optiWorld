import { Router } from 'express';

import { createCustomersController } from '../controllers/customers.controller.js';
import { createInventoryController } from '../controllers/inventory.controller.js';
import { createPosBillingController } from '../controllers/pos-billing.controller.js';
import { createReportsController } from '../controllers/reports.controller.js';
import { createRetailerDashboardController } from '../controllers/retailer-dashboard.controller.js';
import { requireActiveOrg } from '../middleware/require-active-org.middleware.js';
import { requireAuth } from '../middleware/require-auth.middleware.js';
import { requireOrgType } from '../middleware/require-org-type.middleware.js';
import { requireRole } from '../middleware/require-role.middleware.js';

const shop = [
  requireAuth,
  requireActiveOrg,
  requireOrgType('WHOLESALER'),
  requireRole('ADMIN', 'ORDER_HANDLER'),
] as const;

const admin = [
  requireAuth,
  requireActiveOrg,
  requireOrgType('WHOLESALER'),
  requireRole('ADMIN'),
] as const;

export function createWholesalerCounterRouter(): Router {
  const router = Router();
  const pos = createPosBillingController();
  const customers = createCustomersController();
  const inventory = createInventoryController();
  const reports = createReportsController();
  const dashboard = createRetailerDashboardController();

  router.get('/inventory/search', ...shop, pos.searchInventory);
  router.get('/customers/search', ...shop, pos.searchCustomers);
  router.get('/inventory', ...shop, inventory.list);
  router.post('/inventory', ...shop, inventory.create);
  router.get('/settings', ...shop, inventory.settings);
  router.patch('/settings', ...admin, inventory.updateSettings);
  router.post('/bill-logo', ...admin, inventory.uploadLogo);
  router.delete('/bill-logo', ...admin, inventory.removeLogo);
  router.get('/inventory/:id/movements', ...admin, inventory.movements);
  router.post('/inventory/:id/adjust', ...shop, inventory.adjust);
  router.get('/inventory/:id', ...shop, inventory.detail);
  router.patch('/inventory/:id', ...shop, inventory.update);
  router.post('/inventory/:id/restore', ...shop, inventory.restore);
  router.delete('/inventory/:id', ...shop, inventory.remove);

  router.get('/customers', ...shop, customers.list);
  router.post('/customers', ...shop, customers.create);
  router.get('/customers/:id/prescriptions', ...shop, customers.prescriptions);
  router.post('/customers/:id/prescriptions', ...shop, customers.createPrescription);
  router.patch(
    '/customers/:id/prescriptions/:prescriptionId',
    ...shop,
    customers.updatePrescription,
  );
  router.get('/customers/:id/ledger', ...admin, customers.ledger);
  router.get('/customers/:id/credit-bills', ...admin, customers.creditBills);
  router.post('/customers/:id/payments', ...admin, customers.payment);
  router.get('/customers/:id', ...shop, customers.get);
  router.patch('/customers/:id', ...shop, customers.update);
  router.delete('/customers/:id', ...shop, customers.remove);

  router.get('/invoices', ...shop, dashboard.invoices);
  router.post('/invoices', ...shop, pos.createInvoice);
  router.get('/invoices/:invoiceId/receipt', ...shop, pos.receipt);
  router.post('/invoices/:invoiceId/clear-credit', ...admin, pos.clearCredit);
  router.delete('/invoices/:invoiceId', ...admin, pos.removeInvoice);
  router.post('/invoices/:invoiceId/cancel', ...admin, pos.cancelInvoice);
  router.post('/invoices/:invoiceId/edit', ...admin, pos.editSale);
  router.post('/invoices/:invoiceId/prescription', ...admin, pos.updatePrescription);
  router.get('/invoices/:invoiceId', ...shop, dashboard.invoice);

  router.get('/reports/sales', ...shop, reports.sales);
  router.get('/reports/inventory', ...admin, reports.inventory);
  router.post('/reports/export', ...shop, reports.exportReport);
  return router;
}
