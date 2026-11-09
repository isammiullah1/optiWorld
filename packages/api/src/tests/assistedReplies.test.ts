import './setup-env.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';
import {
  authHeader,
  createAccount,
  login,
  removeByPrefix,
  type TestAccount,
} from './critical-fixtures.js';

const app = createApp();
const prefix = 'critical-chips';

const CHIP_TEXT = {
  NEW_ORDER: [
    'Yes, all available',
    'Partially available — see below',
    'Out of stock on some items',
    'Call me to discuss',
  ],
  PRICE_QUERY: [
    'Price is fixed',
    'Price is final — no changes',
    "Negotiable, let's discuss",
    'Refer to catalog price',
  ],
  CHANGE_REQUEST: [
    'Change accepted',
    'Not possible, keeping original',
    'Can do partial — specify qty',
    'Let me check and confirm',
  ],
  CLOSING: [
    'Order confirmed — will dispatch shortly',
    'Dispatching today',
    'Price is final, confirming now',
    "It's final — confirm order",
  ],
} as const;

describe('assisted reply chips', () => {
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
        name: 'Chip lens',
        category: 'Lenses',
        listedPrice: '900.00',
        productCode: 'CH-900',
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
  });

  after(async () => {
    await removeByPrefix(prefix);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('returns new-order chips to the wholesaler and hides them from the retailer', async () => {
    const orderId = await placeOrder(retailerToken, wholesaler.orgId, productId);
    const hidden = await request(app)
      .get(`/api/v1/orders/${orderId}/chat/suggested-replies`)
      .set(authHeader(retailerToken));
    assert.equal(hidden.status, 403);

    const response = await replies(orderId, wholesalerToken);
    assert.equal(response.status, 200);
    assert.equal(response.body.data.context, 'NEW_ORDER');
    assertChips(response.body.data.chips, CHIP_TEXT.NEW_ORDER);
  });

  it('uses price chips when the latest retailer message asks about price', async () => {
    const orderId = await placeOrder(retailerToken, wholesaler.orgId, productId);
    await addMessage(orderId, retailer, 'What is the price for this lens?', 'TEXT', 0);
    const response = await replies(orderId, wholesalerToken);
    assert.equal(response.body.data.context, 'PRICE_QUERY');
    assertChips(response.body.data.chips, CHIP_TEXT.PRICE_QUERY);
  });

  it('uses change-request chips when the latest message is a change request', async () => {
    const orderId = await placeOrder(retailerToken, wholesaler.orgId, productId);
    await addMessage(orderId, retailer, 'Please send two instead', 'CHANGE_REQUEST', 0);
    const response = await replies(orderId, wholesalerToken);
    assert.equal(response.body.data.context, 'CHANGE_REQUEST');
    assertChips(response.body.data.chips, CHIP_TEXT.CHANGE_REQUEST);
  });

  it('uses closing chips after more than four messages with no pending change', async () => {
    const orderId = await placeOrder(retailerToken, wholesaler.orgId, productId);
    const lines = [
      'Please pack them',
      'Packing now',
      'Add a spare cloth',
      'Cloth added',
      'Ready when you are',
    ];
    for (const [index, content] of lines.entries()) {
      const sender = index % 2 === 0 ? retailer : wholesaler;
      await addMessage(orderId, sender, content, 'TEXT', index);
    }
    const response = await replies(orderId, wholesalerToken);
    assert.equal(response.body.data.context, 'CLOSING');
    assertChips(response.body.data.chips, CHIP_TEXT.CLOSING);
  });
});

function assertChips(
  chips: Array<{ text: string; disabled?: boolean; id: string }>,
  texts: readonly string[],
): void {
  assert.deepEqual(
    chips.slice(0, -1).map((chip) => chip.text),
    [...texts],
  );
  const ai = chips[chips.length - 1];
  assert.ok(ai);
  assert.equal(ai.id, 'ai-v2');
  assert.equal(ai.disabled, true);
  assert.equal(ai.text, '');
}

async function placeOrder(
  token: string,
  wholesalerOrgId: string,
  catalogProductId: string,
): Promise<string> {
  const response = await request(app)
    .post('/api/v1/orders')
    .set(authHeader(token))
    .send({ wholesalerOrgId, items: [{ catalogProductId, quantity: 1 }] });
  assert.equal(response.status, 201);
  return response.body.data.id as string;
}

function replies(orderId: string, token: string): Promise<request.Response> {
  return request(app)
    .get(`/api/v1/orders/${orderId}/chat/suggested-replies`)
    .set(authHeader(token));
}

async function addMessage(
  orderId: string,
  sender: TestAccount,
  content: string,
  messageType: 'TEXT' | 'CHANGE_REQUEST',
  offsetSeconds: number,
): Promise<void> {
  const thread = await prisma.chatThread.findUniqueOrThrow({ where: { orderId } });
  await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      senderOrgId: sender.orgId,
      senderUserId: sender.userId,
      content,
      messageType,
      createdAt: new Date(Date.now() + offsetSeconds * 1_000),
    },
  });
}
