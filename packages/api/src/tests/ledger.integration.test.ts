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
const email = 'ledger-retailer@example.com';

describe('retailer ledger and reminders', () => {
  after(async () => {
    await removeOrg(email);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('ages outstanding credit and records a reminder attempt', async () => {
    await removeOrg(email);
    const created = await request(app).post('/api/v1/onboarding/complete').send({
      orgType: 'RETAILER',
      businessName: 'Ledger Optics',
      city: 'Lahore',
      phone: '+92 300 5550199',
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

    const batch = await prisma.inventoryBatch.create({
      data: {
        orgId,
        priceCode: 'AG100',
        prefix: 'AG',
        productName: 'Aging Lens',
        category: 'Lenses',
        salePrice: '100.00',
        stockQty: 20,
        lowStockThreshold: 1,
      },
    });
    const currentCustomer = await addCustomer(token, 'Current Customer', '+92 321 5550191');
    const midCustomer = await addCustomer(token, 'Mid Customer', '+92 321 5550192');
    const oldCustomer = await addCustomer(token, 'Old Customer', '+92 321 5550193');
    const currentInvoice = await sell(token, currentCustomer, batch.id, '100.00');
    const midInvoice = await sell(token, midCustomer, batch.id, '200.00');
    const oldInvoice = await sell(token, oldCustomer, batch.id, '400.00');
    const now = Date.now();
    await prisma.invoice.update({
      where: { id: currentInvoice },
      data: { issuedAt: new Date(now - 10 * 86_400_000) },
    });
    await prisma.invoice.update({
      where: { id: midInvoice },
      data: { issuedAt: new Date(now - 45 * 86_400_000) },
    });
    await prisma.invoice.update({
      where: { id: oldInvoice },
      data: { issuedAt: new Date(now - 100 * 86_400_000) },
    });

    const summary = await request(app)
      .get('/api/v1/retailer/ledger/summary')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(summary.status, 200);
    assert.equal(summary.body.data.totalOutstanding, '700.00');
    assert.equal(summary.body.data.customersWithDues, 3);
    assert.equal(summary.body.data.overdue30Plus, 2);
    assert.equal(summary.body.data.overdue60Plus, 1);
    const old = (
      summary.body.data.rows as Array<{ customerName: string; status: string; days90plus: string }>
    ).find((row) => row.customerName === 'Old Customer');
    assert.equal(old?.status, 'OVERDUE');
    assert.equal(old?.days90plus, '400.00');

    const aging = await request(app)
      .get('/api/v1/retailer/ledger/aging')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(aging.status, 200);
    assert.equal(aging.body.data.buckets.current, '100.00');
    assert.equal(aging.body.data.buckets.days31to60, '200.00');
    assert.equal(aging.body.data.buckets.days90plus, '400.00');

    const exported = await request(app)
      .get('/api/v1/retailer/ledger/aging/export')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(exported.status, 200);
    assert.match(String(exported.headers['content-type']), /spreadsheetml/);
    const file = Buffer.isBuffer(exported.body)
      ? exported.body
      : Buffer.from(exported.text, 'binary');
    assert.equal(file.subarray(0, 2).toString(), 'PK');

    const saved = await request(app)
      .patch('/api/v1/retailer/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ reminderBeforeEnabled: true, reminderBeforeDays: 2, reminderOnDueEnabled: false });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.reminderBeforeDays, 2);
    assert.equal(saved.body.data.reminderOnDueEnabled, false);

    const reminder = await request(app)
      .post('/api/v1/whatsapp/send-payment-reminder')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerIds: [oldCustomer] });
    assert.equal(reminder.status, 200);
    assert.equal(reminder.body.data.results[0].sent, false);
    const audit = await prisma.auditLog.findFirst({
      where: { orgId, action: 'WHATSAPP_REMINDER_FAILED', entityId: oldCustomer },
    });
    assert.ok(audit);

    const staff = await request(app).post('/api/v1/auth/login').send({
      email: 'staff@brightview.example',
      password,
    });
    const hidden = await request(app)
      .get('/api/v1/retailer/ledger/summary')
      .set('Authorization', `Bearer ${staff.body.data.accessToken}`);
    assert.equal(hidden.status, 403);

    const wholesaler = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@lensline.example',
      password,
    });
    const denied = await request(app)
      .get('/api/v1/retailer/ledger/aging')
      .set('Authorization', `Bearer ${wholesaler.body.data.accessToken}`);
    assert.equal(denied.status, 403);
  });
});

async function addCustomer(token: string, name: string, phone: string): Promise<string> {
  const added = await request(app)
    .post('/api/v1/retailer/customers')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, phone, whatsappNumber: phone, creditLimit: '0.00' });
  assert.equal(added.status, 201);
  return added.body.data.id as string;
}

async function sell(
  token: string,
  customerId: string,
  batchId: string,
  unitPrice: string,
): Promise<string> {
  const sale = await request(app)
    .post('/api/v1/retailer/invoices')
    .set('Authorization', `Bearer ${token}`)
    .send({
      localId: randomUUID(),
      customerId,
      paymentType: 'CREDIT',
      discount: '0.00',
      items: [{ inventoryBatchId: batchId, quantity: 1, unitPrice }],
    });
  assert.equal(sale.status, 201);
  const invoice = await prisma.invoice.findFirst({
    where: { customerId, total: unitPrice },
    select: { id: true },
  });
  assert.ok(invoice);
  return invoice.id;
}

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
