import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const wholesalerEmail = 'connect-wholesaler@example.com';
const otherEmail = 'connect-other@example.com';
const retailerEmail = 'connect-retailer@example.com';

describe('wholesaler retailer connections', () => {
  after(async () => {
    await removeOrg(wholesalerEmail);
    await removeOrg(otherEmail);
    await removeOrg(retailerEmail);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('approves visibility per retailer and hides another wholesaler’s connections', async () => {
    await removeOrg(wholesalerEmail);
    await removeOrg(otherEmail);
    await removeOrg(retailerEmail);
    const wholesaler = await onboard('WHOLESALER', 'Connect Lens', wholesalerEmail, 'Omar Connect');
    const other = await onboard('WHOLESALER', 'Other Connect', otherEmail, 'Nadia Connect');
    const retailer = await onboard('RETAILER', 'Connect Shop', retailerEmail, 'Sara Connect');
    const token = await activate(wholesaler.orgId, wholesalerEmail);
    const otherToken = await activate(other.orgId, otherEmail);
    const retailerToken = await activate(retailer.orgId, retailerEmail);

    const requested = await request(app)
      .post('/api/v1/retailer/wholesaler-connections')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({ wholesalerOrgId: wholesaler.orgId });
    assert.equal(requested.status, 201);
    const connectionId = requested.body.data.id as string;

    const pending = await request(app)
      .get('/api/v1/wholesaler/connections')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(pending.status, 200);
    assert.equal(pending.body.data.pending.length, 1);
    assert.equal(pending.body.data.pending[0].retailerName, 'Connect Shop');
    assert.equal(JSON.stringify(pending.body).includes('revenue'), false);
    assert.equal(JSON.stringify(pending.body).includes('totalValue'), false);

    const blocked = await request(app)
      .get('/api/v1/wholesaler/connections')
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(blocked.status, 403);
    const foreign = await request(app)
      .patch(`/api/v1/wholesaler/connections/${connectionId}/approve`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ visibilityMode: 'FULL' });
    assert.equal(foreign.status, 404);

    const approved = await request(app)
      .patch(`/api/v1/wholesaler/connections/${connectionId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visibilityMode: 'PRICES_HIDDEN' });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.data.visibilityMode, 'PRICES_HIDDEN');
    assert.equal(approved.body.data.status, 'APPROVED');

    const priced = await request(app)
      .post('/api/v1/wholesaler/catalog')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Priced Lens',
        category: 'Lenses',
        listedPrice: '500.00',
        isPriceOnRequest: false,
        availabilityStatus: 'AVAILABLE',
      });
    const quoted = await request(app)
      .post('/api/v1/wholesaler/catalog')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Quoted Frame',
        category: 'Frames',
        isPriceOnRequest: true,
        availabilityStatus: 'AVAILABLE',
      });
    assert.equal(priced.status, 201);
    assert.equal(quoted.status, 201);

    const hiddenCatalog = await request(app)
      .get(`/api/v1/catalog/${wholesaler.orgId}`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(hiddenCatalog.status, 200);
    assert.equal(hiddenCatalog.body.data.pricesVisible, false);
    assert.equal(
      hiddenCatalog.body.data.products.every(
        (product: { listedPrice: string | null }) => product.listedPrice === null,
      ),
      true,
    );

    const order = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({
        wholesalerOrgId: wholesaler.orgId,
        items: [{ catalogProductId: quoted.body.data.id, quantity: 2 }],
      });
    assert.equal(order.status, 201);

    const quotes = await request(app)
      .get('/api/v1/wholesaler/quote-requests')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(quotes.status, 200);
    assert.equal(quotes.body.data.length, 1);
    assert.equal(quotes.body.data[0].productName, 'Quoted Frame');
    assert.equal(quotes.body.data[0].quantity, 2);
    assert.equal(JSON.stringify(quotes.body).includes('totalValue'), false);

    const closed = await request(app)
      .patch(`/api/v1/wholesaler/connections/${connectionId}/visibility`)
      .set('Authorization', `Bearer ${token}`)
      .send({ visibilityMode: 'CATALOG_HIDDEN' });
    assert.equal(closed.status, 200);
    const denied = await request(app)
      .get(`/api/v1/catalog/${wholesaler.orgId}`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'CATALOG_HIDDEN');

    const revoked = await request(app)
      .patch(`/api/v1/wholesaler/connections/${connectionId}/decline`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.data.status, 'REJECTED');
    const archive = await request(app)
      .get('/api/v1/wholesaler/connections')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(archive.body.data.declined.length, 1);
    assert.equal(archive.body.data.connected.length, 0);

    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await prisma.$executeRawUnsafe(
      'UPDATE retailer_connections SET updated_at = $1 WHERE id = $2::uuid',
      old,
      connectionId,
    );
    const expired = await request(app)
      .get('/api/v1/wholesaler/connections')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(expired.body.data.declined.length, 0);

    const outsider = await request(app)
      .get('/api/v1/wholesaler/connections')
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(outsider.body.data.connected.length, 0);
    assert.equal(outsider.body.data.pending.length, 0);

    await prisma.organisation.update({
      where: { id: retailer.orgId },
      data: { username: 'connectshop' },
    });
    const found = await request(app)
      .get('/api/v1/wholesaler/retailers/search?q=connectshop')
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(found.status, 200);
    assert.equal(found.body.data[0].name, 'Connect Shop');
    const invited = await request(app)
      .post('/api/v1/wholesaler/retailers/connect')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ retailerOrgId: retailer.orgId });
    assert.equal(invited.status, 201);
    const waiting = await request(app)
      .get('/api/v1/wholesaler/connections')
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(waiting.body.data.outgoing.length, 1);
    assert.equal(waiting.body.data.pending.length, 0);
    const cancelled = await request(app)
      .patch(`/api/v1/wholesaler/connections/${waiting.body.data.outgoing[0].id as string}/cancel`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.status, 'REJECTED');
    const afterCancel = await request(app)
      .get('/api/v1/wholesaler/connections')
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(afterCancel.body.data.outgoing.length, 0);
    const invitedAgain = await request(app)
      .post('/api/v1/wholesaler/retailers/connect')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ retailerOrgId: retailer.orgId });
    assert.equal(invitedAgain.status, 201);
    const shopRows = await request(app)
      .get('/api/v1/retailer/wholesaler-connections')
      .set('Authorization', `Bearer ${retailerToken}`);
    const incoming = shopRows.body.data.find(
      (row: { wholesalerName: string }) => row.wholesalerName === 'Other Connect',
    );
    assert.equal(incoming.incoming, true);
    const acceptedByShop = await request(app)
      .patch(`/api/v1/retailer/wholesaler-connections/${incoming.id as string}/approve`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(acceptedByShop.status, 200);
    assert.equal(acceptedByShop.body.data.status, 'APPROVED');
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
    phone: '+92 300 5550195',
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
