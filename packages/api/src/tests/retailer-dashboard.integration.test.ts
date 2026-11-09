import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const email = 'dashboard-retailer@example.com';
const precisionLabId = '10000000-0000-4000-8000-000000000004';

describe('retailer dashboard', () => {
  after(async () => {
    await removeOrg(email);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('returns shop stats, recent invoices, and unread alerts', async () => {
    await removeOrg(email);
    const created = await request(app).post('/api/v1/onboarding/complete').send({
      orgType: 'RETAILER',
      businessName: 'Dashboard Optics',
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

    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const customer = await prisma.customer.create({
      data: { orgId, name: 'Sana Ali', phone: '+92 321 5550199' },
    });
    const dueCustomer = await prisma.customer.create({
      data: { orgId, name: 'Omar Shah', phone: '+92 321 5550198' },
    });
    await prisma.inventoryBatch.createMany({
      data: [
        {
          orgId,
          priceCode: '1001',
          prefix: 'FR',
          productName: 'Frame',
          category: 'Frames',
          salePrice: '100.00',
          stockQty: 2,
          lowStockThreshold: 5,
        },
        {
          orgId,
          priceCode: '1002',
          prefix: 'LN',
          productName: 'Lens',
          category: 'Lenses',
          salePrice: '80.00',
          stockQty: 10,
          lowStockThreshold: 2,
        },
      ],
    });
    const paid = await prisma.invoice.create({
      data: {
        orgId,
        customerId: customer.id,
        invoiceNumber: 1,
        status: 'PAID',
        total: '100.00',
        paymentType: 'CASH',
        issuedAt: today,
      },
    });
    await prisma.invoice.create({
      data: {
        orgId,
        customerId: customer.id,
        invoiceNumber: 2,
        status: 'PAID',
        total: '50.00',
        paymentType: 'CASH',
        issuedAt: yesterday,
      },
    });
    const credit = await prisma.invoice.create({
      data: {
        orgId,
        customerId: dueCustomer.id,
        invoiceNumber: 3,
        status: 'CREDIT',
        total: '80.00',
        paymentType: 'CREDIT',
        issuedAt: yesterday,
        items: {
          create: {
            productName: 'Lens',
            priceCode: '1002',
            quantity: 1,
            unitPrice: '80.00',
            salePrice: '80.00',
          },
        },
        payments: {
          create: {
            orgId,
            customerId: dueCustomer.id,
            amount: '30.00',
            method: 'CASH',
          },
        },
      },
    });
    await prisma.labJob.createMany({
      data: [
        {
          labOrgId: precisionLabId,
          retailerOrgId: orgId,
          referenceNumber: `LJ-${orgId.slice(0, 8)}-1`,
          patientName: 'Sana Ali',
          prescription: { sph: '-1.00' },
          status: 'READY',
        },
        {
          labOrgId: precisionLabId,
          retailerOrgId: orgId,
          referenceNumber: `LJ-${orgId.slice(0, 8)}-2`,
          patientName: 'Omar Shah',
          prescription: { sph: '-2.00' },
          status: 'CUTTING',
        },
      ],
    });
    await prisma.alert.create({
      data: {
        orgId,
        type: 'LOW_STOCK',
        title: 'Frame is low',
        body: 'Stock is below the threshold.',
        isRead: false,
      },
    });

    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    assert.equal(login.status, 200);
    const token = login.body.data.accessToken as string;

    const stats = await request(app)
      .get('/api/v1/retailer/dashboard/stats')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(stats.status, 200);
    assert.equal(stats.body.data.todaySales, '100.00');
    assert.equal(stats.body.data.yesterdaySales, '130.00');
    assert.equal(stats.body.data.salesChangePercent, -23.1);
    assert.equal(stats.body.data.outstandingDues, '50.00');
    assert.equal(stats.body.data.outstandingCustomerCount, 1);
    assert.equal(stats.body.data.stockItemCount, 2);
    assert.equal(stats.body.data.lowStockCount, 1);
    assert.equal(stats.body.data.activeLabJobCount, 2);
    assert.equal(stats.body.data.readyLabJobCount, 1);
    assert.equal(stats.body.data.monthlySales.length, 6);
    assert.equal(stats.body.data.monthlySales[5].isCurrent, true);

    const invoices = await request(app)
      .get('/api/v1/retailer/invoices?limit=10')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(invoices.status, 200);
    assert.equal(invoices.body.data[0].id, paid.id);
    assert.equal(invoices.body.data[0].customerName, 'Sana Ali');
    assert.equal(invoices.body.meta.total, 3);

    const detail = await request(app)
      .get(`/api/v1/retailer/invoices/${credit.id}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.invoiceNumber, 3);
    assert.equal(detail.body.data.items[0].productName, 'Lens');

    const alerts = await request(app)
      .get('/api/v1/retailer/alerts?limit=5')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(alerts.status, 200);
    assert.equal(alerts.body.data[0].title, 'Frame is low');
    assert.equal(alerts.body.meta.total, 1);

    const outsider = await request(app).post('/api/v1/auth/login').send({
      email: 'owner@brightview.example',
      password,
    });
    const hidden = await request(app)
      .get(`/api/v1/retailer/invoices/${credit.id}`)
      .set('Authorization', `Bearer ${outsider.body.data.accessToken}`);
    assert.equal(hidden.status, 404);

    const wholesaler = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@lensline.example',
      password,
    });
    const denied = await request(app)
      .get('/api/v1/retailer/dashboard/stats')
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
  await prisma.labJob.deleteMany({ where: { retailerOrgId: orgId } });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { orgId } } });
  await prisma.payment.deleteMany({ where: { orgId } });
  await prisma.invoice.deleteMany({ where: { orgId } });
  await prisma.customer.deleteMany({ where: { orgId } });
  await prisma.inventoryBatch.deleteMany({ where: { orgId } });
  await prisma.alert.deleteMany({ where: { orgId } });
  await prisma.subscription.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organisation.delete({ where: { id: orgId } });
}
