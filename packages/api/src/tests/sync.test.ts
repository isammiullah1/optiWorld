import './setup-env.js';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import type { OfflineInvoice } from '@optiworld/shared';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';
import {
  authHeader,
  createAccount,
  login,
  removeByPrefix,
  type TestAccount,
} from './critical-fixtures.js';

const app = createApp();
const prefix = 'critical-sync';

describe('offline sync', () => {
  let retailer: TestAccount;
  let token = '';
  let customerId = '';
  let batchId = '';

  before(async () => {
    await removeByPrefix(prefix);
    retailer = await createAccount({ prefix, slug: 'retailer', type: 'RETAILER', role: 'OWNER' });
    const customer = await prisma.customer.create({
      data: { orgId: retailer.orgId, name: 'Sync Customer', phone: '+92 300 5550101' },
    });
    customerId = customer.id;
    token = (await login(app, retailer.email)).accessToken;
  });

  after(async () => {
    await removeByPrefix(prefix);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('syncs five offline invoices and returns the same server ids on resend', async () => {
    batchId = await createBatch(retailer.orgId, 20);
    const invoices = Array.from({ length: 5 }, () => sale(customerId, batchId, 1));
    const first = await request(app)
      .post('/api/v1/sync/push')
      .set(authHeader(token))
      .send({ invoices });
    assert.equal(first.status, 200);
    const results = first.body.data.results as Array<{
      syncStatus: string;
      serverId: string;
      localId: string;
    }>;
    assert.equal(results.length, 5);
    assert.equal(
      results.every((row) => row.syncStatus === 'SYNCED' && row.serverId.length > 0),
      true,
    );
    const serverIds = results.map((row) => row.serverId);

    const second = await request(app)
      .post('/api/v1/sync/push')
      .set(authHeader(token))
      .send({ invoices });
    assert.equal(second.status, 200);
    const replay = second.body.data.results as Array<{ serverId: string; localId: string }>;
    assert.deepEqual(
      replay.map((row) => row.serverId),
      serverIds,
    );
    for (const invoice of invoices) {
      const count = await prisma.invoice.count({
        where: { orgId: retailer.orgId, localId: invoice.localId },
      });
      assert.equal(count, 1);
    }
  });

  it('flags insufficient stock and alerts the owner', async () => {
    const shortBatch = await createBatch(retailer.orgId, 1);
    const invoice = sale(customerId, shortBatch, 4);
    const response = await request(app)
      .post('/api/v1/sync/push')
      .set(authHeader(token))
      .send({ invoices: [invoice] });
    assert.equal(response.status, 200);
    const result = response.body.data.results[0] as {
      needsReview: boolean;
      serverId: string;
      stockShortfalls: Array<{ shortfall: number }>;
    };
    assert.equal(result.needsReview, true);
    assert.ok((result.stockShortfalls[0]?.shortfall ?? 0) > 0);
    const alert = await prisma.alert.findFirst({
      where: {
        orgId: retailer.orgId,
        userId: retailer.userId,
        type: 'INVOICE_REVIEW',
        relatedEntityId: result.serverId,
      },
    });
    assert.ok(alert);
    assert.equal(alert.title, 'Offline sale needs review');
  });
});

async function createBatch(orgId: string, stockQty: number): Promise<string> {
  const id = randomUUID();
  await prisma.inventoryBatch.create({
    data: {
      id,
      orgId,
      priceCode: id.slice(0, 8),
      prefix: 'SY',
      productName: 'Sync lens',
      category: 'Lenses',
      costPrice: '1.00',
      salePrice: '10.00',
      stockQty,
    },
  });
  return id;
}

function sale(customerId: string, inventoryBatchId: string, quantity: number): OfflineInvoice {
  return {
    localId: randomUUID(),
    customerId,
    status: 'PAID',
    paymentType: 'CASH',
    discount: '0.00',
    issuedAt: '2026-10-01T12:00:00.000Z',
    items: [
      {
        localItemId: randomUUID(),
        inventoryBatchId,
        quantity,
        unitPrice: '10.00',
      },
    ],
  };
}
