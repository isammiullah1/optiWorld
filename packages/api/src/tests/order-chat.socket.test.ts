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

const password = 'OptiWorld123!';
const pendingOrder = '80000000-0000-4000-8000-000000000001';
const confirmedOrder = '80000000-0000-4000-8000-000000000002';
const catalogSv = '60000000-0000-4000-8000-000000000001';
const catalogHi = '60000000-0000-4000-8000-000000000002';

const app = createApp();
const httpServer: HttpServer = createServer(app);
let port = 0;
const sockets: Socket[] = [];

let queue: Promise<void> = Promise.resolve();

function sequential(run: () => Promise<void>): Promise<void> {
  const next = queue.then(run, run);
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

describe('order chat sockets', () => {
  before(async () => {
    attachOrderChat(httpServer);
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Chat test server did not bind a port');
    }
    port = address.port;
    await resetPendingOrder();
  });

  after(async () => {
    await queue;
    for (const socket of sockets) {
      socket.disconnect();
    }
    await resetPendingOrder();
    await closeRedis();
    await prisma.$disconnect();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('rejects a stranger and restores history after a dropped connection', async () => {
    await sequential(async () => {
      await assert.rejects(() => openSocket(''), /UNAUTHORIZED/);

      const outsider = await openSocket(await login('owner@clearpath.example'));
      const denied = await emitAck(outsider, 'join_order_chat', { orderId: pendingOrder });
      assert.equal(denied.success, false);
      if (!denied.success) {
        assert.equal(denied.error.code, 'FORBIDDEN');
      }

      const retailer = await openSocket(await login('owner@brightview.example'));
      const wholesaler = await openSocket(await login('orders@lensline.example'));
      await emitAck(retailer, 'join_order_chat', { orderId: pendingOrder });
      const joined = await emitAck<{ messages: unknown[] }>(
        wholesaler,
        'join_order_chat',
        pendingOrder,
      );
      assert.equal(joined.success, true);

      const received = waitFor<{ content: string }>(retailer, 'message_received');
      const sent = await emitAck<{ content: string }>(wholesaler, 'send_message', {
        orderId: pendingOrder,
        content: 'Yes, all available',
        messageType: 'TEXT',
      });
      assert.equal(sent.success, true);
      assert.equal((await received).content, 'Yes, all available');

      wholesaler.disconnect();
      await waitForConnect(wholesaler);
      const again = await emitAck<{ messages: Array<{ content: string }> }>(
        wholesaler,
        'join_order_chat',
        {
          orderId: pendingOrder,
        },
      );
      assert.equal(again.success, true);
      if (again.success) {
        assert.equal(
          again.data.messages.some((message) => message.content === 'Yes, all available'),
          true,
        );
      }
    });
  });

  it('selects chips from the live thread, then locks the order against further changes', async () => {
    await sequential(async () => {
      await resetPendingOrder();
      const retailerToken = await login('owner@brightview.example');
      const wholesalerToken = await login('admin@lensline.example');
      const fresh = await request(app)
        .get(`/api/v1/orders/${pendingOrder}/chat/suggested-replies`)
        .set('Authorization', `Bearer ${wholesalerToken}`);
      assert.equal(fresh.status, 200);
      assert.equal(fresh.body.data.context, 'NEW_ORDER');
      const aiChip = fresh.body.data.chips.find((chip: { id: string }) => chip.id === 'ai-v2') as
        { disabled: boolean; tooltip: string } | undefined;
      assert.equal(aiChip?.disabled, true);
      assert.equal(aiChip?.tooltip, 'Planned for Version 2');

      const hidden = await request(app)
        .get(`/api/v1/orders/${pendingOrder}/chat/suggested-replies`)
        .set('Authorization', `Bearer ${retailerToken}`);
      assert.equal(hidden.status, 403);

      const retailer = await openSocket(retailerToken);
      const wholesaler = await openSocket(wholesalerToken);
      await emitAck(retailer, 'join_order_chat', { orderId: pendingOrder });
      await emitAck(wholesaler, 'join_order_chat', { orderId: pendingOrder });
      await emitAck(retailer, 'send_message', {
        orderId: pendingOrder,
        content: 'What is the price for 10 pieces?',
        messageType: 'TEXT',
      });

      const price = await request(app)
        .get(`/api/v1/orders/${pendingOrder}/chat/suggested-replies`)
        .set('Authorization', `Bearer ${wholesalerToken}`);
      assert.equal(price.body.data.context, 'PRICE_QUERY');

      await emitAck(wholesaler, 'send_message', {
        orderId: pendingOrder,
        content: 'All available',
        messageType: 'TEXT',
      });

      const proposed = waitFor<{ id: string }>(wholesaler, 'change_proposed');
      const proposal = await emitAck<{ id: string }>(retailer, 'propose_change', {
        orderId: pendingOrder,
        changes: [{ catalogProductId: catalogSv, quantity: 8, agreedPrice: '800.00' }],
      });
      assert.equal(proposal.success, true);
      assert.equal((await proposed).id, proposal.success ? proposal.data.id : '');

      const accepted = await emitAck<{ updatedOrder: { totalValue: string } }>(
        wholesaler,
        'respond_to_change',
        {
          changeRequestId: proposal.success ? proposal.data.id : '',
          action: 'ACCEPT',
        },
      );
      assert.equal(accepted.success, true);
      if (accepted.success) {
        assert.equal(accepted.data.updatedOrder.totalValue, '6400.00');
      }

      await emitAck(retailer, 'send_message', {
        orderId: pendingOrder,
        content: 'Please pack them',
        messageType: 'TEXT',
      });
      await emitAck(wholesaler, 'send_message', {
        orderId: pendingOrder,
        content: 'Packing now',
        messageType: 'TEXT',
      });

      const closing = await request(app)
        .get(`/api/v1/orders/${pendingOrder}/chat/suggested-replies`)
        .set('Authorization', `Bearer ${wholesalerToken}`);
      assert.equal(closing.body.data.context, 'CLOSING');

      const locked = waitFor<{ orderId: string }>(retailer, 'order_confirmed');
      const confirmed = await emitAck<{ lockedAt: string }>(wholesaler, 'confirm_order', {
        orderId: pendingOrder,
      });
      assert.equal(confirmed.success, true);
      assert.equal((await locked).orderId, pendingOrder);

      const second = await emitAck(wholesaler, 'confirm_order', { orderId: pendingOrder });
      assert.equal(second.success, false);
      if (!second.success) {
        assert.equal(second.error.code, 'ALREADY_CONFIRMED');
      }

      const systemAfterLock = await emitAck(wholesaler, 'send_message', {
        orderId: pendingOrder,
        content: 'Order confirmed · locked',
        messageType: 'SYSTEM',
      });
      assert.equal(systemAfterLock.success, false);
      if (!systemAfterLock.success) {
        assert.equal(systemAfterLock.error.code, 'ORDER_LOCKED');
      }

      const blocked = await emitAck(retailer, 'propose_change', {
        orderId: pendingOrder,
        changes: [{ catalogProductId: catalogSv, quantity: 1, agreedPrice: '800.00' }],
      });
      assert.equal(blocked.success, false);
      if (!blocked.success) {
        assert.equal(blocked.error.code, 'ORDER_LOCKED');
      }

      const statusEvent = waitFor<{ status: string }>(retailer, 'order_status_updated');
      const dispatched = await request(httpServer)
        .patch(`/api/v1/orders/${pendingOrder}/status`)
        .set('Authorization', `Bearer ${wholesalerToken}`)
        .send({ status: 'DISPATCHED' });
      assert.equal(dispatched.status, 200);
      assert.equal((await statusEvent).status, 'DISPATCHED');

      const seeded = await emitAck(retailer, 'propose_change', {
        orderId: confirmedOrder,
        changes: [{ catalogProductId: catalogHi, quantity: 1, agreedPrice: '1000.00' }],
      });
      assert.equal(seeded.success, false);
      if (!seeded.success) {
        assert.equal(seeded.error.code, 'ORDER_LOCKED');
      }
      const unchanged = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: confirmedOrder, catalogProductId: catalogHi },
      });
      assert.equal(unchanged.quantity, 5);
    });
  });
});

async function login(email: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  assert.equal(response.status, 200);
  return response.body.data.accessToken as string;
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

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket did not reconnect')), 5_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    if (socket.disconnected) {
      socket.connect();
    }
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

async function resetPendingOrder(): Promise<void> {
  await prisma.changeRequest.deleteMany({ where: { orderId: pendingOrder } });
  const thread = await prisma.chatThread.findUnique({ where: { orderId: pendingOrder } });
  if (thread) {
    await prisma.chatMessage.deleteMany({ where: { threadId: thread.id } });
    await prisma.chatThread.delete({ where: { id: thread.id } });
  }
  await prisma.orderItem.updateMany({
    where: { orderId: pendingOrder },
    data: { quantity: 10, agreedPrice: '850.00' },
  });
  await prisma.order.update({
    where: { id: pendingOrder },
    data: { status: 'PENDING', lockedAt: null, totalValue: '8500.00' },
  });
}
