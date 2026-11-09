import type { MessageType, OrderStatus } from '../enums/index.js';

export const CHIP_CONTEXTS = [
  'NEW_ORDER',
  'PRICE_QUERY',
  'CHANGE_REQUEST',
  'CLOSING',
  'GENERAL',
] as const;

export type ChipContext = (typeof CHIP_CONTEXTS)[number];

export type ReplyChip = {
  id: string;
  label: string;
  text: string;
  disabled?: boolean;
  tooltip?: string;
  isAi?: boolean;
};

/** Shown disabled in the wholesaler chat. It never inserts or sends text in v1. */
export const AI_REPLY_CHIP = {
  id: 'ai-v2',
  label: 'AI replies · v2',
  text: '',
  isAi: true,
  disabled: true,
  tooltip: 'Planned for Version 2',
} as const satisfies ReplyChip;

export type ChatSignal = {
  senderOrgId: string;
  messageType: MessageType;
  content: string;
};

const PRICE_QUESTION = /\b(price|cost|rate|amount)\b|\bhow much\b/i;

const CHIP_SETS = {
  NEW_ORDER: [
    chip('yes_all_available', 'Yes, all available'),
    chip('partially_available', 'Partially available — see below'),
    chip('out_of_stock', 'Out of stock on some items'),
    chip('call_me', 'Call me to discuss'),
  ],
  PRICE_QUERY: [
    chip('price_fixed', 'Price is fixed'),
    chip('price_final', 'Price is final — no changes'),
    chip('negotiable', "Negotiable, let's discuss"),
    chip('catalog_price', 'Refer to catalog price'),
  ],
  CHANGE_REQUEST: [
    chip('change_accepted', 'Change accepted'),
    chip('not_possible', 'Not possible, keeping original'),
    chip('partial', 'Can do partial — specify qty'),
    chip('check_and_confirm', 'Let me check and confirm'),
  ],
  CLOSING: [
    chip('confirmed_dispatch', 'Order confirmed — will dispatch shortly'),
    chip('dispatching_today', 'Dispatching today'),
    chip('price_final_confirming', 'Price is final, confirming now'),
    chip('final_confirm_order', "It's final — confirm order"),
  ],
  GENERAL: [
    chip('noted', 'Noted'),
    chip('will_update', 'Will update you shortly'),
    chip('please_call', 'Please call me'),
    chip('confirmed', 'Confirmed'),
    chip('on_it', 'On it'),
  ],
} as const satisfies Record<ChipContext, readonly ReplyChip[]>;

export function orderChatRoom(orderId: string): string {
  return `order_${orderId}`;
}

/**
 * Level 1 chip context. Keyword checks stay literal.
 * The caller loads the matching rows; this function does not know the source.
 */
export function resolveChipContext(input: {
  orderStatus: OrderStatus;
  retailerOrgId: string;
  messages: readonly ChatSignal[];
  messageCount?: number;
  hasPendingChangeRequest: boolean;
}): ChipContext {
  const conversational = input.messages.filter((message) => message.messageType !== 'SYSTEM');
  const messageCount = input.messageCount ?? conversational.length;
  if (messageCount === 0 || (input.orderStatus === 'PENDING' && messageCount === 0)) {
    return 'NEW_ORDER';
  }

  const lastRetailer = [...conversational]
    .reverse()
    .find((message) => message.senderOrgId === input.retailerOrgId);
  if (lastRetailer && PRICE_QUESTION.test(lastRetailer.content)) {
    return 'PRICE_QUERY';
  }

  const last = conversational[conversational.length - 1];
  if (last?.messageType === 'CHANGE_REQUEST') {
    return 'CHANGE_REQUEST';
  }

  if (messageCount > 4 && !input.hasPendingChangeRequest) {
    return 'CLOSING';
  }

  return 'GENERAL';
}

/** Static copy used by tests. The API serves the same labels from SuggestedReplyChip. */
export function resolveSuggestedReplies(input: {
  orderStatus: OrderStatus;
  retailerOrgId: string;
  messages: readonly ChatSignal[];
  messageCount?: number;
  hasPendingChangeRequest: boolean;
}): { context: ChipContext; chips: ReplyChip[] } {
  const context = resolveChipContext(input);
  return {
    context,
    chips: CHIP_SETS[context].map((entry) => ({ ...entry })),
  };
}

function chip(id: string, text: string): ReplyChip {
  return { id, label: text, text };
}
