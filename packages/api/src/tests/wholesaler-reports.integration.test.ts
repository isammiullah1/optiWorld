import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import ExcelJS from 'exceljs';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const wholesalerEmail = 'reports-wholesaler@example.com';
const otherEmail = 'reports-other@example.com';
const retailerEmail = 'reports-retailer@example.com';

describe('wholesaler listing profile and operational reports', () => {
  after(async () => {
    await removeOrg(wholesalerEmail);
    await removeOrg(otherEmail);
    await removeOrg(retailerEmail);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('edits the listing retailers see and reports order counts without revenue', async () => {
    await removeOrg(wholesalerEmail);
    await removeOrg(otherEmail);
    await removeOrg(retailerEmail);
    const wholesaler = await onboard('WHOLESALER', 'Report Lens', wholesalerEmail, 'Omar Report');
    const other = await onboard('WHOLESALER', 'Other Report', otherEmail, 'Nadia Report');
    const retailer = await onboard('RETAILER', 'Report Shop', retailerEmail, 'Sara Report');
    const token = await activate(wholesaler.orgId, wholesalerEmail);
    const otherToken = await activate(other.orgId, otherEmail);
    const retailerToken = await activate(retailer.orgId, retailerEmail);
    const today = new Date().toISOString().slice(0, 10);

    const profile = await request(app)
      .get('/api/v1/wholesaler/profile')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.businessName, 'Report Lens');

    const saved = await request(app)
      .patch('/api/v1/wholesaler/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        businessName: 'Report Lens',
        city: 'Lahore',
        phone: '+92 42 1110099',
        whatsappNumber: '+92 300 5550199',
        listingProfileNotes: 'Stock lenses for approved shops.',
      });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.listingProfileNotes, 'Stock lenses for approved shops.');

    const denied = await request(app)
      .get('/api/v1/wholesaler/profile')
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(denied.status, 403);

    const requested = await request(app)
      .post('/api/v1/retailer/wholesaler-connections')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({ wholesalerOrgId: wholesaler.orgId });
    await request(app)
      .patch(`/api/v1/wholesaler/connections/${requested.body.data.id as string}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visibilityMode: 'FULL' });
    const product = await request(app)
      .post('/api/v1/wholesaler/catalog')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Report Lens SV',
        category: 'Lenses',
        listedPrice: '100.00',
        isPriceOnRequest: false,
        availabilityStatus: 'AVAILABLE',
      });
    const created = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({
        wholesalerOrgId: wholesaler.orgId,
        items: [{ catalogProductId: product.body.data.id, quantity: 2 }],
      });
    assert.equal(created.status, 201);
    const orderId = created.body.data.id as string;

    const catalog = await request(app)
      .get(`/api/v1/catalog/${wholesaler.orgId}`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(catalog.status, 200);
    assert.equal(
      catalog.body.data.wholesaler.listingProfileNotes,
      'Stock lenses for approved shops.',
    );
    assert.equal(catalog.body.data.wholesaler.whatsappNumber, '+92 300 5550199');
    assert.equal(catalog.body.data.wholesaler.city, 'Lahore');

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { chatThread: true },
    });
    const user = await prisma.user.findUnique({ where: { email: wholesalerEmail } });
    assert.ok(order?.chatThread && user);
    const repliedAt = new Date(order.createdAt.getTime() + 30 * 60_000);
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CONFIRMED', lockedAt: order.createdAt },
    });
    await prisma.chatMessage.create({
      data: {
        threadId: order.chatThread.id,
        senderOrgId: wholesaler.orgId,
        senderUserId: user.id,
        content: 'Yes, all available',
        messageType: 'TEXT',
        createdAt: repliedAt,
      },
    });
    await prisma.chatMessage.create({
      data: {
        threadId: order.chatThread.id,
        senderOrgId: wholesaler.orgId,
        senderUserId: user.id,
        content: 'Order dispatched.',
        messageType: 'SYSTEM',
        createdAt: new Date(),
      },
    });

    const activity = await request(app)
      .get(`/api/v1/wholesaler/reports/order-activity?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(activity.status, 200);
    assert.equal(activity.body.data.counts.received, 1);
    assert.equal(activity.body.data.counts.confirmed, 1);
    assert.equal(activity.body.data.counts.dispatched, 1);
    assert.equal(activity.body.data.counts.delivered, 0);
    assert.equal(activity.body.data.orders[0].itemsSummary, 'Report Lens SV × 2');
    assert.equal(activity.body.data.orders[0].retailerName, 'Report Shop');
    assert.equal(activity.body.data.responseTime.averageMinutes, 30);
    assert.equal(activity.body.data.byRetailer[0].retailerName, 'Report Shop');
    const payload = JSON.stringify(activity.body);
    assert.equal(payload.includes('totalValue'), false);
    assert.equal(payload.includes('revenue'), false);
    assert.equal(payload.includes('agreedPrice'), false);

    const products = await request(app)
      .get(`/api/v1/wholesaler/reports/catalog-activity?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(products.status, 200);
    assert.equal(products.body.data.products[0].productName, 'Report Lens SV');
    assert.equal(products.body.data.products[0].orderLines, 1);
    assert.equal(JSON.stringify(products.body).includes('100.00'), false);

    const outsider = await request(app)
      .get(`/api/v1/wholesaler/reports/order-activity?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(outsider.body.data.counts.received, 0);
    const retailerBlocked = await request(app)
      .get(`/api/v1/wholesaler/reports/catalog-activity?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(retailerBlocked.status, 403);

    const exported = await request(app)
      .get(`/api/v1/wholesaler/reports/order-activity/export?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    assert.equal(exported.status, 200);
    const file = Buffer.isBuffer(exported.body)
      ? exported.body
      : Buffer.from(exported.text, 'binary');
    assert.equal(file.subarray(0, 2).toString(), 'PK');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
    const headers = JSON.stringify(workbook.worksheets[0]?.getRow(1).values ?? []);
    assert.equal(headers.includes('Order #'), true);
    assert.equal(headers.toLowerCase().includes('revenue'), false);
    assert.equal(headers.toLowerCase().includes('total'), false);
  });
});

async function onboard(
  orgType: 'RETAILER' | 'WHOLESALER',
  businessName: string,
  email: string,
  fullName: string,
): Promise<{ orgId: string }> {
  const created = await request(app).post('/api/v1/onboarding/complete').send({
    orgType,
    businessName,
    city: 'Lahore',
    phone: '+92 300 5550196',
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
  if (!user) {
    return;
  }
  const orgId = user.orgId;
  const orders = await prisma.order.findMany({
    where: { OR: [{ retailerOrgId: orgId }, { wholesalerOrgId: orgId }] },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  await prisma.changeRequest.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.chatMessage.deleteMany({ where: { thread: { orderId: { in: orderIds } } } });
  await prisma.chatThread.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.retailerConnection.deleteMany({
    where: { OR: [{ retailerOrgId: orgId }, { wholesalerOrgId: orgId }] },
  });
  await prisma.catalogProduct.deleteMany({ where: { orgId } });
  await prisma.alert.deleteMany({
    where: { OR: [{ orgId }, { relatedEntityId: { in: orderIds } }] },
  });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.subscription.deleteMany({ where: { orgId } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organisation.delete({ where: { id: orgId } });
}
