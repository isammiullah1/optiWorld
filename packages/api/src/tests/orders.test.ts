import './setup-env.js';

import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import { after, before, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';
import { attachOrderChat } from '../realtime/server.js';
import {
  authHeader,
  createAccount,
  login,
  removeByPrefix,
  type TestAccount,
} from './critical-fixtures.js';

const app = createApp();
const httpServer: HttpServer = createServer(app);
const prefix = 'critical-orders';
const sockets: Socket[] = [];
let port = 0;

describe('order flow', () => {
  let retailer: TestAccount;
  let wholesaler: TestAccount;
  let retailerToken = '';
  let wholesalerToken = '';
  let productId = '';

  before(async () => {
    await removeByPrefix(prefix);
    retailer = await createAccount({ prefix, slug: 'retailer', type: 'RETAILER', role: 'OWNER' });
    wholesaler = await createAccount({
      prefix,
      slug: 'wholesaler',
      type: 'WHOLESALER',
      role: 'ADMIN',
    });
    const product = await prisma.catalogProduct.create({
      data: {
        orgId: wholesaler.orgId,
        name: 'Order flow lens',
        category: 'Lenses',
        listedPrice: '900.00',
        productCode: 'OF-900',
      },
    });
    productId = product.id;
    await prisma.retailerConnection.create({
      data: {
        retailerOrgId: retailer.orgId,
        wholesalerOrgId: wholesaler.orgId,
        status: 'APPROVED',
        visibilityMode: 'FULL',
        approvedAt: new Date(),
      },
    });
    retailerToken = (await login(app, retailer.email)).accessToken;
    wholesalerToken = (await login(app, wholesaler.email)).accessToken;
    attachOrderChat(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Order test server did not bind a port');
    }
    port = address.port;
  });

  after(async () => {
    for (const socket of sockets) {
      socket.close();
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    await removeByPrefix(prefix);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('creates a pending order, a chat thread, and a wholesaler alert', async () => {
    const orderId = await placeOrder(retailerToken, wholesaler.orgId, productId);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(order.status, 'PENDING');
    assert.equal(order.lockedAt, null);
    const thread = await prisma.chatThread.findUnique({ where: { orderId } });
    assert.ok(thread);
    const alert = await prisma.alert.findFirst({
      where: { orgId: wholesaler.orgId, relatedEntityId: orderId, type: 'ORDER_PLACED' },
    });
    assert.ok(alert);
  });

  it('locks on confirm, rejects a later change, and walks status one step at a time', async () => {
    const orderId = await placeOrder(retailerToken, wholesaler.orgId, productId);
    const skipped = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(authHeader(wholesalerToken))
      .send({ status: 'DISPATCHED' });
    assert.equal(skipped.status, 409);
    assert.equal(skipped.body.error.code, 'ORDER_LOCKED');

    const retailerStatus = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(authHeader(retailerToken))
      .send({ status: 'DISPATCHED' });
    assert.equal(retailerStatus.status, 403);

    const socket = await openSocket(retailerToken);
    await emitAck(socket, 'join_order_chat', { orderId });
    const confirmedEvent = waitFor<{ orderId: string; lockedAt: string }>(
      socket,
      'order_confirmed',
    );
    const confirmed = await request(app)
      .post(`/api/v1/orders/${orderId}/confirm`)
      .set(authHeader(wholesalerToken));
    assert.equal(confirmed.status, 200);
    const event = await confirmedEvent;
    assert.equal(event.orderId, orderId);
    assert.equal(typeof event.lockedAt, 'string');

    const locked = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(locked.status, 'CONFIRMED');
    assert.ok(locked.lockedAt);

    const proposal = await emitAck(socket, 'propose_change', {
      orderId,
      changes: [{ catalogProductId: productId, quantity: 1, agreedPrice: '800.00' }],
    });
    assert.equal(proposal.success, false);
    if (!proposal.success) {
      assert.equal(proposal.error.code, 'ORDER_LOCKED');
    }

    const second = await request(app)
      .post(`/api/v1/orders/${orderId}/confirm`)
      .set(authHeader(wholesalerToken));
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'ALREADY_CONFIRMED');

    const jumped = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(authHeader(wholesalerToken))
      .send({ status: 'DELIVERED' });
    assert.equal(jumped.status, 409);
    assert.equal(jumped.body.error.code, 'ORDER_LOCKED');

    const dispatched = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(authHeader(wholesalerToken))
      .send({ status: 'DISPATCHED' });
    assert.equal(dispatched.status, 200);
    assert.equal(dispatched.body.data.status, 'DISPATCHED');

    const delivered = await request(app)
      .patch(`/api/v1/orders/${orderId}/status`)
      .set(authHeader(wholesalerToken))
      .send({ status: 'DELIVERED' });
    assert.equal(delivered.status, 200);
    assert.equal(delivered.body.data.status, 'DELIVERED');
  });
});

async function placeOrder(
  token: string,
  wholesalerOrgId: string,
  catalogProductId: string,
): Promise<string> {
  const response = await request(app)
    .post('/api/v1/orders')
    .set(authHeader(token))
    .send({ wholesalerOrgId, items: [{ catalogProductId, quantity: 2 }] });
  assert.equal(response.status, 201);
  return response.body.data.id as string;
}

function openSocket(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 5_000,
    });
    sockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (error: Error) => reject(error));
  });
}

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 5_000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

type Ack<T> =
  { success: true; data: T } | { success: false; error: { code: string; message: string } };

function emitAck<T>(socket: Socket, event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve, reject) => {
    socket.timeout(5_000).emit(event, payload, (error: Error | null, body: Ack<T>) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(body);
    });
  });
}
