import './setup-env.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';
import {
  authHeader,
  containsRevenueField,
  createAccount,
  login,
  removeByPrefix,
  type TestAccount,
} from './critical-fixtures.js';

const app = createApp();
const prefix = 'critical-price';
let queue: Promise<void> = Promise.resolve();

function sequential(run: () => Promise<void>): Promise<void> {
  const next = queue.then(run, run);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

describe('price protection', () => {
  let retailer: TestAccount;
  let wholesaler: TestAccount;
  let other: TestAccount;
  let retailerToken = '';
  let wholesalerToken = '';
  let pricedId = '';
  let quotedId = '';
  let secretId = '';

  before(async () => {
    await removeByPrefix(prefix);
    retailer = await createAccount({ prefix, slug: 'retailer', type: 'RETAILER', role: 'OWNER' });
    wholesaler = await createAccount({
      prefix,
      slug: 'wholesaler',
      type: 'WHOLESALER',
      role: 'ADMIN',
    });
    other = await createAccount({ prefix, slug: 'other', type: 'WHOLESALER', role: 'ADMIN' });
    const priced = await prisma.catalogProduct.create({
      data: {
        orgId: wholesaler.orgId,
        name: 'Price protection lens',
        category: 'Lenses',
        listedPrice: '900.00',
        productCode: 'PP-900',
      },
    });
    const quoted = await prisma.catalogProduct.create({
      data: {
        orgId: wholesaler.orgId,
        name: 'Price on request frame',
        category: 'Frames',
        listedPrice: null,
        isPriceOnRequest: true,
        productCode: 'PP-POR',
      },
    });
    const secret = await prisma.catalogProduct.create({
      data: {
        orgId: other.orgId,
        name: 'Secret other catalog',
        category: 'Lenses',
        listedPrice: '50.00',
        productCode: 'PP-SEC',
      },
    });
    pricedId = priced.id;
    quotedId = quoted.id;
    secretId = secret.id;
    retailerToken = (await login(app, retailer.email)).accessToken;
    wholesalerToken = (await login(app, wholesaler.email)).accessToken;
  });

  after(async () => {
    await removeByPrefix(prefix);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('returns prices for an approved full connection', () =>
    sequential(async () => {
      await setConnection('FULL', 'APPROVED');
      const response = await request(app)
        .get(`/api/v1/catalog/${wholesaler.orgId}`)
        .set(authHeader(retailerToken));
      assert.equal(response.status, 200);
      const products = response.body.data.products as Array<{
        id: string;
        listedPrice: string | null;
      }>;
      assert.equal(products.find((row) => row.id === pricedId)?.listedPrice, '900.00');
      assert.equal(products.find((row) => row.id === quotedId)?.listedPrice, null);
      assert.equal(
        products.some((row) => row.id === secretId),
        false,
      );
    }));

  it('nulls every listed price when prices are hidden', () =>
    sequential(async () => {
      await setConnection('PRICES_HIDDEN', 'APPROVED');
      const response = await request(app)
        .get(`/api/v1/catalog/${wholesaler.orgId}`)
        .set(authHeader(retailerToken));
      assert.equal(response.status, 200);
      const products = response.body.data.products as Array<{ listedPrice: string | null }>;
      assert.ok(products.length > 0);
      assert.equal(
        products.every((row) => row.listedPrice === null),
        true,
      );
    }));

  it('hides the catalog when the connection is catalog hidden', () =>
    sequential(async () => {
      await setConnection('CATALOG_HIDDEN', 'APPROVED');
      const response = await request(app)
        .get(`/api/v1/catalog/${wholesaler.orgId}`)
        .set(authHeader(retailerToken));
      assert.equal(response.status, 403);
      assert.equal(response.body.error.code, 'CATALOG_HIDDEN');
    }));

  it('blocks a pending connection', () =>
    sequential(async () => {
      await setConnection('FULL', 'PENDING');
      const response = await request(app)
        .get(`/api/v1/catalog/${wholesaler.orgId}`)
        .set(authHeader(retailerToken));
      assert.equal(response.status, 403);
      assert.equal(response.body.error.code, 'CONNECTION_REQUIRED');
    }));

  it('blocks a retailer with no connection', () =>
    sequential(async () => {
      await prisma.retailerConnection.deleteMany({
        where: { retailerOrgId: retailer.orgId, wholesalerOrgId: wholesaler.orgId },
      });
      const response = await request(app)
        .get(`/api/v1/catalog/${wholesaler.orgId}`)
        .set(authHeader(retailerToken));
      assert.equal(response.status, 403);
      assert.equal(response.body.error.code, 'CONNECTION_REQUIRED');
    }));

  it('blocks a direct request for another wholesaler catalog', () =>
    sequential(async () => {
      await setConnection('FULL', 'APPROVED');
      const response = await request(app)
        .get(`/api/v1/catalog/${other.orgId}`)
        .set(authHeader(retailerToken));
      assert.equal(response.status, 403);
      assert.equal(response.body.error.code, 'CONNECTION_REQUIRED');
    }));

  it('has no cross-wholesaler catalog search', () =>
    sequential(async () => {
      const response = await request(app)
        .get('/api/v1/catalog/search?q=lens')
        .set(authHeader(retailerToken));
      assert.equal(response.status, 404);
      assert.equal(response.body.error.code, 'NOT_FOUND');
    }));

  it('does not return aggregated wholesaler revenue', () =>
    sequential(async () => {
      const range = 'from=2026-09-01&to=2026-10-06';
      const paths = [
        '/api/v1/wholesaler/profile',
        '/api/v1/wholesaler/shell',
        '/api/v1/wholesaler/dashboard',
        '/api/v1/wholesaler/orders',
        '/api/v1/wholesaler/connections',
        '/api/v1/wholesaler/quote-requests',
        '/api/v1/wholesaler/catalog',
        '/api/v1/wholesaler/catalog/categories',
        `/api/v1/wholesaler/reports/order-activity?${range}`,
        `/api/v1/wholesaler/reports/catalog-activity?${range}`,
      ];
      for (const path of paths) {
        const response = await request(app).get(path).set(authHeader(wholesalerToken));
        assert.equal(response.status, 200, path);
        assert.equal(containsRevenueField(response.body), false, path);
      }
    }));
});

async function setConnection(
  visibilityMode: 'FULL' | 'PRICES_HIDDEN' | 'CATALOG_HIDDEN',
  status: 'APPROVED' | 'PENDING',
): Promise<void> {
  const retailer = await prisma.user.findUniqueOrThrow({
    where: { email: `${prefix}-retailer@example.com` },
  });
  const wholesaler = await prisma.user.findUniqueOrThrow({
    where: { email: `${prefix}-wholesaler@example.com` },
  });
  await prisma.retailerConnection.upsert({
    where: {
      wholesalerOrgId_retailerOrgId: {
        wholesalerOrgId: wholesaler.orgId,
        retailerOrgId: retailer.orgId,
      },
    },
    create: {
      wholesalerOrgId: wholesaler.orgId,
      retailerOrgId: retailer.orgId,
      status,
      visibilityMode,
      approvedAt: status === 'APPROVED' ? new Date() : null,
    },
    update: {
      status,
      visibilityMode,
      approvedAt: status === 'APPROVED' ? new Date() : null,
    },
  });
}
