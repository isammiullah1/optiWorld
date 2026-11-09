import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const retailerEmail = 'catalog-retailer@example.com';
const wholesalerEmail = 'catalog-wholesaler@example.com';

describe('retailer catalog and orders', () => {
  after(async () => {
    await removeOrg(retailerEmail);
    await removeOrg(wholesalerEmail);
    const decoy = await prisma.organisation.findFirst({ where: { name: 'Other Supply' } });
    if (decoy) {
      await prisma.catalogProduct.deleteMany({ where: { orgId: decoy.id } });
      await prisma.organisation.delete({ where: { id: decoy.id } });
    }
    await closeRedis();
    await prisma.$disconnect();
  });

  it('hides prices unless the approved connection shows them, then places an order', async () => {
    await removeOrg(retailerEmail);
    await removeOrg(wholesalerEmail);
    const retailer = await onboard('RETAILER', 'Catalog Optics', retailerEmail, 'Sara Catalog');
    const wholesaler = await onboard(
      'WHOLESALER',
      'Catalog Supply',
      wholesalerEmail,
      'Omar Catalog',
    );
    const retailerToken = await activate(retailer.orgId, retailerEmail);
    const wholesalerToken = await activate(wholesaler.orgId, wholesalerEmail);

    const priced = await prisma.catalogProduct.create({
      data: {
        orgId: wholesaler.orgId,
        name: 'CR39 SV',
        category: 'Lenses',
        listedPrice: '900.00',
        productCode: 'CR39-SV',
      },
    });
    const quoted = await prisma.catalogProduct.create({
      data: {
        orgId: wholesaler.orgId,
        name: 'Metal Frame',
        category: 'Frames',
        listedPrice: null,
        isPriceOnRequest: true,
        productCode: 'MTL-FR',
      },
    });
    const decoyOrg = await prisma.organisation.create({
      data: {
        name: 'Other Supply',
        type: 'WHOLESALER',
        planType: 'WHOLESALER_STANDARD',
        status: 'ACTIVE',
      },
    });
    const decoy = await prisma.catalogProduct.create({
      data: {
        orgId: decoyOrg.id,
        name: 'Secret Lens',
        category: 'Lenses',
        listedPrice: '50.00',
        productCode: 'SEC',
      },
    });

    const blocked = await request(app)
      .get(`/api/v1/catalog/${wholesaler.orgId}`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'CONNECTION_REQUIRED');

    const requested = await request(app)
      .post('/api/v1/retailer/wholesaler-connections')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({ wholesalerOrgId: wholesaler.orgId });
    assert.equal(requested.status, 201);
    assert.equal(requested.body.data.status, 'PENDING');

    const stillBlocked = await request(app)
      .get(`/api/v1/catalog/${wholesaler.orgId}`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(stillBlocked.status, 403);

    await prisma.retailerConnection.update({
      where: { id: requested.body.data.id as string },
      data: { status: 'APPROVED', visibilityMode: 'FULL', approvedAt: new Date() },
    });

    const catalog = await request(app)
      .get(`/api/v1/catalog/${wholesaler.orgId}`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(catalog.status, 200);
    assert.equal(catalog.body.data.pricesVisible, true);
    assert.equal(
      catalog.body.data.products.find((row: { id: string }) => row.id === priced.id).listedPrice,
      '900.00',
    );
    assert.equal(
      catalog.body.data.products.find((row: { id: string }) => row.id === quoted.id).listedPrice,
      null,
    );
    assert.equal(
      catalog.body.data.products.some((row: { name: string }) => row.name === 'Secret Lens'),
      false,
    );

    const found = await request(app)
      .get(`/api/v1/retailer/wholesalers/search?q=${wholesaler.orgId}`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(found.status, 200);
    assert.equal(JSON.stringify(found.body).includes('listedPrice'), false);
    assert.equal(found.body.data[0].connectionStatus, 'APPROVED');

    const foreign = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({
        wholesalerOrgId: wholesaler.orgId,
        items: [{ catalogProductId: decoy.id, quantity: 1 }],
      });
    assert.equal(foreign.status, 422);

    const created = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({
        wholesalerOrgId: wholesaler.orgId,
        notes: 'Morning delivery',
        items: [{ catalogProductId: priced.id, quantity: 2 }],
      });
    assert.equal(created.status, 201);
    const orderId = created.body.data.id as string;
    const stored = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, chatThread: true },
    });
    assert.equal(stored?.totalValue?.toFixed(2), '1800.00');
    assert.equal(stored?.items[0]?.agreedPrice?.toFixed(2), '900.00');
    assert.ok(stored?.chatThread);
    const alert = await prisma.alert.findFirst({
      where: { orgId: wholesaler.orgId, type: 'ORDER_PLACED', relatedEntityId: orderId },
    });
    assert.ok(alert);
    assert.equal(alert.body.includes('900'), false);

    const list = await request(app)
      .get('/api/v1/retailer/orders?status=PENDING')
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(list.status, 200);
    assert.equal(
      list.body.data.some((row: { id: string }) => row.id === orderId),
      true,
    );

    const detail = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.totalValue, '1800.00');
    assert.equal(detail.body.data.messages.length > 0, true);

    const clearpath = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@clearpath.example', password });
    const other = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${clearpath.body.data.accessToken}`);
    assert.equal(other.status, 403);

    const supplierView = await request(app)
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${wholesalerToken}`);
    assert.equal(supplierView.status, 200);
    assert.equal(supplierView.body.data.pricesVisible, true);

    await prisma.retailerConnection.update({
      where: { id: requested.body.data.id as string },
      data: { visibilityMode: 'PRICES_HIDDEN' },
    });
    const hidden = await request(app)
      .get(`/api/v1/catalog/${wholesaler.orgId}`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(hidden.status, 200);
    assert.equal(hidden.body.data.pricesVisible, false);
    assert.equal(JSON.stringify(hidden.body).includes('900.00'), false);
    assert.equal(
      hidden.body.data.products.every(
        (row: { listedPrice: string | null }) => row.listedPrice === null,
      ),
      true,
    );

    const quotedOrder = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({
        wholesalerOrgId: wholesaler.orgId,
        items: [{ catalogProductId: priced.id, quantity: 1 }],
      });
    assert.equal(quotedOrder.status, 201);
    const hiddenOrder = await prisma.order.findUnique({
      where: { id: quotedOrder.body.data.id as string },
      include: { items: true },
    });
    assert.equal(hiddenOrder?.totalValue, null);
    assert.equal(hiddenOrder?.items[0]?.agreedPrice, null);

    await prisma.retailerConnection.update({
      where: { id: requested.body.data.id as string },
      data: { visibilityMode: 'CATALOG_HIDDEN' },
    });
    const closed = await request(app)
      .get(`/api/v1/catalog/${wholesaler.orgId}`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(closed.status, 403);
    assert.equal(closed.body.error.code, 'CATALOG_HIDDEN');
    const refused = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({
        wholesalerOrgId: wholesaler.orgId,
        items: [{ catalogProductId: priced.id, quantity: 1 }],
      });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.error.code, 'CATALOG_HIDDEN');

    const supplierCatalog = await request(app)
      .get(`/api/v1/catalog/${wholesaler.orgId}`)
      .set('Authorization', `Bearer ${wholesalerToken}`);
    assert.equal(supplierCatalog.status, 403);

    await prisma.catalogProduct.deleteMany({ where: { orgId: decoyOrg.id } });
    await prisma.organisation.delete({ where: { id: decoyOrg.id } });
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
    phone: '+92 300 5550188',
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
