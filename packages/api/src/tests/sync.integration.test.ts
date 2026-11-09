import './setup-env.js';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import type { OfflineInvoice } from '@optiworld/shared';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const password = 'OptiWorld123!';
const brightview = '10000000-0000-4000-8000-000000000001';
const bilal = '30000000-0000-4000-8000-000000000002';
const ayesha = '30000000-0000-4000-8000-000000000001';
const app = createApp();
const batchIds: string[] = [];
const localIds: string[] = [];

let queue: Promise<void> = Promise.resolve();

function sequential(run: () => Promise<void>): Promise<void> {
  const next = queue.then(run, run);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

describe('retailer offline sync', () => {
  after(async () => {
    await queue;
    const invoices = await prisma.invoice.findMany({
      where: { localId: { in: localIds } },
      select: { id: true },
    });
    const invoiceIds = invoices.map((invoice) => invoice.id);
    if (invoiceIds.length > 0) {
      await prisma.alert.deleteMany({ where: { relatedEntityId: { in: invoiceIds } } });
      await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: invoiceIds } } });
      await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    }
    if (batchIds.length > 0) {
      await prisma.inventoryBatch.deleteMany({ where: { id: { in: batchIds } } });
    }
    await closeRedis();
    await prisma.$disconnect();
  });

  it('rejects a wholesaler and keeps a sale that the server cannot match', async () => {
    await sequential(async () => {
      const wholesaler = await login('admin@lensline.example');
      const denied = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${wholesaler}`)
        .send({ invoices: [sale(randomUUID(), randomUUID(), 1)] });
      assert.equal(denied.status, 403);
      assert.equal(denied.body.error.code, 'FORBIDDEN');

      const owner = await login('owner@brightview.example');
      const localId = trackLocalId();
      const unmatched = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${owner}`)
        .send({ invoices: [sale(localId, randomUUID(), 1)] });
      assert.equal(unmatched.status, 200);
      assert.equal(unmatched.body.data.results[0].syncStatus, 'CONFLICT');
      assert.equal(unmatched.body.data.results[0].serverId, null);
      const stored = await prisma.invoice.findFirst({ where: { localId } });
      assert.equal(stored, null);
    });
  });

  it('assigns a server invoice number once and does not deduct stock twice', async () => {
    await sequential(async () => {
      const batchId = await createBatch(10);
      const localId = trackLocalId();
      const owner = await login('owner@brightview.example');
      const body = { invoices: [sale(localId, batchId, 2)] };

      const first = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${owner}`)
        .send(body);
      assert.equal(first.status, 200);
      assert.equal(first.body.data.results[0].syncStatus, 'SYNCED');
      assert.equal(first.body.data.results[0].needsReview, false);
      assert.ok(first.body.data.results[0].invoiceNumber > 3);
      const serverId = first.body.data.results[0].serverId as string;

      const second = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${owner}`)
        .send(body);
      assert.equal(second.body.data.results[0].serverId, serverId);
      assert.equal(second.body.data.results[0].syncStatus, 'SYNCED');

      const batch = await prisma.inventoryBatch.findUniqueOrThrow({ where: { id: batchId } });
      assert.equal(batch.stockQty, 8);
      const count = await prisma.invoice.count({ where: { localId } });
      assert.equal(count, 1);
    });
  });

  it('keeps an oversold invoice, zeroes stock, and notifies the owner', async () => {
    await sequential(async () => {
      const batchId = await createBatch(1);
      const localId = trackLocalId();
      const owner = await login('owner@brightview.example');
      const response = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${owner}`)
        .send({ invoices: [sale(localId, batchId, 4)] });

      assert.equal(response.status, 200);
      const result = response.body.data.results[0];
      assert.equal(result.syncStatus, 'SYNCED');
      assert.equal(result.needsReview, true);
      assert.equal(result.stockShortfalls[0].shortfall, 3);

      const batch = await prisma.inventoryBatch.findUniqueOrThrow({ where: { id: batchId } });
      assert.equal(batch.stockQty, 0);
      const invoice = await prisma.invoice.findFirstOrThrow({
        where: { localId },
        include: { items: true },
      });
      assert.equal(invoice.items[0]?.quantity, 4);
      assert.equal(invoice.items[0]?.stockShortfall, 3);

      const staff = await login('staff@brightview.example');
      const staffResolve = await request(app)
        .post('/api/v1/sync/resolve-conflict')
        .set('Authorization', `Bearer ${staff}`)
        .send({ clientLocalId: localId, resolution: 'ACKNOWLEDGE_REVIEW' });
      assert.equal(staffResolve.status, 403);

      const ownerResolve = await request(app)
        .post('/api/v1/sync/resolve-conflict')
        .set('Authorization', `Bearer ${owner}`)
        .send({ clientLocalId: localId, resolution: 'ACKNOWLEDGE_REVIEW' });
      assert.equal(ownerResolve.status, 200);
      assert.equal(ownerResolve.body.data.invoice.needsReview, false);

      const alerts = await prisma.alert.count({
        where: { relatedEntityId: invoice.id, type: 'INVOICE_REVIEW' },
      });
      assert.ok(alerts >= 1);
    });
  });

  it('does not overwrite a synced sale when the device sends different details', async () => {
    await sequential(async () => {
      const batchId = await createBatch(6);
      const localId = trackLocalId();
      const owner = await login('owner@brightview.example');
      const original = sale(localId, batchId, 1);
      await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${owner}`)
        .send({ invoices: [original] });

      const changed = sale(localId, batchId, 5);
      const conflict = await request(app)
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${owner}`)
        .send({ invoices: [changed] });
      assert.equal(conflict.body.data.results[0].syncStatus, 'CONFLICT');

      const batch = await prisma.inventoryBatch.findUniqueOrThrow({ where: { id: batchId } });
      assert.equal(batch.stockQty, 5);

      const accepted = await request(app)
        .post('/api/v1/sync/resolve-conflict')
        .set('Authorization', `Bearer ${owner}`)
        .send({ clientLocalId: localId, resolution: 'ACCEPT_LOCAL', invoice: changed });
      assert.equal(accepted.status, 200);
      const after = await prisma.inventoryBatch.findUniqueOrThrow({ where: { id: batchId } });
      assert.equal(after.stockQty, 1);
    });
  });

  it('returns only the signed-in retailer catalogue', async () => {
    await sequential(async () => {
      const other = await login('owner@clearpath.example');
      const pulled = await request(app)
        .get('/api/v1/sync/pull')
        .set('Authorization', `Bearer ${other}`);
      assert.equal(pulled.status, 200);
      const customerIds = (pulled.body.data.customers.upserted as Array<{ id: string }>).map(
        (customer) => customer.id,
      );
      assert.equal(customerIds.includes(ayesha), false);
      assert.equal(customerIds.includes(bilal), false);

      const owner = await login('owner@brightview.example');
      const own = await request(app)
        .get('/api/v1/sync/pull')
        .set('Authorization', `Bearer ${owner}`);
      const ownIds = (own.body.data.customers.upserted as Array<{ id: string }>).map(
        (customer) => customer.id,
      );
      assert.equal(ownIds.includes(ayesha), true);
      assert.equal(
        (own.body.data.inventoryBatches.upserted as Array<{ unitCost?: string }>)[0]?.unitCost,
        undefined,
      );
    });
  });
});

async function login(email: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  assert.equal(response.status, 200);
  return response.body.data.accessToken as string;
}

async function createBatch(stockQty: number): Promise<string> {
  const id = randomUUID();
  batchIds.push(id);
  await prisma.inventoryBatch.create({
    data: {
      id,
      orgId: brightview,
      priceCode: id.slice(0, 8),
      prefix: 'TS',
      productName: 'Sync test lens',
      category: 'Lenses',
      costPrice: '1.00',
      salePrice: '10.00',
      stockQty,
    },
  });
  return id;
}

function trackLocalId(): string {
  const localId = randomUUID();
  localIds.push(localId);
  return localId;
}

function sale(localId: string, batchId: string, quantity: number): OfflineInvoice {
  return {
    localId,
    customerId: bilal,
    status: 'PAID',
    paymentType: 'CASH',
    discount: '0.00',
    issuedAt: '2026-09-29T12:00:00.000Z',
    items: [
      {
        localItemId: randomUUID(),
        inventoryBatchId: batchId,
        quantity,
        unitPrice: '10.00',
      },
    ],
  };
}
