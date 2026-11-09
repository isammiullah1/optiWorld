import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const email = 'inventory-retailer@example.com';

describe('retailer inventory', () => {
  after(async () => {
    await removeOrg(email);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('creates a combined price code, adjusts stock, and alerts when low', async () => {
    await removeOrg(email);
    const created = await request(app).post('/api/v1/onboarding/complete').send({
      orgType: 'RETAILER',
      businessName: 'Inventory Optics',
      city: 'Lahore',
      phone: '+92 300 5550188',
      fullName: 'Hina Malik',
      email,
      password,
    });
    assert.equal(created.status, 201);
    const orgId = created.body.data.user.orgId as string;
    await prisma.organisation.update({
      where: { id: orgId },
      data: { subscriptionStatus: 'ACTIVE' },
    });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const token = login.body.data.accessToken as string;

    const settings = await request(app)
      .patch('/api/v1/retailer/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ defaultLowStockThreshold: 4 });
    assert.equal(settings.status, 200);
    assert.equal(settings.body.data.defaultLowStockThreshold, 4);

    const added = await request(app)
      .post('/api/v1/retailer/inventory')
      .set('Authorization', `Bearer ${token}`)
      .send({
        prefix: 'sv',
        pricePart: '500',
        manualPriceCode: false,
        productName: 'Single Vision Stock',
        brand: 'OptiClear',
        category: 'Single Vision',
        salePrice: '1800.00',
        costPrice: '900.00',
        stockQty: 6,
      });
    assert.equal(added.status, 201);
    assert.equal(added.body.data.priceCode, 'SV500');
    assert.equal(added.body.data.prefix, 'SV');
    assert.equal(added.body.data.costPrice, '900.00');
    assert.equal(added.body.data.lowStockThreshold, 4);
    const batchId = added.body.data.id as string;

    const listed = await request(app)
      .get('/api/v1/retailer/inventory?q=SV500&lowStock=false')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.rows.length, 1);

    const received = await request(app)
      .post(`/api/v1/retailer/inventory/${batchId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'RECEIVED', quantity: 2, costPrice: '1200.00' });
    assert.equal(received.status, 200);
    assert.equal(received.body.data.batch.stockQty, 8);
    assert.equal(received.body.data.batch.costPrice, '975.00');
    assert.equal(received.body.data.acquiredQty, 8);
    assert.equal(received.body.data.movements[0].type, 'RECEIVED');
    assert.equal(received.body.data.movements[0].quantityChange, 2);
    assert.equal(received.body.data.movements[0].balance, 8);

    const damaged = await request(app)
      .post(`/api/v1/retailer/inventory/${batchId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'DAMAGED', quantity: 5 });
    assert.equal(damaged.status, 200);
    assert.equal(damaged.body.data.batch.stockQty, 3);
    assert.equal(damaged.body.data.batch.lowStock, true);

    const alert = await prisma.alert.findFirst({
      where: { orgId, type: 'LOW_STOCK', relatedEntityId: batchId },
    });
    assert.ok(alert);

    const tooMany = await request(app)
      .post(`/api/v1/retailer/inventory/${batchId}/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'DAMAGED', quantity: 9 });
    assert.equal(tooMany.status, 422);

    const staff = await request(app).post('/api/v1/auth/login').send({
      email: 'staff@brightview.example',
      password,
    });
    const hidden = await request(app)
      .get('/api/v1/retailer/inventory?q=1042')
      .set('Authorization', `Bearer ${staff.body.data.accessToken}`);
    assert.equal(hidden.status, 200);
    const frame = (
      hidden.body.data.rows as Array<{ priceCode: string; costPrice: string | null }>
    ).find((row) => row.priceCode === '1042');
    assert.equal(frame?.costPrice, null);

    const wholesaler = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@lensline.example',
      password,
    });
    const denied = await request(app)
      .get('/api/v1/retailer/inventory')
      .set('Authorization', `Bearer ${wholesaler.body.data.accessToken}`);
    assert.equal(denied.status, 403);
  });
});

async function removeOrg(address: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: address } });
  if (!user) {
    return;
  }
  const orgId = user.orgId;
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.stockMovement.deleteMany({ where: { orgId } });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { orgId } } });
  await prisma.payment.deleteMany({ where: { orgId } });
  await prisma.invoice.deleteMany({ where: { orgId } });
  await prisma.invoiceSequence.deleteMany({ where: { orgId } });
  await prisma.customer.deleteMany({ where: { orgId } });
  await prisma.inventoryBatch.deleteMany({ where: { orgId } });
  await prisma.alert.deleteMany({ where: { orgId } });
  await prisma.subscription.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organisation.delete({ where: { id: orgId } });
}
