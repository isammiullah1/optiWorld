import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const wholesalerEmail = 'inbox-wholesaler@example.com';
const otherEmail = 'inbox-other@example.com';
const retailerEmail = 'inbox-retailer@example.com';

describe('wholesaler order inbox', () => {
  after(async () => {
    await removeOrg(wholesalerEmail);
    await removeOrg(otherEmail);
    await removeOrg(retailerEmail);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('lists each order value and updates status without a revenue total', async () => {
    await removeOrg(wholesalerEmail);
    await removeOrg(otherEmail);
    await removeOrg(retailerEmail);
    const wholesaler = await onboard('WHOLESALER', 'Inbox Lens', wholesalerEmail, 'Omar Inbox');
    const other = await onboard('WHOLESALER', 'Other Inbox', otherEmail, 'Nadia Inbox');
    const retailer = await onboard('RETAILER', 'Inbox Shop', retailerEmail, 'Sara Inbox');
    const token = await activate(wholesaler.orgId, wholesalerEmail);
    const otherToken = await activate(other.orgId, otherEmail);
    const retailerToken = await activate(retailer.orgId, retailerEmail);

    const requested = await request(app)
      .post('/api/v1/retailer/wholesaler-connections')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({ wholesalerOrgId: wholesaler.orgId });
    const connectionId = requested.body.data.id as string;
    await request(app)
      .patch(`/api/v1/wholesaler/connections/${connectionId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visibilityMode: 'FULL' });
    const product = await request(app)
      .post('/api/v1/wholesaler/catalog')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Inbox Lens',
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

    const list = await request(app)
      .get('/api/v1/wholesaler/orders?q=Inbox%20Shop')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].itemsSummary, 'Inbox Lens × 2');
    assert.equal(list.body.data[0].totalValue, '200.00');
    assert.equal(list.body.meta.pipeline.PENDING, 1);
    assert.equal(JSON.stringify(list.body).includes('revenue'), false);

    const blocked = await request(app)
      .get('/api/v1/wholesaler/orders')
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(blocked.status, 403);
    const outsider = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(outsider.status, 404);

    const before = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(before.status, 200);
    assert.equal(before.body.data.retailer.name, 'Inbox Shop');
    assert.equal(before.body.data.items[0].lineTotal, null);

    await request(app)
      .post(`/api/v1/orders/${orderId}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    const after = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(after.body.data.items[0].lineTotal, '200.00');
    assert.equal(after.body.data.totalValue, '200.00');
    assert.ok(
      after.body.data.stages.find((stage: { status: string }) => stage.status === 'CONFIRMED')
        .reachedAt,
    );

    const dispatched = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DISPATCHED' });
    assert.equal(dispatched.status, 200);
    assert.equal(dispatched.body.data.whatsapp.sent, false);
    const log = await prisma.auditLog.findFirst({
      where: { entityId: orderId, action: 'WHATSAPP_ORDER_STATUS_FAILED' },
    });
    assert.ok(log);
    const alert = await prisma.alert.findFirst({
      where: { relatedEntityId: orderId, type: 'ORDER_DISPATCHED' },
    });
    assert.equal(alert?.orgId, retailer.orgId);

    const retailerStatus = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({ status: 'DELIVERED' });
    assert.equal(retailerStatus.status, 403);
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
