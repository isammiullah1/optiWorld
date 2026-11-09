import { prisma } from '@optiworld/db';
import {
  AI_REPLY_CHIP,
  centsToMoney,
  moneyToCents,
  ProposedOrderChangeSchema,
  resolveChipContext,
  type AuthSessionUser,
  type ChangeResponseAction,
  type ChipContext,
  type MessageType,
  type ProposedOrderChange,
  type ReplyChip,
} from '@optiworld/shared';
import { z } from 'zod';

import { AppError } from '../lib/errors.js';
import { notifyWholesalerCancellationCall } from './order-notify.service.js';
import { speakShopAction } from './record-activity.js';
import type { OrderBroadcast } from '../realtime/hub.js';
import {
  assertOrderRevisable,
  assertRetailerParty,
  assertWholesalerParty,
  requireOrderParty,
  type PartyOrder,
} from './order-access.js';

const HISTORY_LIMIT = 50;

const StoredChangesSchema = z.union([
  z.array(ProposedOrderChangeSchema),
  z.object({ items: z.array(ProposedOrderChangeSchema) }),
]);

export type ChatChangeLine = {
  productName: string;
  fromQuantity: number;
  toQuantity: number;
};

export type ChatChangeView = {
  id: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  lines: ChatChangeLine[];
  kind?: 'CANCEL_ORDER';
};

export type ChatMessageDto = {
  id: string;
  orderId: string;
  threadId: string;
  senderOrgId: string;
  senderUserId: string;
  senderName: string;
  content: string;
  messageType: MessageType;
  createdAt: string;
  changeRequest?: ChatChangeView;
};

export type OrderItemDto = {
  id: string;
  catalogProductId: string;
  productName: string;
  quantity: number;
  agreedPrice: string;
};

export type OrderSnapshot = {
  id: string;
  status: PartyOrder['status'];
  lockedAt: string | null;
  totalValue: string;
  retailerOrgId: string;
  wholesalerOrgId: string;
  items: OrderItemDto[];
};

export type ChangeRequestDto = {
  id: string;
  orderId: string;
  chatMessageId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  proposedChanges: ProposedOrderChange[];
  message: ChatMessageDto;
};

export type ChatMutation<T> = {
  result: T;
  broadcasts: OrderBroadcast[];
};

type StoredMessage = {
  id: string;
  threadId: string;
  senderOrgId: string;
  senderUserId: string;
  content: string;
  messageType: MessageType;
  createdAt: Date;
  senderUser: { name: string };
};

export async function getOrderChat(
  auth: AuthSessionUser,
  orderId: string,
): Promise<{ order: OrderSnapshot; messages: ChatMessageDto[] }> {
  const order = await requireOrderParty(auth, orderId);
  const [messages, retailer] = await Promise.all([
    listMessages(orderId),
    prisma.organisation.findFirst({ where: { id: order.retailerOrgId }, select: { name: true } }),
  ]);
  const spoken = messages.map((message) => ({
    ...message,
    content: speakShopAction(message.content, {
      isViewer: message.senderUserId === auth.userId,
      name: message.senderName,
      shopName: retailer?.name ?? 'the shop',
    }),
  }));
  const snapshot = toOrderSnapshot(order);
  if (order.lockedAt === null && order.status === 'PENDING') {
    const amendments = await loadAmendments(order.id, order.items, true);
    snapshot.items = snapshot.items.map((item) => {
      const line = amendments.openLines.find(
        (entry) => entry.catalogProductId === item.catalogProductId,
      );
      return line ? { ...item, quantity: line.toQuantity } : item;
    });
  }
  return { order: snapshot, messages: spoken };
}

export async function getSuggestedReplies(
  auth: AuthSessionUser,
  orderId: string,
): Promise<{ context: ChipContext; chips: ReplyChip[] }> {
  const order = await requireOrderParty(auth, orderId);
  assertWholesalerParty(auth, order);
  const [messages, messageCount, pendingChanges] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { thread: { orderId }, messageType: { not: 'SYSTEM' } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      select: { senderOrgId: true, messageType: true, content: true },
    }),
    prisma.chatMessage.count({
      where: { thread: { orderId }, messageType: { not: 'SYSTEM' } },
    }),
    prisma.changeRequest.count({ where: { orderId, status: 'PENDING' } }),
  ]);
  const context = resolveChipContext({
    orderStatus: order.status,
    retailerOrgId: order.retailerOrgId,
    messages: [...messages].reverse(),
    messageCount,
    hasPendingChangeRequest: pendingChanges > 0,
  });
  const stored = await prisma.suggestedReplyChip.findMany({
    where: { context, isActive: true },
    orderBy: { displayOrder: 'asc' },
    select: { id: true, label: true, text: true },
  });
  return {
    context,
    chips: [...stored, AI_REPLY_CHIP],
  };
}

export async function sendOrderMessage(
  auth: AuthSessionUser,
  orderId: string,
  content: string,
  messageType: 'TEXT' | 'SYSTEM' = 'TEXT',
): Promise<ChatMutation<ChatMessageDto>> {
  const order = await requireOrderParty(auth, orderId);
  if (messageType === 'SYSTEM' && (order.lockedAt !== null || order.status !== 'PENDING')) {
    throw new AppError(409, 'ORDER_LOCKED', 'This order is locked');
  }
  const message = await prisma.$transaction(async (tx) => {
    const thread = await tx.chatThread.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id },
      update: {},
    });
    return tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderOrgId: requiredOrgId(auth),
        senderUserId: auth.userId,
        content,
        messageType,
      },
      include: { senderUser: { select: { name: true } } },
    });
  });
  const dto = toMessage(message, orderId);
  return { result: dto, broadcasts: [{ event: 'message_received', payload: dto }] };
}

export async function proposeOrderChange(
  auth: AuthSessionUser,
  orderId: string,
  changes: readonly ProposedOrderChange[],
): Promise<ChatMutation<ChangeRequestDto>> {
  const order = await requireOrderParty(auth, orderId);
  assertRetailerParty(auth, order);
  assertOrderRevisable(order);
  const added = await resolveAddedProducts(order, changes);

  const created = await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!fresh) {
      throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }
    assertOrderRevisable(fresh);
    const thread = await tx.chatThread.upsert({
      where: { orderId },
      create: { orderId },
      update: {},
    });
    const pending = await tx.changeRequest.findMany({
      where: { orderId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      select: { proposedChanges: true },
    });
    const baseline = new Map(
      fresh.items.flatMap((item) =>
        item.catalogProductId ? [[item.catalogProductId, item.quantity] as const] : [],
      ),
    );
    for (const request of pending) {
      for (const change of readStoredChangesOrEmpty(request.proposedChanges)) {
        baseline.set(change.catalogProductId, change.quantity);
      }
    }
    const enriched = changes.map((change) => {
      const item = fresh.items.find((entry) => entry.catalogProductId === change.catalogProductId);
      const catalog = added.get(change.catalogProductId);
      if (!item && !catalog) {
        throw new AppError(422, 'VALIDATION_ERROR', 'A product is not in this catalog');
      }
      return {
        catalogProductId: change.catalogProductId,
        quantity: change.quantity,
        agreedPrice: item ? change.agreedPrice : (catalog?.agreedPrice ?? null),
        productName: item?.productName ?? catalog?.name ?? 'Item',
        fromQuantity: item ? (baseline.get(change.catalogProductId) ?? item.quantity) : 0,
      };
    });
    const message = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderOrgId: requiredOrgId(auth),
        senderUserId: auth.userId,
        content: amendmentText(enriched),
        messageType: 'CHANGE_REQUEST',
      },
      include: { senderUser: { select: { name: true } } },
    });
    const request = await tx.changeRequest.create({
      data: {
        chatMessageId: message.id,
        orderId,
        proposedChanges: { items: enriched },
        status: 'PENDING',
      },
    });
    return { request, message, enriched };
  });

  const dto: ChangeRequestDto = {
    id: created.request.id,
    orderId,
    chatMessageId: created.message.id,
    status: 'PENDING',
    proposedChanges: created.enriched,
    message: toMessage(created.message, orderId),
  };
  return {
    result: dto,
    broadcasts: [
      { event: 'message_received', payload: dto.message },
      { event: 'change_proposed', payload: dto },
    ],
  };
}

export async function respondToOrderChange(
  auth: AuthSessionUser,
  changeRequestId: string,
  action: ChangeResponseAction,
): Promise<
  ChatMutation<{
    changeRequestId: string;
    action: ChangeResponseAction;
    updatedOrder: OrderSnapshot;
    updatedOrderItems: OrderItemDto[];
  }>
> {
  const request = await prisma.changeRequest.findUnique({
    where: { id: changeRequestId },
    include: { order: { include: { items: true } } },
  });
  if (!request) {
    throw new AppError(404, 'NOT_FOUND', 'Change request not found');
  }
  const order = await requireOrderParty(auth, request.orderId);
  assertWholesalerParty(auth, order);
  assertOrderRevisable(order);
  if (request.status !== 'PENDING') {
    throw new AppError(409, 'ORDER_LOCKED', 'This change request is already resolved');
  }

  const payload = readChangePayload(request.proposedChanges);
  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUnique({
      where: { id: request.orderId },
      include: { items: true },
    });
    if (!fresh) {
      throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }
    assertOrderRevisable(fresh);
    const current = await tx.changeRequest.findUnique({ where: { id: changeRequestId } });
    if (!current || current.status !== 'PENDING') {
      throw new AppError(409, 'ORDER_LOCKED', 'This change request is already resolved');
    }

    let snapshot = toOrderSnapshot(fresh);
    if (action === 'ACCEPT' && payload.kind === 'CANCEL_ORDER') {
      await tx.order.update({ where: { id: fresh.id }, data: { status: 'CANCELLED' } });
      snapshot = { ...snapshot, status: 'CANCELLED' };
    } else if (action === 'ACCEPT' && payload.kind === 'ITEMS') {
      snapshot = await applyChanges(tx, fresh, payload.changes);
    }
    await tx.changeRequest.update({
      where: { id: changeRequestId },
      data: {
        status: action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
        respondedAt: new Date(),
      },
    });
    const thread = await tx.chatThread.upsert({
      where: { orderId: fresh.id },
      create: { orderId: fresh.id },
      update: {},
    });
    const message = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderOrgId: requiredOrgId(auth),
        senderUserId: auth.userId,
        content: responseText(payload, action),
        messageType: 'SYSTEM',
      },
      include: { senderUser: { select: { name: true } } },
    });
    return { snapshot, message: toMessage(message, fresh.id) };
  });

  const result = {
    changeRequestId,
    action,
    updatedOrder: updated.snapshot,
    updatedOrderItems: updated.snapshot.items,
  };
  return {
    result,
    broadcasts: [
      { event: 'message_received', payload: updated.message },
      { event: 'change_responded', payload: result },
    ],
  };
}

export async function requestConfirmedCancellation(
  auth: AuthSessionUser,
  orderId: string,
): Promise<{ id: string; message: string }> {
  const order = await requireOrderParty(auth, orderId);
  assertRetailerParty(auth, order);
  if (order.status !== 'CONFIRMED') {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'Only a confirmed order needs the wholesaler to accept a cancellation',
    );
  }
  const pending = await prisma.changeRequest.count({ where: { orderId, status: 'PENDING' } });
  if (pending > 0) {
    throw new AppError(
      409,
      'VALIDATION_ERROR',
      'Resolve the open request before asking to cancel this order',
    );
  }
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!fresh || fresh.status !== 'CONFIRMED') {
      throw new AppError(
        409,
        'ORDER_LOCKED',
        'Only a confirmed order needs the wholesaler to accept a cancellation',
      );
    }
    const stillPending = await tx.changeRequest.count({ where: { orderId, status: 'PENDING' } });
    if (stillPending > 0) {
      throw new AppError(
        409,
        'VALIDATION_ERROR',
        'Resolve the open request before asking to cancel this order',
      );
    }
    const thread = await tx.chatThread.upsert({
      where: { orderId },
      create: { orderId },
      update: {},
    });
    const message = await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderOrgId: requiredOrgId(auth),
        senderUserId: auth.userId,
        content: 'Cancellation requested. The order stays confirmed until the wholesaler accepts.',
        messageType: 'CHANGE_REQUEST',
      },
    });
    await tx.changeRequest.create({
      data: {
        chatMessageId: message.id,
        orderId,
        proposedChanges: { kind: 'CANCEL_ORDER' },
        status: 'PENDING',
      },
    });
    await tx.alert.create({
      data: {
        orgId: order.wholesalerOrgId,
        type: 'ORDER_PLACED',
        title: 'Cancellation requested',
        body: 'A retailer asked to cancel a confirmed order. Call them before you accept.',
        relatedEntityId: orderId,
        relatedEntityType: 'Order',
      },
    });
  });
  const notice = await notifyWholesalerCancellationCall(auth, orderId);
  return { id: orderId, message: notice.message };
}

export async function confirmOrder(
  auth: AuthSessionUser,
  orderId: string,
): Promise<ChatMutation<{ orderId: string; lockedAt: string }>> {
  const order = await requireOrderParty(auth, orderId);
  assertWholesalerParty(auth, order);
  if (order.lockedAt || order.status !== 'PENDING') {
    throw new AppError(409, 'ALREADY_CONFIRMED', 'This order is already confirmed');
  }

  const lockedAt = new Date();
  const message = await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUnique({ where: { id: orderId } });
    if (!fresh) {
      throw new AppError(404, 'NOT_FOUND', 'Order not found');
    }
    if (fresh.lockedAt || fresh.status !== 'PENDING') {
      throw new AppError(409, 'ALREADY_CONFIRMED', 'This order is already confirmed');
    }
    const openChanges = await tx.changeRequest.count({ where: { orderId, status: 'PENDING' } });
    if (openChanges > 0) {
      throw new AppError(
        409,
        'VALIDATION_ERROR',
        'Resolve the open change request before confirming',
      );
    }
    await tx.order.update({
      where: { id: orderId },
      data: { status: 'CONFIRMED', lockedAt },
    });
    const thread = await tx.chatThread.upsert({
      where: { orderId },
      create: { orderId },
      update: {},
    });
    return tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderOrgId: requiredOrgId(auth),
        senderUserId: auth.userId,
        content: 'Order confirmed · locked',
        messageType: 'SYSTEM',
      },
      include: { senderUser: { select: { name: true } } },
    });
  });

  const result = { orderId, lockedAt: lockedAt.toISOString() };
  return {
    result,
    broadcasts: [
      { event: 'message_received', payload: toMessage(message, orderId) },
      { event: 'order_confirmed', payload: result },
    ],
  };
}

export async function updateOrderStatus(
  auth: AuthSessionUser,
  orderId: string,
  status: 'DISPATCHED' | 'DELIVERED',
): Promise<ChatMutation<{ orderId: string; status: 'DISPATCHED' | 'DELIVERED' }>> {
  const order = await requireOrderParty(auth, orderId);
  assertWholesalerParty(auth, order);
  if (!order.lockedAt) {
    throw new AppError(409, 'ORDER_LOCKED', 'Confirm the order before updating its status');
  }
  const allowed =
    (order.status === 'CONFIRMED' && status === 'DISPATCHED') ||
    (order.status === 'DISPATCHED' && status === 'DELIVERED');
  if (!allowed) {
    throw new AppError(409, 'ORDER_LOCKED', 'This status change is not available');
  }

  const message = await prisma.$transaction(async (tx) => {
    await tx.order.update({ where: { id: orderId }, data: { status } });
    await tx.alert.create({
      data: {
        orgId: order.retailerOrgId,
        type: status === 'DISPATCHED' ? 'ORDER_DISPATCHED' : 'ORDER_DELIVERED',
        title: status === 'DISPATCHED' ? 'Order dispatched' : 'Order delivered',
        body: `Order #${order.id.replace(/-/g, '').slice(0, 8).toUpperCase()} is ${status === 'DISPATCHED' ? 'on the way' : 'delivered'}.`,
        relatedEntityId: orderId,
        relatedEntityType: 'Order',
      },
    });
    const thread = await tx.chatThread.upsert({
      where: { orderId },
      create: { orderId },
      update: {},
    });
    return tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderOrgId: requiredOrgId(auth),
        senderUserId: auth.userId,
        content: status === 'DISPATCHED' ? 'Order dispatched.' : 'Order delivered.',
        messageType: 'SYSTEM',
      },
      include: { senderUser: { select: { name: true } } },
    });
  });

  const result = { orderId, status };
  return {
    result,
    broadcasts: [
      { event: 'message_received', payload: toMessage(message, orderId) },
      { event: 'order_status_updated', payload: result },
    ],
  };
}

async function listMessages(orderId: string): Promise<ChatMessageDto[]> {
  const [rows, items] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { thread: { orderId } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      include: {
        senderUser: { select: { name: true } },
        changeRequest: { select: { id: true, status: true, proposedChanges: true } },
      },
    }),
    prisma.orderItem.findMany({
      where: { orderId },
      select: { catalogProductId: true, productName: true, quantity: true },
    }),
  ]);
  return rows.reverse().map((message) => {
    const dto = toMessage(message, orderId);
    const change = message.changeRequest ? toChangeView(message.changeRequest, items) : null;
    return change ? { ...dto, changeRequest: change } : dto;
  });
}

async function applyChanges(
  tx: Pick<typeof prisma, 'orderItem' | 'order'>,
  order: PartyOrder,
  changes: readonly ProposedOrderChange[],
): Promise<OrderSnapshot> {
  const items: OrderItemDto[] = [];
  const seen = new Set<string>();
  let totalCents = 0;
  let priced = true;
  for (const item of order.items) {
    const change = changes.find((entry) => entry.catalogProductId === item.catalogProductId);
    const quantity = change ? change.quantity : item.quantity;
    const agreed = linePrice(change?.agreedPrice, item.agreedPrice);
    if (change) {
      await tx.orderItem.update({
        where: { id: item.id },
        data: { quantity, agreedPrice: agreed },
      });
    }
    if (item.catalogProductId) {
      seen.add(item.catalogProductId);
    }
    if (!agreed) {
      priced = false;
    } else {
      totalCents += moneyToCents(agreed) * quantity;
    }
    items.push({
      id: item.id,
      catalogProductId: item.catalogProductId ?? '',
      productName: item.productName,
      quantity,
      agreedPrice: agreed ?? '0.00',
    });
  }
  for (const change of changes) {
    if (seen.has(change.catalogProductId)) {
      continue;
    }
    const agreed = change.agreedPrice ? centsToMoney(moneyToCents(change.agreedPrice)) : null;
    const created = await tx.orderItem.create({
      data: {
        orderId: order.id,
        catalogProductId: change.catalogProductId,
        productName: change.productName ?? 'Item',
        quantity: change.quantity,
        agreedPrice: agreed,
      },
    });
    if (!agreed) {
      priced = false;
    } else {
      totalCents += moneyToCents(agreed) * change.quantity;
    }
    items.push({
      id: created.id,
      catalogProductId: change.catalogProductId,
      productName: created.productName,
      quantity: change.quantity,
      agreedPrice: agreed ?? '0.00',
    });
  }
  const totalValue = priced ? centsToMoney(totalCents) : null;
  await tx.order.update({ where: { id: order.id }, data: { totalValue } });
  return { ...toOrderSnapshot(order), totalValue: totalValue ?? moneyText(null), items };
}

async function resolveAddedProducts(
  order: PartyOrder,
  changes: readonly ProposedOrderChange[],
): Promise<Map<string, { name: string; agreedPrice: string | null }>> {
  const seen = new Set<string>();
  const added: string[] = [];
  for (const change of changes) {
    if (seen.has(change.catalogProductId)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Each product can only be changed once');
    }
    seen.add(change.catalogProductId);
    const item = order.items.find((entry) => entry.catalogProductId === change.catalogProductId);
    if (!item) {
      added.push(change.catalogProductId);
    }
  }
  if (added.length === 0) {
    return new Map();
  }
  const connection = await prisma.retailerConnection.findFirst({
    where: {
      retailerOrgId: order.retailerOrgId,
      wholesalerOrgId: order.wholesalerOrgId,
      status: 'APPROVED',
    },
    select: { visibilityMode: true },
  });
  if (!connection) {
    throw new AppError(403, 'CONNECTION_REQUIRED', 'This wholesaler catalog is not available');
  }
  if (connection.visibilityMode === 'CATALOG_HIDDEN') {
    throw new AppError(403, 'CATALOG_HIDDEN', 'This wholesaler has hidden their catalog');
  }
  const products = await prisma.catalogProduct.findMany({
    where: { orgId: order.wholesalerOrgId, deletedAt: null, id: { in: added } },
  });
  if (products.length !== added.length) {
    throw new AppError(422, 'VALIDATION_ERROR', 'A product is not in this catalog');
  }
  const pricesVisible = connection.visibilityMode === 'FULL';
  return new Map(
    products.map((product) => {
      if (product.availabilityStatus === 'OUT_OF_STOCK') {
        throw new AppError(422, 'VALIDATION_ERROR', `${product.name} is out of stock`);
      }
      const agreedPrice =
        pricesVisible && product.listedPrice && !product.isPriceOnRequest
          ? product.listedPrice.toFixed(2)
          : null;
      return [product.id, { name: product.name, agreedPrice }] as const;
    }),
  );
}

function linePrice(
  proposed: string | null | undefined,
  current: { toFixed: (digits: number) => string } | null,
): string | null {
  if (proposed) {
    return centsToMoney(moneyToCents(proposed));
  }
  return current ? current.toFixed(2) : null;
}

export type StoredAmendment = {
  messageId: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  lines: ChatChangeLine[];
};

export type OpenAmendmentLine = ChatChangeLine & { catalogProductId: string | null };

export async function loadAmendments(
  orderId: string,
  items: readonly { catalogProductId: string | null; productName: string; quantity: number }[],
  includeOpen: boolean,
): Promise<{ byMessageId: Map<string, StoredAmendment>; openLines: OpenAmendmentLine[] }> {
  const requests = await prisma.changeRequest.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
    select: { chatMessageId: true, status: true, proposedChanges: true },
  });
  const running = new Map(
    items.flatMap((item) =>
      item.catalogProductId ? [[item.catalogProductId, item.quantity] as const] : [],
    ),
  );
  const names = new Map(
    items.flatMap((item) =>
      item.catalogProductId ? [[item.catalogProductId, item.productName] as const] : [],
    ),
  );
  const byMessageId = new Map<string, StoredAmendment>();
  for (const request of requests) {
    const changes = readStoredChangesOrEmpty(request.proposedChanges);
    const lines = changes.map((change) => {
      const item = items.find((entry) => entry.catalogProductId === change.catalogProductId);
      const fromQuantity =
        change.fromQuantity ??
        running.get(change.catalogProductId) ??
        item?.quantity ??
        change.quantity;
      return {
        productName: change.productName ?? item?.productName ?? 'Item',
        fromQuantity,
        toQuantity: change.quantity,
      };
    });
    if (request.status !== 'DECLINED') {
      for (const change of changes) {
        running.set(change.catalogProductId, change.quantity);
        names.set(
          change.catalogProductId,
          change.productName ?? names.get(change.catalogProductId) ?? 'Item',
        );
      }
    }
    byMessageId.set(request.chatMessageId, {
      messageId: request.chatMessageId,
      status: request.status,
      lines,
    });
  }
  const openLines: OpenAmendmentLine[] = [];
  if (includeOpen) {
    const known = new Set(
      items.flatMap((item) => (item.catalogProductId ? [item.catalogProductId] : [])),
    );
    for (const item of items) {
      if (!item.catalogProductId) {
        continue;
      }
      const next = running.get(item.catalogProductId);
      if (next !== undefined && next !== item.quantity) {
        openLines.push({
          catalogProductId: item.catalogProductId,
          productName: item.productName,
          fromQuantity: item.quantity,
          toQuantity: next,
        });
      }
    }
    for (const [catalogProductId, quantity] of running) {
      if (known.has(catalogProductId)) {
        continue;
      }
      openLines.push({
        catalogProductId,
        productName: names.get(catalogProductId) ?? 'Item',
        fromQuantity: 0,
        toQuantity: quantity,
      });
    }
  }
  return { byMessageId, openLines };
}

function amendmentText(
  lines: readonly { productName?: string; fromQuantity?: number; quantity: number }[],
): string {
  const body = lines
    .map((line) => {
      const name = line.productName && line.productName.length > 0 ? line.productName : 'Item';
      if (line.fromQuantity === 0) {
        return `Added ${name} × ${line.quantity}`;
      }
      if (line.fromQuantity !== undefined && line.fromQuantity !== line.quantity) {
        return `${name} ${line.fromQuantity} → ${line.quantity}`;
      }
      return `${name} quantity ${line.quantity}`;
    })
    .join('; ');
  const text = `Order amendment: ${body}`;
  return text.length > 2_000 ? `${text.slice(0, 1_997)}...` : text;
}

function readStoredChangesOrEmpty(value: unknown): ProposedOrderChange[] {
  const parsed = StoredChangesSchema.safeParse(value);
  if (!parsed.success) {
    return [];
  }
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
}

function toChangeView(
  request: { id: string; status: 'PENDING' | 'ACCEPTED' | 'DECLINED'; proposedChanges: unknown },
  items: readonly { catalogProductId: string | null; productName: string; quantity: number }[],
): ChatChangeView | null {
  if (isCancelPayload(request.proposedChanges)) {
    return { id: request.id, status: request.status, lines: [], kind: 'CANCEL_ORDER' };
  }
  const parsed = StoredChangesSchema.safeParse(request.proposedChanges);
  if (!parsed.success) {
    return null;
  }
  const changes = Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
  return {
    id: request.id,
    status: request.status,
    lines: changes.map((change) => {
      const item = items.find((entry) => entry.catalogProductId === change.catalogProductId);
      return {
        productName: change.productName ?? item?.productName ?? 'Item',
        fromQuantity: change.fromQuantity ?? item?.quantity ?? change.quantity,
        toQuantity: change.quantity,
      };
    }),
  };
}

function responseText(
  payload: { kind: 'CANCEL_ORDER' } | { kind: 'ITEMS'; changes: ProposedOrderChange[] },
  action: ChangeResponseAction,
): string {
  if (payload.kind === 'CANCEL_ORDER') {
    return action === 'ACCEPT'
      ? 'Cancellation accepted. The order is cancelled.'
      : 'The wholesaler kept this order.';
  }
  return action === 'ACCEPT'
    ? amendmentText(payload.changes).replace('Order amendment:', 'Order amendment accepted:')
    : 'The wholesaler kept the current order.';
}

function readChangePayload(
  value: unknown,
): { kind: 'CANCEL_ORDER' } | { kind: 'ITEMS'; changes: ProposedOrderChange[] } {
  if (isCancelPayload(value)) {
    return { kind: 'CANCEL_ORDER' };
  }
  return { kind: 'ITEMS', changes: readStoredChanges(value) };
}

function isCancelPayload(value: unknown): boolean {
  return z.object({ kind: z.literal('CANCEL_ORDER') }).safeParse(value).success;
}

function readStoredChanges(value: unknown): ProposedOrderChange[] {
  const parsed = StoredChangesSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The proposed change could not be read');
  }
  return Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
}

function toOrderSnapshot(order: PartyOrder): OrderSnapshot {
  return {
    id: order.id,
    status: order.status,
    lockedAt: order.lockedAt ? order.lockedAt.toISOString() : null,
    totalValue: moneyText(order.totalValue),
    retailerOrgId: order.retailerOrgId,
    wholesalerOrgId: order.wholesalerOrgId,
    items: order.items.map((item) => ({
      id: item.id,
      catalogProductId: item.catalogProductId ?? '',
      productName: item.productName,
      quantity: item.quantity,
      agreedPrice: moneyText(item.agreedPrice),
    })),
  };
}

function moneyText(value: { toFixed: (digits: number) => string } | null): string {
  return value ? value.toFixed(2) : '0.00';
}

function toMessage(message: StoredMessage, orderId: string): ChatMessageDto {
  return {
    id: message.id,
    orderId,
    threadId: message.threadId,
    senderOrgId: message.senderOrgId,
    senderUserId: message.senderUserId,
    senderName: message.senderUser.name,
    content: message.content,
    messageType: message.messageType,
    createdAt: message.createdAt.toISOString(),
  };
}

function requiredOrgId(auth: AuthSessionUser): string {
  if (!auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'You are not part of this order');
  }
  return auth.orgId;
}
