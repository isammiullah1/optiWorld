import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const ownerEmail = 'reports-owner@example.com';
const otherEmail = 'reports-other@example.com';

describe('retailer alerts and reports', () => {
  after(async () => {
    await removeOrg(ownerEmail);
    await removeOrg(otherEmail);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('scopes alerts and shop reports to the signed-in retailer', async () => {
    await removeOrg(ownerEmail);
    await removeOrg(otherEmail);
    const owner = await onboard('Report Optics', ownerEmail, 'Sara Report');
    const other = await onboard('Other Report Optics', otherEmail, 'Hina Report');
    const token = await activate(owner.orgId, ownerEmail);
    const otherToken = await activate(other.orgId, otherEmail);
    const today = new Date().toISOString().slice(0, 10);
    const old = new Date(Date.now() - 100 * 86_400_000);

    const customer = await prisma.customer.create({
      data: { orgId: owner.orgId, name: 'Ayesha Report', phone: '+92 300 5550192' },
    });
    const batch = await prisma.inventoryBatch.create({
      data: {
        orgId: owner.orgId,
        priceCode: 'RPT-1',
        prefix: 'RP',
        productName: 'Report Lens',
        category: 'Lenses',
        salePrice: '100.00',
        costPrice: '40.00',
        stockQty: 8,
        lowStockThreshold: 3,
      },
    });
    await prisma.stockMovement.createMany({
      data: [
        {
          orgId: owner.orgId,
          batchId: batch.id,
          type: 'RECEIVED',
          quantityChange: 10,
          balanceAfter: 10,
        },
        {
          orgId: owner.orgId,
          batchId: batch.id,
          type: 'SALE',
          quantityChange: -2,
          balanceAfter: 8,
        },
      ],
    });
    await prisma.invoice.create({
      data: {
        orgId: owner.orgId,
        customerId: customer.id,
        invoiceNumber: 1,
        status: 'PAID',
        total: '100.00',
        paymentType: 'CASH',
        issuedAt: new Date(),
        items: {
          create: {
            productName: 'Report Lens',
            priceCode: 'RPT-1',
            quantity: 2,
            unitPrice: '50.00',
            salePrice: '50.00',
          },
        },
      },
    });
    await prisma.invoice.create({
      data: {
        orgId: owner.orgId,
        customerId: customer.id,
        invoiceNumber: 2,
        status: 'CREDIT',
        total: '400.00',
        paymentType: 'CREDIT',
        issuedAt: old,
      },
    });
    const alert = await prisma.alert.create({
      data: {
        orgId: owner.orgId,
        type: 'LOW_STOCK',
        title: 'Report Lens is low',
        body: 'Stock is below the threshold.',
        relatedEntityId: batch.id,
        relatedEntityType: 'InventoryBatch',
      },
    });
    await prisma.alert.create({
      data: {
        orgId: owner.orgId,
        type: 'ORDER_DISPATCHED',
        title: 'Order left the wholesaler',
        body: 'Dispatched yesterday.',
        isRead: true,
      },
    });

    const unread = await request(app)
      .get('/api/v1/retailer/alerts?limit=5')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(unread.status, 200);
    assert.equal(unread.body.meta.total, 1);
    assert.equal(unread.body.data[0].title, 'Report Lens is low');
    assert.equal(unread.body.data[0].isRead, false);

    const all = await request(app)
      .get('/api/v1/retailer/alerts?includeRead=true&limit=20')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(all.body.data.length, 2);

    const orders = await request(app)
      .get('/api/v1/retailer/alerts?includeRead=true&category=ORDERS&limit=20')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(orders.body.data.length, 1);
    assert.equal(orders.body.data[0].type, 'ORDER_DISPATCHED');

    const hidden = await request(app)
      .patch(`/api/v1/retailer/alerts/${alert.id}/read`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(hidden.status, 404);

    const marked = await request(app)
      .patch(`/api/v1/retailer/alerts/${alert.id}/read`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(marked.status, 200);
    assert.equal(marked.body.data.isRead, true);

    const cleared = await request(app)
      .patch('/api/v1/retailer/alerts/read-all')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(cleared.status, 200);

    const sales = await request(app)
      .get(`/api/v1/retailer/reports/sales?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(sales.status, 200);
    assert.equal(sales.body.data.revenue, '100.00');
    assert.equal(sales.body.data.invoiceCount, 1);
    assert.equal(sales.body.data.cashTotal, '100.00');
    assert.equal(sales.body.data.creditTotal, '0.00');
    assert.equal(sales.body.data.topProducts[0].productName, 'Report Lens');
    assert.equal(JSON.stringify(sales.body).includes('costPrice'), false);

    const inventory = await request(app)
      .get(`/api/v1/retailer/reports/inventory?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(inventory.status, 200);
    assert.equal(inventory.body.data.itemsSold, 1);
    assert.equal(inventory.body.data.unitsMoved, 12);
    assert.equal(inventory.body.data.lowStockEvents, 1);
    assert.equal(inventory.body.data.rows[0].opening, 0);
    assert.equal(inventory.body.data.rows[0].added, 10);
    assert.equal(inventory.body.data.rows[0].sold, 2);
    assert.equal(inventory.body.data.rows[0].units, 12);
    assert.equal(inventory.body.data.rows[0].closing, 8);
    assert.equal(inventory.body.data.lowStockItems.length, 1);
    assert.equal(inventory.body.data.lowStockItems[0].title, 'Report Lens is low');
    assert.equal(JSON.stringify(inventory.body).includes('costPrice'), false);
    assert.equal(JSON.stringify(inventory.body).includes('40.00'), false);

    const credit = await request(app)
      .get('/api/v1/retailer/reports/credit')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(credit.status, 200);
    assert.equal(credit.body.data.months.length, 6);
    assert.equal(credit.body.data.months[5].total, '400.00');
    assert.equal(credit.body.data.rows[0].risk, 'severe');

    const exported = await request(app)
      .post('/api/v1/retailer/reports/export')
      .set('Authorization', `Bearer ${token}`)
      .send({ reportType: 'SALES', dateRange: { from: today, to: today } });
    assert.equal(exported.status, 200);
    assert.match(String(exported.headers['content-type']), /spreadsheetml/);
    const file = Buffer.isBuffer(exported.body)
      ? exported.body
      : Buffer.from(exported.text, 'binary');
    assert.equal(file.subarray(0, 2).toString(), 'PK');

    const creditInvoice = await prisma.invoice.findFirst({
      where: { orgId: owner.orgId, invoiceNumber: 2 },
      select: { id: true },
    });
    assert.ok(creditInvoice);
    const clearedCredit = await request(app)
      .post(`/api/v1/retailer/invoices/${creditInvoice.id}/clear-credit`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(clearedCredit.status, 200);
    assert.equal(clearedCredit.body.data.status, 'PAID');
    assert.equal(clearedCredit.body.data.outstanding, '0.00');
    const clearedAgain = await request(app)
      .post(`/api/v1/retailer/invoices/${creditInvoice.id}/clear-credit`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(clearedAgain.status, 422);

    const paidInvoice = await prisma.invoice.findFirst({
      where: { orgId: owner.orgId, invoiceNumber: 1 },
      select: { id: true },
    });
    assert.ok(paidInvoice);
    const removed = await request(app)
      .delete(`/api/v1/retailer/invoices/${paidInvoice.id}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(removed.status, 200);
    assert.equal(await prisma.invoice.count({ where: { id: paidInvoice.id } }), 0);
    const outsiderDelete = await request(app)
      .delete(`/api/v1/retailer/invoices/${creditInvoice.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(outsiderDelete.status, 404);

    await prisma.user.update({ where: { email: ownerEmail }, data: { role: 'STAFF' } });
    const staffToken = await activate(owner.orgId, ownerEmail);
    const staffSales = await request(app)
      .get(`/api/v1/retailer/reports/sales?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${staffToken}`);
    assert.equal(staffSales.status, 200);
    const staffClear = await request(app)
      .post(`/api/v1/retailer/invoices/${creditInvoice.id}/clear-credit`)
      .set('Authorization', `Bearer ${staffToken}`);
    assert.equal(staffClear.status, 403);
    const staffRemove = await request(app)
      .delete(`/api/v1/retailer/invoices/${creditInvoice.id}`)
      .set('Authorization', `Bearer ${staffToken}`);
    assert.equal(staffRemove.status, 403);
    const staffCredit = await request(app)
      .get('/api/v1/retailer/reports/credit')
      .set('Authorization', `Bearer ${staffToken}`);
    assert.equal(staffCredit.status, 403);
    const staffExport = await request(app)
      .post('/api/v1/retailer/reports/export')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ reportType: 'CREDIT', dateRange: { from: today, to: today } });
    assert.equal(staffExport.status, 403);

    const outsider = await request(app)
      .get(`/api/v1/retailer/reports/sales?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(outsider.body.data.invoiceCount, 0);
  });
});

async function onboard(
  businessName: string,
  email: string,
  fullName: string,
): Promise<{ orgId: string }> {
  const created = await request(app).post('/api/v1/onboarding/complete').send({
    orgType: 'RETAILER',
    businessName,
    city: 'Lahore',
    phone: '+92 300 5550193',
    fullName,
    email,
    password,
  });
  assert.equal(created.status, 201);
  return { orgId: created.body.data.user.orgId as string };
}

async function activate(orgId: string, email: string): Promise<string> {
  await prisma.organisation.update({
    where: { id: orgId },
    data: { subscriptionStatus: 'ACTIVE' },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  assert.equal(login.status, 200);
  return login.body.data.accessToken as string;
}

async function removeOrg(address: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: address } });
  if (!user?.orgId) {
    return;
  }
  const orgId = user.orgId;
  await prisma.alert.deleteMany({ where: { orgId } });
  await prisma.stockMovement.deleteMany({ where: { orgId } });
  await prisma.payment.deleteMany({ where: { orgId } });
  const invoices = await prisma.invoice.findMany({ where: { orgId }, select: { id: true } });
  await prisma.invoiceItem.deleteMany({
    where: { invoiceId: { in: invoices.map((invoice) => invoice.id) } },
  });
  await prisma.invoice.deleteMany({ where: { orgId } });
  await prisma.invoiceSequence.deleteMany({ where: { orgId } });
  await prisma.inventoryBatch.deleteMany({ where: { orgId } });
  await prisma.customer.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.subscription.deleteMany({ where: { orgId } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organisation.delete({ where: { id: orgId } });
}
