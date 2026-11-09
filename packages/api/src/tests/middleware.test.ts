import './setup-env.js';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import express from 'express';
import request from 'supertest';
import type { ApprovedConnection, AuthSessionUser, OrgType, UserRole } from '@optiworld/shared';

import { applyVisibilityMode } from '../middleware/apply-visibility-mode.middleware.js';
import { errorMiddleware } from '../middleware/error.middleware.js';
import { requireActiveOrg } from '../middleware/require-active-org.middleware.js';
import { requireActiveSubscription } from '../middleware/require-active-subscription.middleware.js';
import {
  requireApprovedConnection,
  type ConnectionLookup,
} from '../middleware/require-approved-connection.middleware.js';
import { requireAuth } from '../middleware/require-auth.middleware.js';
import { requireOrgType } from '../middleware/require-org-type.middleware.js';
import { requireRole } from '../middleware/require-role.middleware.js';
import { signAccessToken } from '../lib/tokens.js';

const retailerA = '10000000-0000-4000-8000-000000000001';
const retailerB = '10000000-0000-4000-8000-000000000002';
const wholesaler = '10000000-0000-4000-8000-000000000003';
const lab = '10000000-0000-4000-8000-000000000004';

const connections = new Map<string, ApprovedConnection>([
  [key(retailerA, wholesaler), connection(retailerA, 'FULL')],
  [key(retailerB, wholesaler), connection(retailerB, 'PRICES_HIDDEN')],
]);

const hiddenRetailer = '10000000-0000-4000-8000-000000000099';
connections.set(key(hiddenRetailer, wholesaler), connection(hiddenRetailer, 'CATALOG_HIDDEN'));

function key(retailerOrgId: string, wholesalerOrgId: string): string {
  return `${retailerOrgId}:${wholesalerOrgId}`;
}

function connection(
  retailerOrgId: string,
  visibilityMode: ApprovedConnection['visibilityMode'],
): ApprovedConnection {
  return {
    id: `conn-${retailerOrgId}`,
    retailerOrgId,
    wholesalerOrgId: wholesaler,
    visibilityMode,
  };
}

const lookup: ConnectionLookup = async ({ retailerOrgId, wholesalerOrgId }) => {
  return connections.get(key(retailerOrgId, wholesalerOrgId)) ?? null;
};

function session(overrides: Partial<AuthSessionUser> = {}): AuthSessionUser {
  return {
    userId: '20000000-0000-4000-8000-000000000002',
    email: 'owner@brightview.example',
    name: 'Sara Ahmed',
    orgId: retailerA,
    orgType: 'RETAILER',
    role: 'OWNER',
    orgStatus: 'ACTIVE',
    planType: 'RETAILER_STANDARD',
    subscriptionStatus: 'ACTIVE',
    ...overrides,
  };
}

function bearer(overrides: Partial<AuthSessionUser> = {}): string {
  return `Bearer ${signAccessToken(session(overrides))}`;
}

function buildApp() {
  const app = express();
  app.use(express.json());

  const retailerChain = [
    requireAuth,
    requireActiveOrg,
    requireOrgType('RETAILER'),
    requireRole('OWNER', 'STAFF'),
    requireActiveSubscription,
  ] as const;

  app.get('/retailer/ping', ...retailerChain, (_req, res) => {
    res.json({ success: true, data: { orgType: 'RETAILER' } });
  });

  app.get(
    '/wholesaler/ping',
    requireAuth,
    requireActiveOrg,
    requireOrgType('WHOLESALER'),
    requireRole('ADMIN', 'ORDER_HANDLER'),
    requireActiveSubscription,
    (_req, res) => {
      res.json({ success: true, data: { orgType: 'WHOLESALER' } });
    },
  );

  app.get(
    '/laboratory/ping',
    requireAuth,
    requireActiveOrg,
    requireOrgType('LABORATORY'),
    requireRole('ADMIN', 'TECHNICIAN'),
    requireActiveSubscription,
    (_req, res) => {
      res.json({ success: true, data: { orgType: 'LABORATORY' } });
    },
  );

  app.get('/owner-only', requireAuth, requireRole('OWNER'), (_req, res) => {
    res.json({ success: true, data: { role: 'OWNER' } });
  });

  app.get(
    '/catalog/:wholesalerId',
    ...retailerChain,
    requireApprovedConnection('wholesalerId', lookup),
    applyVisibilityMode,
    (req, res) => {
      res.json({
        success: true,
        data: {
          visibilityMode: req.retailerConnection?.visibilityMode,
          products: [{ name: 'CR39 SV', listedPrice: '900.00' }],
        },
      });
    },
  );

  app.use(errorMiddleware);
  return app;
}

const app = buildApp();

describe('authentication middleware chain', () => {
  it('rejects a missing token', async () => {
    const response = await request(app).get('/retailer/ping');
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
  });

  it('allows each organisation type through its own route', async () => {
    const cases: Array<{
      path: string;
      orgType: OrgType;
      role: UserRole;
      orgId: string;
      plan: AuthSessionUser['planType'];
    }> = [
      {
        path: '/retailer/ping',
        orgType: 'RETAILER',
        role: 'OWNER',
        orgId: retailerA,
        plan: 'RETAILER_STANDARD',
      },
      {
        path: '/retailer/ping',
        orgType: 'RETAILER',
        role: 'STAFF',
        orgId: retailerA,
        plan: 'RETAILER_STANDARD',
      },
      {
        path: '/wholesaler/ping',
        orgType: 'WHOLESALER',
        role: 'ADMIN',
        orgId: wholesaler,
        plan: 'WHOLESALER_STANDARD',
      },
      {
        path: '/wholesaler/ping',
        orgType: 'WHOLESALER',
        role: 'ORDER_HANDLER',
        orgId: wholesaler,
        plan: 'WHOLESALER_STANDARD',
      },
      {
        path: '/laboratory/ping',
        orgType: 'LABORATORY',
        role: 'ADMIN',
        orgId: lab,
        plan: 'LABORATORY_STANDARD',
      },
      {
        path: '/laboratory/ping',
        orgType: 'LABORATORY',
        role: 'TECHNICIAN',
        orgId: lab,
        plan: 'LABORATORY_STANDARD',
      },
    ];

    for (const item of cases) {
      const response = await request(app)
        .get(item.path)
        .set(
          'Authorization',
          bearer({
            orgType: item.orgType,
            role: item.role,
            orgId: item.orgId,
            planType: item.plan,
          }),
        );
      assert.equal(response.status, 200, `${item.role} ${item.path}`);
      assert.equal(response.body.data.orgType, item.orgType);
    }
  });

  it('blocks a super admin and cross-organisation access', async () => {
    const superAdmin = await request(app)
      .get('/retailer/ping')
      .set(
        'Authorization',
        bearer({
          role: 'SUPER_ADMIN',
          orgId: null,
          orgType: null,
          orgStatus: null,
          planType: null,
          subscriptionStatus: null,
        }),
      );
    assert.equal(superAdmin.status, 403);
    assert.equal(superAdmin.body.error.code, 'FORBIDDEN');

    const retailerOnLab = await request(app).get('/laboratory/ping').set('Authorization', bearer());
    assert.equal(retailerOnLab.status, 403);

    const staffOnOwner = await request(app)
      .get('/owner-only')
      .set('Authorization', bearer({ role: 'STAFF' }));
    assert.equal(staffOnOwner.status, 403);
  });

  it('blocks inactive organisations and inactive subscriptions', async () => {
    const suspended = await request(app)
      .get('/retailer/ping')
      .set('Authorization', bearer({ orgStatus: 'SUSPENDED' }));
    assert.equal(suspended.status, 403);
    assert.equal(suspended.body.error.code, 'FORBIDDEN');

    const expired = await request(app)
      .get('/wholesaler/ping')
      .set(
        'Authorization',
        bearer({
          orgType: 'WHOLESALER',
          role: 'ADMIN',
          orgId: wholesaler,
          planType: 'WHOLESALER_STANDARD',
          subscriptionStatus: 'EXPIRED',
        }),
      );
    assert.equal(expired.status, 403);
    assert.equal(expired.body.error.code, 'SUBSCRIPTION_INACTIVE');
  });

  it('enforces approved connections and visibility for the signed-in retailer only', async () => {
    const full = await request(app)
      .get(`/catalog/${wholesaler}?retailerOrgId=${retailerB}`)
      .set('Authorization', bearer({ orgId: retailerA }));
    assert.equal(full.status, 200);
    assert.equal(full.body.data.visibilityMode, 'FULL');
    assert.equal(full.body.data.products[0].listedPrice, '900.00');

    const pricesHidden = await request(app)
      .get(`/catalog/${wholesaler}`)
      .set('Authorization', bearer({ orgId: retailerB, role: 'STAFF' }));
    assert.equal(pricesHidden.status, 200);
    assert.equal(pricesHidden.body.data.visibilityMode, 'PRICES_HIDDEN');
    assert.equal(pricesHidden.body.data.products[0].listedPrice, null);

    const catalogHidden = await request(app)
      .get(`/catalog/${wholesaler}`)
      .set('Authorization', bearer({ orgId: hiddenRetailer }));
    assert.equal(catalogHidden.status, 403);
    assert.equal(catalogHidden.body.error.code, 'CATALOG_HIDDEN');

    const pending = await request(app)
      .get(`/catalog/${wholesaler}`)
      .set('Authorization', bearer({ orgId: '10000000-0000-4000-8000-000000000088' }));
    assert.equal(pending.status, 403);
    assert.equal(pending.body.error.code, 'CONNECTION_REQUIRED');

    const wholesalerCaller = await request(app)
      .get(`/catalog/${wholesaler}`)
      .set(
        'Authorization',
        bearer({
          orgType: 'WHOLESALER',
          role: 'ADMIN',
          orgId: wholesaler,
          planType: 'WHOLESALER_STANDARD',
        }),
      );
    assert.equal(wholesalerCaller.status, 403);
    assert.equal(wholesalerCaller.body.error.code, 'FORBIDDEN');

    const missingWholesaler = await request(app).get('/catalog/').set('Authorization', bearer());
    assert.equal(missingWholesaler.status, 404);
  });
});
