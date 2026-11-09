import './setup-env.js';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const email = 'customers-retailer@example.com';

describe('retailer customers', () => {
  after(async () => {
    await removeOrg(email);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('lists, updates, and records a payment against outstanding dues', async () => {
    await removeOrg(email);
    const created = await request(app).post('/api/v1/onboarding/complete').send({
      orgType: 'RETAILER',
      businessName: 'Customer Optics',
      city: 'Lahore',
      phone: '+92 300 5550177',
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

    const added = await request(app)
      .post('/api/v1/retailer/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Sana Ali',
        phone: '+92 321 5550177',
        email: 'sana@example.com',
        address: 'Gulberg',
        creditLimit: '5000.00',
        notes: 'Prefers plastic frames',
        whatsappNumber: '+92 300 5550178',
      });
    assert.equal(added.status, 201);
    assert.equal(added.body.data.outstanding, '0.00');
    assert.equal(added.body.data.creditLimit, '5000.00');
    const customerId = added.body.data.id as string;

    const batch = await prisma.inventoryBatch.create({
      data: {
        orgId,
        priceCode: 'FR100',
        prefix: 'FR',
        productName: 'Frame',
        category: 'Frames',
        salePrice: '500.00',
        stockQty: 4,
        lowStockThreshold: 1,
      },
    });
    const sale = await request(app)
      .post('/api/v1/retailer/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        localId: randomUUID(),
        customerId,
        paymentType: 'CREDIT',
        discount: '0.00',
        items: [{ inventoryBatchId: batch.id, quantity: 2, unitPrice: '500.00' }],
      });
    assert.equal(sale.status, 201);

    const dues = await request(app)
      .get('/api/v1/retailer/customers?dues=HAS_DUES&sort=HIGHEST_DUES')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(dues.status, 200);
    assert.equal(dues.body.data[0].name, 'Sana Ali');
    assert.equal(dues.body.data[0].outstanding, '1000.00');
    assert.equal(dues.body.data[0].totalPurchases, '1000.00');

    const profile = await request(app)
      .get(`/api/v1/retailer/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.notes, 'Prefers plastic frames');
    assert.equal(profile.body.data.invoiceCount, 1);
    assert.equal(profile.body.data.activity[0].kind, 'INVOICE');

    const updated = await request(app)
      .patch(`/api/v1/retailer/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notes: 'Call before delivery' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.notes, 'Call before delivery');

    const payment = await request(app)
      .post(`/api/v1/retailer/customers/${customerId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        amount: '400.00',
        recordedAt: new Date().toISOString(),
        method: 'BANK_TRANSFER',
        notes: 'Partial',
      });
    assert.equal(payment.status, 201);
    assert.equal(payment.body.data.outstanding, '600.00');

    const ledger = await request(app)
      .get(`/api/v1/retailer/customers/${customerId}/ledger`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(ledger.status, 200);
    assert.equal(ledger.body.data.entries[0].kind, 'DEBIT');
    assert.equal(ledger.body.data.entries[1].kind, 'CREDIT');
    assert.equal(ledger.body.data.entries[1].balance, '600.00');

    const tooMuch = await request(app)
      .post(`/api/v1/retailer/customers/${customerId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amount: '900.00', recordedAt: new Date().toISOString(), method: 'CASH' });
    assert.equal(tooMuch.status, 422);

    const staff = await request(app).post('/api/v1/auth/login').send({
      email: 'staff@brightview.example',
      password,
    });
    const hidden = await request(app)
      .get('/api/v1/retailer/customers/30000000-0000-4000-8000-000000000001/ledger')
      .set('Authorization', `Bearer ${staff.body.data.accessToken}`);
    assert.equal(hidden.status, 403);

    const wholesaler = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@lensline.example',
      password,
    });
    const denied = await request(app)
      .get('/api/v1/retailer/customers')
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
