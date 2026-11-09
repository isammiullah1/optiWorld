import { Router } from 'express';

import { createCatalogOrdersController } from '../controllers/catalog-orders.controller.js';
import { createLabJobsController } from '../controllers/lab-jobs.controller.js';
import { createCustomersController } from '../controllers/customers.controller.js';
import { createDeliveriesController } from '../controllers/deliveries.controller.js';
import { createInventoryController } from '../controllers/inventory.controller.js';
import { createLedgerController } from '../controllers/ledger.controller.js';
import { createPosBillingController } from '../controllers/pos-billing.controller.js';
import { createReportsController } from '../controllers/reports.controller.js';
import { createRetailerAccountController } from '../controllers/retailer-account.controller.js';
import { createRetailerDashboardController } from '../controllers/retailer-dashboard.controller.js';
import { createRetailerShellController } from '../controllers/retailer-shell.controller.js';
import {
  requireRetailerAnyFeature,
  requireRetailerFeature,
} from '../middleware/retailer-access.middleware.js';
import { requireActiveOrg } from '../middleware/require-active-org.middleware.js';
import { requireAuth } from '../middleware/require-auth.middleware.js';
import { requireOrgType } from '../middleware/require-org-type.middleware.js';
import { requireRole } from '../middleware/require-role.middleware.js';

const retailer = [requireAuth, requireActiveOrg, requireOrgType('RETAILER')] as const;
const retailerOwner = [...retailer, requireRole('OWNER')] as const;

export function createRetailerRouter(): Router {
  const router = Router();
  const shell = createRetailerShellController();
  const dashboard = createRetailerDashboardController();
  const reports = createReportsController();
  const pos = createPosBillingController();
  const customers = createCustomersController();
  const inventory = createInventoryController();
  const ledger = createLedgerController();
  const catalog = createCatalogOrdersController();
  const labJobs = createLabJobsController();
  const deliveries = createDeliveriesController();
  const account = createRetailerAccountController();
  const billing = requireRetailerFeature('billing');
  const customersFeature = requireRetailerFeature('customers');
  const inventoryFeature = requireRetailerFeature('inventory');
  const wholesalers = requireRetailerFeature('wholesalers');
  const orders = requireRetailerFeature('orders');
  const laboratories = requireRetailerFeature('laboratories');
  const labJobsFeature = requireRetailerFeature('labJobs');
  const reportsFeature = requireRetailerFeature('reports');
  router.get('/profile', ...retailer, account.profile);
  router.patch('/profile', ...retailerOwner, account.updateProfile);
  router.patch('/account', ...retailer, account.updateAccount);
  router.get('/staff', ...retailerOwner, account.staff);
  router.post('/staff', ...retailerOwner, account.createStaff);
  router.patch('/staff/:userId', ...retailerOwner, account.updateStaff);
  router.delete('/staff/:userId', ...retailerOwner, account.deleteStaff);
  router.get('/shell', requireAuth, requireOrgType('RETAILER'), shell.shell);
  router.get('/dashboard/stats', ...retailer, dashboard.stats);
  router.get(
    '/inventory/search',
    ...retailer,
    requireRetailerAnyFeature(['billing', 'inventory']),
    pos.searchInventory,
  );
  router.get('/inventory', ...retailer, inventoryFeature, inventory.list);
  router.post('/inventory', ...retailer, inventoryFeature, inventory.create);
  router.get('/settings', ...retailer, inventory.settings);
  router.patch('/settings', ...retailerOwner, inventory.updateSettings);
  router.post('/bill-logo', ...retailerOwner, inventory.uploadLogo);
  router.delete('/bill-logo', ...retailerOwner, inventory.removeLogo);
  router.get('/inventory/:id/movements', ...retailer, inventoryFeature, inventory.movements);
  router.post('/inventory/:id/adjust', ...retailer, inventoryFeature, inventory.adjust);
  router.get('/inventory/:id', ...retailer, inventoryFeature, inventory.detail);
  router.patch('/inventory/:id', ...retailer, inventoryFeature, inventory.update);
  router.post('/inventory/:id/restore', ...retailer, inventoryFeature, inventory.restore);
  router.delete('/inventory/:id', ...retailer, inventoryFeature, inventory.remove);
  router.get(
    '/customers/search',
    ...retailer,
    requireRetailerAnyFeature(['billing', 'customers']),
    pos.searchCustomers,
  );
  router.get('/customers', ...retailer, customersFeature, customers.list);
  router.post('/customers', ...retailer, customersFeature, customers.create);
  router.get(
    '/customers/:id/prescriptions',
    ...retailer,
    requireRetailerAnyFeature(['billing', 'customers']),
    customers.prescriptions,
  );
  router.post(
    '/customers/:id/prescriptions',
    ...retailer,
    requireRetailerAnyFeature(['billing', 'customers']),
    customers.createPrescription,
  );
  router.patch(
    '/customers/:id/prescriptions/:prescriptionId',
    ...retailer,
    requireRetailerAnyFeature(['billing', 'customers']),
    customers.updatePrescription,
  );
  router.get('/customers/:id/ledger', ...retailerOwner, customers.ledger);
  router.get('/customers/:id/credit-bills', ...retailerOwner, customers.creditBills);
  router.post('/customers/:id/payments', ...retailerOwner, customers.payment);
  router.get(
    '/customers/:id',
    ...retailer,
    requireRetailerAnyFeature(['billing', 'customers']),
    customers.get,
  );
  router.patch('/customers/:id', ...retailer, customersFeature, customers.update);
  router.delete('/customers/:id', ...retailer, customersFeature, customers.remove);
  router.get(
    '/laboratories',
    ...retailer,
    requireRetailerAnyFeature(['billing', 'laboratories']),
    pos.labs,
  );
  router.get('/invoices', ...retailer, billing, dashboard.invoices);
  router.post('/invoices', ...retailer, billing, pos.createInvoice);
  router.get('/invoices/:invoiceId/receipt', ...retailer, billing, pos.receipt);
  router.post('/invoices/:invoiceId/clear-credit', ...retailerOwner, billing, pos.clearCredit);
  router.delete('/invoices/:invoiceId', ...retailerOwner, billing, pos.removeInvoice);
  router.post('/invoices/:invoiceId/cancel', ...retailerOwner, billing, pos.cancelInvoice);
  router.post('/invoices/:invoiceId/lab', ...retailerOwner, billing, pos.sendToLab);
  router.post('/invoices/:invoiceId/lab/unsend', ...retailerOwner, billing, pos.unsendLab);
  router.post('/invoices/:invoiceId/lab/cancel', ...retailerOwner, billing, pos.cancelLab);
  router.post(
    '/invoices/:invoiceId/prescription',
    ...retailerOwner,
    billing,
    pos.updatePrescription,
  );
  router.post('/invoices/:invoiceId/finalize-lab', ...retailerOwner, billing, pos.finalizeLab);
  router.get('/invoices/:invoiceId', ...retailer, billing, dashboard.invoice);
  router.get('/alerts', ...retailer, dashboard.alerts);
  router.patch('/alerts/read-all', ...retailer, dashboard.readAllAlerts);
  router.patch('/alerts/:id/read', ...retailer, dashboard.readAlert);
  router.get('/reports/sales', ...retailer, reportsFeature, reports.sales);
  router.get('/reports/inventory', ...retailerOwner, reports.inventory);
  router.get('/reports/credit', ...retailerOwner, reports.credit);
  router.post('/reports/export', ...retailer, reportsFeature, reports.exportReport);
  router.get('/ledger/summary', ...retailerOwner, ledger.summary);
  router.get('/ledger/aging/export', ...retailerOwner, ledger.exportAging);
  router.get('/ledger/aging/export-pdf', ...retailerOwner, ledger.exportAgingPdf);
  router.get('/ledger/aging', ...retailerOwner, ledger.aging);
  router.post('/reminders/send', ...retailerOwner, ledger.sendReminders);
  router.get('/wholesalers/search', ...retailer, wholesalers, catalog.searchWholesalers);
  router.get('/wholesaler-connections', ...retailer, wholesalers, catalog.connections);
  router.post('/wholesaler-connections', ...retailer, wholesalers, catalog.requestConnection);
  router.patch(
    '/wholesaler-connections/:connectionId/approve',
    ...retailer,
    wholesalers,
    catalog.acceptWholesaler,
  );
  router.patch(
    '/wholesaler-connections/:connectionId/decline',
    ...retailer,
    wholesalers,
    catalog.declineWholesaler,
  );
  router.patch(
    '/wholesaler-connections/:connectionId/cancel',
    ...retailer,
    wholesalers,
    catalog.cancelWholesaler,
  );
  router.patch(
    '/wholesaler-connections/:connectionId/disconnect',
    ...retailer,
    wholesalers,
    catalog.disconnectWholesaler,
  );
  router.get('/orders', ...retailer, orders, catalog.listOrders);
  router.get('/labs/search', ...retailer, laboratories, labJobs.search);
  router.get('/lab-connections', ...retailer, laboratories, labJobs.connections);
  router.post('/lab-connections', ...retailer, laboratories, labJobs.connect);
  router.patch('/lab-connections/:labOrgId/approve', ...retailer, laboratories, labJobs.acceptLab);
  router.patch('/lab-connections/:labOrgId/decline', ...retailer, laboratories, labJobs.declineLab);
  router.patch('/lab-connections/:labOrgId/cancel', ...retailer, laboratories, labJobs.cancelLab);
  router.patch(
    '/lab-connections/:labOrgId/disconnect',
    ...retailer,
    laboratories,
    labJobs.disconnect,
  );
  router.get('/lab-jobs/sales', ...retailer, labJobsFeature, labJobs.sales);
  router.post('/lab-jobs', ...retailer, labJobsFeature, labJobs.createDirect);
  router.get('/lab-jobs', ...retailer, labJobsFeature, labJobs.list);
  router.post('/lab-jobs/:id/completion', ...retailer, labJobsFeature, labJobs.completion);
  router.post('/lab-jobs/:id/reopen', ...retailer, labJobsFeature, labJobs.reopen);
  router.post('/lab-jobs/:id/cancel', ...retailer, labJobsFeature, labJobs.cancelRetailer);
  router.post('/lab-jobs/:id/redirect', ...retailer, labJobsFeature, labJobs.redirectRetailer);
  router.post('/lab-jobs/:id/outsource', ...retailer, labJobsFeature, labJobs.outsourceRetailer);
  router.get('/deliveries', ...retailer, labJobsFeature, deliveries.list);
  router.post('/deliveries/:id/deliver', ...retailer, labJobsFeature, deliveries.deliver);
  return router;
}
