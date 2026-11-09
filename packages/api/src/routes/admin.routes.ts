import { Router } from 'express';

import { requireAuth } from '../middleware/require-auth.middleware.js';
import { requireSuperAdmin } from '../middleware/require-super-admin.middleware.js';
import { createSendGridMailer, type Mailer } from '../services/mailer.js';
import { createAdminController } from '../controllers/admin.controller.js';

export function createAdminRouter(mailer: Mailer = createSendGridMailer()): Router {
  const router = Router();
  const controller = createAdminController(mailer);
  router.use(requireAuth, requireSuperAdmin);
  router.get('/dashboard', controller.dashboard);
  router.get('/platform/health', controller.health);
  router.get('/users', controller.users);
  router.patch('/users/:id', controller.updateUser);
  router.get('/subscriptions', controller.subscriptions);
  router.post('/subscriptions/extend-week', controller.extendWeek);
  router.get('/organisations', controller.organisations);
  router.post('/organisations/invite', controller.invite);
  router.post('/organisations', controller.createOrganisation);
  router.get('/organisations/:id', controller.organisation);
  router.patch('/organisations/:id/subscription', controller.updateSubscription);
  router.patch('/organisations/:id', controller.updateOrganisation);
  return router;
}
