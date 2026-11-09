import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveSuggestedReplies, type ChatSignal } from '@optiworld/shared';

const retailer = '10000000-0000-4000-8000-000000000001';
const wholesaler = '10000000-0000-4000-8000-000000000003';

describe('suggested reply chips', () => {
  it('returns the new-order set before anyone has written', () => {
    const resolved = resolve({ messages: [] });
    assert.equal(resolved.context, 'NEW_ORDER');
    assert.deepEqual(
      resolved.chips.map((chip) => chip.text),
      [
        'Yes, all available',
        'Partially available — see below',
        'Out of stock on some items',
        'Call me to discuss',
      ],
    );
  });

  it('returns price chips when the retailer last asked about price', () => {
    const resolved = resolve({
      messages: [text(retailer, 'How much is the rate for these lenses?')],
    });
    assert.equal(resolved.context, 'PRICE_QUERY');
    assert.equal(resolved.chips[1]?.text, 'Price is final — no changes');
    assert.equal(resolved.chips[2]?.text, "Negotiable, let's discuss");
  });

  it('returns change chips when the last message is a change request', () => {
    const resolved = resolve({
      messages: [
        text(wholesaler, 'The price is final'),
        { senderOrgId: retailer, messageType: 'CHANGE_REQUEST', content: 'Reduce the quantity' },
      ],
    });
    assert.equal(resolved.context, 'CHANGE_REQUEST');
    assert.equal(resolved.chips[2]?.text, 'Can do partial — specify qty');
  });

  it('returns closing chips after more than four messages and no open change', () => {
    const resolved = resolve({
      messages: [
        text(retailer, 'Please prepare 10 pieces'),
        text(wholesaler, 'All available'),
        text(retailer, 'Pack them today'),
        text(wholesaler, 'Packing now'),
        text(retailer, 'Thank you'),
      ],
    });
    assert.equal(resolved.context, 'CLOSING');
    assert.equal(resolved.chips[3]?.text, "It's final — confirm order");
    assert.equal(
      resolved.chips.some((chip) => chip.id === 'confirm_order'),
      false,
    );
  });

  it('returns general chips when the thread is short and does not treat a chip as confirmation', () => {
    const resolved = resolve({
      messages: [text(wholesaler, 'Noted on our side')],
    });
    assert.equal(resolved.context, 'GENERAL');
    assert.equal(
      resolved.chips.some((chip) => chip.id === 'confirm_order'),
      false,
    );
    assert.deepEqual(
      resolved.chips.map((chip) => chip.text),
      ['Noted', 'Will update you shortly', 'Please call me', 'Confirmed', 'On it'],
    );
  });
});

function resolve(input: {
  messages: readonly ChatSignal[];
  orderStatus?: 'PENDING' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED';
  hasPendingChangeRequest?: boolean;
  messageCount?: number;
}) {
  return resolveSuggestedReplies({
    orderStatus: input.orderStatus ?? 'PENDING',
    retailerOrgId: retailer,
    messages: input.messages,
    messageCount: input.messageCount,
    hasPendingChangeRequest: input.hasPendingChangeRequest ?? false,
  });
}

function text(senderOrgId: string, content: string): ChatSignal {
  return { senderOrgId, messageType: 'TEXT', content };
}
