import './setup-env.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
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
const prefix = 'critical-iso';

describe('data isolation', () => {
  let retailerA: TestAccount;
  let retailerB: TestAccount;
  let wholesalerA: TestAccount;
  let wholesalerB: TestAccount;
  let labA: TestAccount;
  let labB: TestAccount;
  let tokenA = '';
  let tokenB = '';
  let wholesalerTokenA = '';
  let wholesalerTokenB = '';
  let labTokenA = '';
  let labTokenB = '';
  let customerA = '';
  let customerB = '';
  let productA = '';
  let productB = '';
  let jobA = '';
  let jobB = '';
  let orderId = '';

  before(async () => {
    await removeByPrefix(prefix);
    retailerA = await createAccount({
      prefix,
      slug: 'retailer-a',
      type: 'RETAILER',
      role: 'OWNER',
    });
    retailerB = await createAccount({
      prefix,
      slug: 'retailer-b',
      type: 'RETAILER',
      role: 'OWNER',
    });
    wholesalerA = await createAccount({
      prefix,
      slug: 'wholesaler-a',
      type: 'WHOLESALER',
      role: 'ADMIN',
    });
    wholesalerB = await createAccount({
      prefix,
      slug: 'wholesaler-b',
      type: 'WHOLESALER',
      role: 'ADMIN',
    });
    labA = await createAccount({ prefix, slug: 'lab-a', type: 'LABORATORY', role: 'ADMIN' });
    labB = await createAccount({ prefix, slug: 'lab-b', type: 'LABORATORY', role: 'ADMIN' });

    customerA = (
      await prisma.customer.create({ data: { orgId: retailerA.orgId, name: 'Isolation Ayesha' } })
    ).id;
    customerB = (
      await prisma.customer.create({ data: { orgId: retailerB.orgId, name: 'Isolation Bilal' } })
    ).id;
    productA = (
      await prisma.catalogProduct.create({
        data: {
          orgId: wholesalerA.orgId,
          name: 'Isolation lens A',
          category: 'Lenses',
          listedPrice: '100.00',
        },
      })
    ).id;
    productB = (
      await prisma.catalogProduct.create({
        data: {
          orgId: wholesalerB.orgId,
          name: 'Isolation lens B',
          category: 'Lenses',
          listedPrice: '200.00',
        },
      })
    ).id;
    await prisma.retailerConnection.create({
      data: {
        retailerOrgId: retailerA.orgId,
        wholesalerOrgId: wholesalerA.orgId,
        status: 'APPROVED',
        visibilityMode: 'FULL',
        approvedAt: new Date(),
      },
    });
    jobA = (
      await prisma.labJob.create({
        data: {
          labOrgId: labA.orgId,
          referenceNumber: `ISO-A-${labA.orgId.slice(0, 8)}`,
          patientName: 'Isolation Patient A',
          prescription: { note: 'a' },
        },
      })
    ).id;
    jobB = (
      await prisma.labJob.create({
        data: {
          labOrgId: labB.orgId,
          referenceNumber: `ISO-B-${labB.orgId.slice(0, 8)}`,
          patientName: 'Isolation Patient B',
          prescription: { note: 'b' },
        },
      })
    ).id;

    tokenA = (await login(app, retailerA.email)).accessToken;
    tokenB = (await login(app, retailerB.email)).accessToken;
    wholesalerTokenA = (await login(app, wholesalerA.email)).accessToken;
    wholesalerTokenB = (await login(app, wholesalerB.email)).accessToken;
    labTokenA = (await login(app, labA.email)).accessToken;
    labTokenB = (await login(app, labB.email)).accessToken;

    const created = await request(app)
      .post('/api/v1/orders')
      .set(authHeader(tokenA))
      .send({
        wholesalerOrgId: wholesalerA.orgId,
        items: [{ catalogProductId: productA, quantity: 1 }],
      });
    assert.equal(created.status, 201);
    orderId = created.body.data.id as string;
    const thread = await prisma.chatThread.findUniqueOrThrow({ where: { orderId } });
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderOrgId: retailerA.orgId,
        senderUserId: retailerA.userId,
        content: 'Isolation only message',
        messageType: 'TEXT',
      },
    });
  });

  after(async () => {
    await removeByPrefix(prefix);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('returns only the signed-in retailer customers', async () => {
    const own = await request(app).get('/api/v1/retailer/customers').set(authHeader(tokenA));
    assert.equal(own.status, 200);
    const names = (own.body.data as Array<{ name: string; id: string }>).map((row) => row.id);
    assert.equal(names.includes(customerA), true);
    assert.equal(names.includes(customerB), false);

    const other = await request(app)
      .get(`/api/v1/retailer/customers/${customerB}`)
      .set(authHeader(tokenA));
    assert.equal(other.status, 404);
  });

  it('returns only the signed-in wholesaler catalog', async () => {
    const own = await request(app)
      .get('/api/v1/wholesaler/catalog')
      .set(authHeader(wholesalerTokenA));
    assert.equal(own.status, 200);
    const ids = catalogIds(own.body);
    assert.equal(ids.includes(productA), true);
    assert.equal(ids.includes(productB), false);

    const other = await request(app)
      .get('/api/v1/wholesaler/catalog')
      .set(authHeader(wholesalerTokenB));
    const otherIds = catalogIds(other.body);
    assert.equal(otherIds.includes(productB), true);
    assert.equal(otherIds.includes(productA), false);
  });

  it('returns only the signed-in laboratory jobs', async () => {
    const own = await request(app).get('/api/v1/lab/jobs').set(authHeader(labTokenA));
    assert.equal(own.status, 200);
    const ids = (own.body.data.jobs as Array<{ id: string }>).map((job) => job.id);
    assert.equal(ids.includes(jobA), true);
    assert.equal(ids.includes(jobB), false);

    const other = await request(app).get(`/api/v1/lab/jobs/${jobB}`).set(authHeader(labTokenA));
    assert.notEqual(other.status, 200);
    const ownJob = await request(app).get(`/api/v1/lab/jobs/${jobA}`).set(authHeader(labTokenB));
    assert.notEqual(ownJob.status, 200);
  });

  it('shows an order and its chat only to the two participating organisations', async () => {
    const retailerView = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(authHeader(tokenA));
    const wholesalerView = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(authHeader(wholesalerTokenA));
    assert.equal(retailerView.status, 200);
    assert.equal(wholesalerView.status, 200);

    const strangerRetailer = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(authHeader(tokenB));
    const strangerWholesaler = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(authHeader(wholesalerTokenB));
    const strangerLab = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set(authHeader(labTokenA));
    assert.equal(strangerRetailer.status, 403);
    assert.equal(strangerWholesaler.status, 404);
    assert.equal(strangerLab.status, 403);

    const messages = await request(app)
      .get(`/api/v1/orders/${orderId}/chat/messages`)
      .set(authHeader(tokenA));
    assert.equal(messages.status, 200);
    assert.equal(JSON.stringify(messages.body).includes('Isolation only message'), true);

    const hidden = await request(app)
      .get(`/api/v1/orders/${orderId}/chat/messages`)
      .set(authHeader(tokenB));
    assert.equal(hidden.status, 403);
    const hiddenLab = await request(app)
      .get(`/api/v1/orders/${orderId}/chat/messages`)
      .set(authHeader(labTokenA));
    assert.equal(hiddenLab.status, 403);
  });
});

function catalogIds(body: { data?: unknown }): string[] {
  const data = body.data;
  if (Array.isArray(data)) {
    return data.map((row) => (row as { id: string }).id);
  }
  if (typeof data === 'object' && data !== null && 'products' in data) {
    const products = (data as { products: Array<{ id: string }> }).products;
    return products.map((row) => row.id);
  }
  return [];
}
