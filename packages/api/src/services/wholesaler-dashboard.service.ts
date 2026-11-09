import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  moneyToCents,
  type AuthSessionUser,
  type OrderStatus,
  type WholesalerDashboard,
  type WholesalerOrderDetail,
  type WholesalerOrderRow,
  type WholesalerShell,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { orderActivity, orderLine, speakShopAction } from './record-activity.js';
import { loadAmendments } from './order-chat.service.js';

const NEW_ORDER_MS = 30 * 60 * 1000;
const RECENT_LIMIT = 8;

export async function getWholesalerShell(auth: AuthSessionUser): Promise<WholesalerShell> {
  const orgId = requireWholesaler(auth);
  const [org, pendingOrderCount] = await Promise.all([
    prisma.organisation.findFirst({ where: { id: orgId }, select: { name: true } }),
    prisma.order.count({ where: { wholesalerOrgId: orgId, status: 'PENDING' } }),
  ]);
  if (!org) {
    throw new AppError(404, 'NOT_FOUND', 'Organisation not found');
  }
  return { orgName: org.name, pendingOrderCount };
}

export async function getWholesalerDashboard(auth: AuthSessionUser): Promise<WholesalerDashboard> {
  const orgId = requireWholesaler(auth);
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [
    pendingOrders,
    activeConnections,
    catalogProducts,
    outOfStockProducts,
    ordersToday,
    grouped,
    recent,
  ] = await Promise.all([
    prisma.order.count({ where: { wholesalerOrgId: orgId, status: 'PENDING' } }),
    prisma.retailerConnection.count({ where: { wholesalerOrgId: orgId, status: 'APPROVED' } }),
    prisma.catalogProduct.count({ where: { orgId, deletedAt: null } }),
    prisma.catalogProduct.count({
      where: { orgId, deletedAt: null, availabilityStatus: 'OUT_OF_STOCK' },
    }),
    prisma.order.count({ where: { wholesalerOrgId: orgId, createdAt: { gte: todayStart } } }),
    prisma.order.groupBy({
      by: ['status'],
      where: { wholesalerOrgId: orgId },
      _count: { _all: true },
    }),
    loadOrderRows(orgId, { take: RECENT_LIMIT }),
  ]);

  const pipeline = { PENDING: 0, CONFIRMED: 0, DISPATCHED: 0, DELIVERED: 0 };
  for (const row of grouped) {
    if (row.status !== 'CANCELLED') {
      pipeline[row.status] = row._count._all;
    }
  }

  return {
    pendingOrders,
    activeConnections,
    catalogProducts,
    outOfStockProducts,
    ordersToday,
    pipeline,
    recentOrders: recent,
  };
}

export async function listWholesalerOrders(
  auth: AuthSessionUser,
  query: { status?: OrderStatus; retailerOrgId?: string; q?: string; page: number; limit: number },
): Promise<{
  orders: WholesalerOrderRow[];
  total: number;
  pipeline: WholesalerDashboard['pipeline'];
}> {
  const orgId = requireWholesaler(auth);
  const referenceIds = await referenceOrderIds(orgId, query.q);
  const filtered = orderWhere(orgId, query, referenceIds);
  const counted = orderWhere(
    orgId,
    { retailerOrgId: query.retailerOrgId, q: query.q },
    referenceIds,
  );
  const [total, orders, grouped] = await Promise.all([
    prisma.order.count({ where: filtered }),
    loadOrderRows(orgId, {
      status: query.status,
      retailerOrgId: query.retailerOrgId,
      q: query.q,
      referenceIds,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.order.groupBy({
      by: ['status'],
      where: counted,
      _count: { _all: true },
    }),
  ]);
  const pipeline = { PENDING: 0, CONFIRMED: 0, DISPATCHED: 0, DELIVERED: 0 };
  for (const row of grouped) {
    if (row.status !== 'CANCELLED') {
      pipeline[row.status] = row._count._all;
    }
  }
  return { orders, total, pipeline };
}

export async function getWholesalerOrderDetail(
  auth: AuthSessionUser,
  orderId: string,
): Promise<WholesalerOrderDetail> {
  const orgId = requireWholesaler(auth);
  const order = await prisma.order.findFirst({
    where: { id: orderId, wholesalerOrgId: orgId },
    include: {
      retailer: { select: { name: true, city: true, phone: true } },
      connection: { select: { approvedAt: true } },
      items: { orderBy: { createdAt: 'asc' } },
      chatThread: {
        select: {
          messages: {
            orderBy: { createdAt: 'asc' },
            take: 50,
            select: {
              id: true,
              senderOrgId: true,
              senderUserId: true,
              content: true,
              messageType: true,
              createdAt: true,
              senderUser: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!order) {
    throw new AppError(404, 'NOT_FOUND', 'Order not found');
  }
  const messages = order.chatThread?.messages ?? [];
  const amendments = await loadAmendments(
    order.id,
    order.items,
    order.status === 'PENDING' || order.status === 'CONFIRMED',
  );
  const confirmed = messages.find(
    (message) => message.content === 'Order confirmed · locked',
  )?.createdAt;
  const dispatched = messages.find((message) => message.content === 'Order dispatched.')?.createdAt;
  const delivered = messages.find((message) => message.content === 'Order delivered.')?.createdAt;
  const locked = Boolean(order.lockedAt);
  return {
    id: order.id,
    reference: orderReference(order.id),
    status: order.status,
    lockedAt: order.lockedAt ? order.lockedAt.toISOString() : null,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    activity: orderActivity(
      messages.map((message) => ({
        content: message.content,
        spoken: speakShopAction(message.content, {
          isViewer: message.senderUserId === auth.userId,
          name: message.senderUser.name,
          shopName: order.retailer.name,
        }),
        createdAt: message.createdAt,
        senderName: message.senderUser.name,
      })),
      order.items.map((item) =>
        orderLine(item.productName, item.quantity, moneyText(item.agreedPrice)),
      ),
    ),
    totalValue: moneyText(order.totalValue),
    openAmendment: amendments.openLines,
    retailer: {
      name: order.retailer.name,
      city: order.retailer.city,
      phone: order.retailer.phone,
      connectedSince: order.connection.approvedAt
        ? order.connection.approvedAt.toISOString()
        : null,
    },
    items: order.items.map((item) => {
      const agreedPrice = moneyText(item.agreedPrice);
      return {
        id: item.id,
        catalogProductId: item.catalogProductId,
        productName: item.productName,
        quantity: item.quantity,
        agreedPrice,
        lineTotal:
          locked && agreedPrice ? centsToMoney(moneyToCents(agreedPrice) * item.quantity) : null,
      };
    }),
    stages: [
      { status: 'PENDING', reachedAt: order.createdAt.toISOString() },
      {
        status: 'CONFIRMED',
        reachedAt: order.lockedAt
          ? order.lockedAt.toISOString()
          : confirmed
            ? confirmed.toISOString()
            : null,
      },
      { status: 'DISPATCHED', reachedAt: dispatched ? dispatched.toISOString() : null },
      { status: 'DELIVERED', reachedAt: delivered ? delivered.toISOString() : null },
    ],
    messages: messages.map((message) => ({
      id: message.id,
      senderName: message.senderUser.name,
      senderOrgId: message.senderOrgId,
      content: speakShopAction(message.content, {
        isViewer: message.senderUserId === auth.userId,
        name: message.senderUser.name,
        shopName: order.retailer.name,
      }),
      messageType: message.messageType,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

async function loadOrderRows(
  orgId: string,
  options: {
    status?: OrderStatus;
    retailerOrgId?: string;
    q?: string;
    referenceIds?: string[];
    skip?: number;
    take: number;
  },
): Promise<WholesalerOrderRow[]> {
  const rows = await prisma.order.findMany({
    where: orderWhere(orgId, options, options.referenceIds ?? []),
    orderBy: { createdAt: 'desc' },
    skip: options.skip,
    take: options.take,
    select: {
      id: true,
      status: true,
      createdAt: true,
      totalValue: true,
      retailerOrgId: true,
      retailer: { select: { name: true } },
      items: { select: { productName: true, quantity: true }, orderBy: { createdAt: 'asc' } },
      chatThread: {
        select: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: { senderOrgId: true, createdAt: true },
          },
        },
      },
    },
  });
  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    reference: orderReference(row.id),
    retailerOrgId: row.retailerOrgId,
    retailerName: row.retailer.name,
    itemCount: row.items.length,
    itemsSummary: summarizeItems(row.items),
    totalValue: moneyText(row.totalValue),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    isNew: now - row.createdAt.getTime() < NEW_ORDER_MS,
    hasUnread: unreadFromRetailer(row.chatThread?.messages ?? [], row.retailerOrgId, orgId),
  }));
}

function orderWhere(
  orgId: string,
  options: { status?: OrderStatus; retailerOrgId?: string; q?: string },
  referenceIds: readonly string[],
) {
  const q = options.q?.replace(/^#/, '').trim();
  return {
    wholesalerOrgId: orgId,
    ...(options.status ? { status: options.status } : {}),
    ...(options.retailerOrgId ? { retailerOrgId: options.retailerOrgId } : {}),
    ...(q
      ? {
          OR: [
            { retailer: { name: { contains: q, mode: 'insensitive' as const } } },
            ...(referenceIds.length > 0 ? [{ id: { in: [...referenceIds] } }] : []),
          ],
        }
      : {}),
  };
}

async function referenceOrderIds(orgId: string, q: string | undefined): Promise<string[]> {
  const reference =
    q
      ?.replace(/^#/, '')
      .replace(/[^0-9a-fA-F]/g, '')
      .toLowerCase() ?? '';
  if (reference.length < 4) {
    return [];
  }
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM orders
    WHERE wholesaler_org_id = CAST(${orgId} AS uuid)
      AND replace(id::text, '-', '') ILIKE ${`${reference}%`}
  `;
  return rows.map((row) => row.id);
}

function summarizeItems(items: readonly { productName: string; quantity: number }[]): string {
  const first = items[0];
  if (!first) {
    return 'No items';
  }
  const head = `${first.productName} × ${first.quantity}`;
  if (items.length === 1) {
    return head;
  }
  return `${head} + ${items.length - 1} more`;
}

function moneyText(value: { toFixed: (digits: number) => string } | null): string | null {
  return value ? value.toFixed(2) : null;
}

function orderReference(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function unreadFromRetailer(
  messages: readonly { senderOrgId: string; createdAt: Date }[],
  retailerOrgId: string,
  wholesalerOrgId: string,
): boolean {
  const latestRetailer = messages.find((message) => message.senderOrgId === retailerOrgId);
  if (!latestRetailer) {
    return false;
  }
  const latestWholesaler = messages.find((message) => message.senderOrgId === wholesalerOrgId);
  if (!latestWholesaler) {
    return true;
  }
  return latestRetailer.createdAt.getTime() > latestWholesaler.createdAt.getTime();
}

function requireWholesaler(auth: AuthSessionUser): string {
  if (auth.orgType !== 'WHOLESALER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'A wholesaler account is required');
  }
  return auth.orgId;
}
