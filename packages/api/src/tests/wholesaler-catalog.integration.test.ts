import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const wholesalerEmail = 'catalog-wholesaler@example.com';
const otherEmail = 'catalog-other@example.com';
const retailerEmail = 'catalog-retailer@example.com';

describe('wholesaler catalog and dashboard', () => {
  after(async () => {
    await removeOrg(wholesalerEmail);
    await removeOrg(otherEmail);
    await removeOrg(retailerEmail);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('keeps catalog and order counts inside the signed-in wholesaler', async () => {
    await removeOrg(wholesalerEmail);
    await removeOrg(otherEmail);
    await removeOrg(retailerEmail);
    const wholesaler = await onboard('WHOLESALER', 'Lens Test', wholesalerEmail, 'Omar Test');
    const other = await onboard('WHOLESALER', 'Other Lens', otherEmail, 'Nadia Test');
    const retailer = await onboard('RETAILER', 'Shop Test', retailerEmail, 'Sara Test');
    const token = await activate(wholesaler.orgId, wholesalerEmail);
    const otherToken = await activate(other.orgId, otherEmail);
    const retailerToken = await activate(retailer.orgId, retailerEmail);

    const created = await request(app)
      .post('/api/v1/wholesaler/catalog')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Test CR39',
        category: 'Lenses',
        description: 'Stock lens',
        listedPrice: '900.00',
        isPriceOnRequest: false,
        availabilityStatus: 'AVAILABLE',
        productCode: 'TST-CR39',
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.listedPrice, '900.00');

    const hidden = await request(app)
      .post('/api/v1/wholesaler/catalog')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Quoted Frame',
        category: 'Frames',
        isPriceOnRequest: true,
        listedPrice: '50.00',
        availabilityStatus: 'AVAILABLE',
      });
    assert.equal(hidden.status, 201);
    assert.equal(hidden.body.data.listedPrice, null);
    assert.equal(hidden.body.data.isPriceOnRequest, true);

    const outsider = await request(app)
      .get('/api/v1/wholesaler/catalog')
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(outsider.status, 200);
    assert.equal(outsider.body.data.length, 0);

    const retailerBlocked = await request(app)
      .get('/api/v1/wholesaler/catalog')
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(retailerBlocked.status, 403);

    const onRequest = await request(app)
      .get('/api/v1/wholesaler/catalog?priceOnRequest=true')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(onRequest.body.data.length, 1);
    assert.equal(onRequest.body.data[0].name, 'Quoted Frame');

    const bulk = await request(app)
      .patch('/api/v1/wholesaler/catalog/availability')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [created.body.data.id], availabilityStatus: 'OUT_OF_STOCK' });
    assert.equal(bulk.status, 200);
    assert.equal(bulk.body.data.updated, 1);

    const foreignBulk = await request(app)
      .patch('/api/v1/wholesaler/catalog/availability')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ ids: [created.body.data.id], availabilityStatus: 'AVAILABLE' });
    assert.equal(foreignBulk.status, 404);

    const removed = await request(app)
      .delete(`/api/v1/wholesaler/catalog/${hidden.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(removed.status, 200);
    const stored = await prisma.catalogProduct.findUnique({
      where: { id: hidden.body.data.id as string },
    });
    assert.ok(stored?.deletedAt);

    const connection = await prisma.retailerConnection.create({
      data: {
        wholesalerOrgId: wholesaler.orgId,
        retailerOrgId: retailer.orgId,
        status: 'APPROVED',
        visibilityMode: 'FULL',
      },
    });
    const order = await prisma.order.create({
      data: {
        wholesalerOrgId: wholesaler.orgId,
        retailerOrgId: retailer.orgId,
        connectionId: connection.id,
        status: 'PENDING',
        totalValue: '900.00',
        items: {
          create: {
            catalogProductId: created.body.data.id,
            productName: 'Test CR39',
            quantity: 1,
            agreedPrice: '900.00',
          },
        },
      },
    });
    const thread = await prisma.chatThread.create({ data: { orderId: order.id } });
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderOrgId: retailer.orgId,
        senderUserId: (await prisma.user.findUniqueOrThrow({ where: { email: retailerEmail } })).id,
        content: 'New order from Shop Test.',
        messageType: 'SYSTEM',
      },
    });

    const dashboard = await request(app)
      .get('/api/v1/wholesaler/dashboard')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(dashboard.status, 200);
    const payload = JSON.stringify(dashboard.body);
    assert.equal(payload.includes('totalValue'), false);
    assert.equal(payload.includes('revenue'), false);
    assert.equal(dashboard.body.data.pendingOrders, 1);
    assert.equal(dashboard.body.data.activeConnections, 1);
    assert.equal(dashboard.body.data.outOfStockProducts, 1);
    assert.equal(dashboard.body.data.ordersToday, 1);
    assert.equal(dashboard.body.data.recentOrders[0].hasUnread, true);
    assert.equal(dashboard.body.data.recentOrders[0].itemCount, 1);

    const retailerConfirm = await request(app)
      .post(`/api/v1/orders/${order.id}/confirm`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(retailerConfirm.status, 403);

    const confirmed = await request(app)
      .post(`/api/v1/orders/${order.id}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(confirmed.status, 200);
    const locked = await prisma.order.findUnique({ where: { id: order.id } });
    assert.equal(locked?.status, 'CONFIRMED');
    assert.ok(locked?.lockedAt);

    const again = await request(app)
      .post(`/api/v1/orders/${order.id}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'ORDER_LOCKED');
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
    phone: '+92 300 5550194',
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
