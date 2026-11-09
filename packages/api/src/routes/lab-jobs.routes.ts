import { Router } from 'express';

import { createLabAccountController } from '../controllers/lab-account.controller.js';
import { createLabJobsController } from '../controllers/lab-jobs.controller.js';
import { createLabOpsController } from '../controllers/lab-ops.controller.js';
import { requireActiveLabUser, requireLabFeature } from '../middleware/lab-access.middleware.js';
import { requireRetailerAnyFeature } from '../middleware/retailer-access.middleware.js';
import { requireActiveOrg } from '../middleware/require-active-org.middleware.js';
import { requireAuth } from '../middleware/require-auth.middleware.js';
import { requireOrgType } from '../middleware/require-org-type.middleware.js';
import { requireRole } from '../middleware/require-role.middleware.js';

const retailer = [requireAuth, requireActiveOrg, requireOrgType('RETAILER')] as const;
const laboratory = [
  requireAuth,
  requireActiveOrg,
  requireOrgType('LABORATORY'),
  requireRole('ADMIN', 'TECHNICIAN'),
  requireActiveLabUser,
] as const;
const labAdmin = [...laboratory, requireRole('ADMIN')] as const;

export function createLabJobsRouter(): Router {
  const router = Router();
  const jobs = createLabJobsController();
  const retailerJobs = requireRetailerAnyFeature(['billing', 'labJobs']);
  router.post('/', ...retailer, retailerJobs, jobs.create);
  router.get('/:id/status-history', ...retailer, retailerJobs, jobs.history);
  router.patch('/:id/status', ...laboratory, requireLabFeature('jobs'), jobs.status);
  router.patch('/:id/urgent', ...laboratory, requireLabFeature('jobs'), jobs.urgent);
  router.patch('/:id/notes', ...laboratory, requireLabFeature('jobs'), jobs.notes);
  router.patch('/:id/prescription', ...laboratory, requireLabFeature('jobs'), jobs.prescription);
  router.post(
    '/:id/notify-retailer',
    ...laboratory,
    requireLabFeature('jobs'),
    jobs.notifyRetailer,
  );
  router.post('/:id/accept', ...laboratory, requireLabFeature('jobs'), jobs.accept);
  router.post('/:id/reject', ...laboratory, requireLabFeature('jobs'), jobs.reject);
  router.post(
    '/:id/material-reminder',
    ...laboratory,
    requireLabFeature('jobs'),
    jobs.remindMaterial,
  );
  router.post('/:id/shop-request', ...laboratory, requireLabFeature('jobs'), jobs.shopRequest);
  router.post('/:id/reopen', ...laboratory, requireLabFeature('jobs'), jobs.reopen);
  router.post('/:id/cancel', ...laboratory, requireLabFeature('jobs'), jobs.cancel);
  router.patch('/:id', ...retailer, retailerJobs, jobs.notify);
  router.get('/:id', ...retailer, retailerJobs, jobs.detail);
  return router;
}

export function createLabRouter(): Router {
  const router = Router();
  const jobs = createLabJobsController();
  const ops = createLabOpsController();
  const account = createLabAccountController();
  router.get('/profile', ...laboratory, account.profile);
  router.patch('/profile', ...labAdmin, account.updateProfile);
  router.patch('/account', ...laboratory, account.updateAccount);
  router.get('/staff', ...labAdmin, account.staff);
  router.post('/staff', ...labAdmin, account.createStaff);
  router.patch('/staff/:userId', ...labAdmin, account.updateStaff);
  router.delete('/staff/:userId', ...labAdmin, account.deleteStaff);
  router.get('/inventory', ...laboratory, requireLabFeature('inventory'), ops.inventory);
  router.post('/inventory', ...laboratory, requireLabFeature('inventory'), ops.createInventory);
  router.post(
    '/inventory/:id/adjust',
    ...laboratory,
    requireLabFeature('inventory'),
    ops.adjustInventory,
  );
  router.patch(
    '/inventory/:id',
    ...laboratory,
    requireLabFeature('inventory'),
    ops.updateInventory,
  );
  router.get('/retailers/search', ...laboratory, requireLabFeature('clients'), ops.searchRetailers);
  router.post(
    '/retailers/connect',
    ...laboratory,
    requireLabFeature('clients'),
    ops.connectRetailer,
  );
  router.get('/connections', ...laboratory, requireLabFeature('clients'), ops.connectionRequests);
  router.patch(
    '/connections/:id/approve',
    ...laboratory,
    requireLabFeature('clients'),
    ops.approveConnection,
  );
  router.patch(
    '/connections/:id/decline',
    ...laboratory,
    requireLabFeature('clients'),
    ops.declineConnection,
  );
  router.patch(
    '/connections/:id/cancel',
    ...laboratory,
    requireLabFeature('clients'),
    ops.cancelConnection,
  );
  router.get('/clients', ...laboratory, requireLabFeature('clients'), ops.clients);
  router.get('/clients/:id/jobs', ...laboratory, requireLabFeature('clients'), ops.clientJobs);
  router.get('/reports/job-activity', ...laboratory, requireLabFeature('reports'), ops.jobActivity);
  router.get('/reports/turnaround', ...laboratory, requireLabFeature('reports'), ops.turnaround);
  router.get(
    '/reports/job-history/export',
    ...laboratory,
    requireLabFeature('reports'),
    ops.exportJobHistory,
  );
  router.get('/reports/job-history', ...laboratory, requireLabFeature('reports'), ops.jobHistory);
  router.get('/jobs/next-reference', ...laboratory, requireLabFeature('jobs'), jobs.nextReference);
  router.get('/jobs', ...laboratory, requireLabFeature('jobs'), jobs.board);
  router.post('/jobs', ...laboratory, requireLabFeature('jobs'), jobs.addJob);
  router.get('/jobs/:id', ...laboratory, requireLabFeature('jobs'), jobs.boardJob);
  return router;
}
