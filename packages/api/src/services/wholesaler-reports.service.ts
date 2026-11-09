import ExcelJS from 'exceljs';
import { prisma } from '@optiworld/db';
import type {
  AuthSessionUser,
  OrderStatus,
  WholesalerCatalogActivity,
  WholesalerOrderActivity,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { styleSheet } from '../lib/sheet-table.js';
import { pdfWhen, renderTablePdf } from '../lib/text-pdf.js';

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

type Range = { from: string; to: string; start: Date; end: Date };

type ActivityOrder = {
  id: string;
  status: OrderStatus;
  createdAt: Date;
  lockedAt: Date | null;
  retailer: { name: string };
  items: { productName: string; quantity: number }[];
  chatThread: {
    messages: { content: string; messageType: string; senderOrgId: string; createdAt: Date }[];
  } | null;
};

export async function getOrderActivity(
  auth: AuthSessionUser,
  from: string,
  to: string,
): Promise<WholesalerOrderActivity> {
  const orgId = requireWholesaler(auth);
  const range = parseRange(from, to);
  const [received, confirmed, dispatched, delivered, orders] = await Promise.all([
    prisma.order.count({
      where: { wholesalerOrgId: orgId, createdAt: { gte: range.start, lt: range.end } },
    }),
    prisma.order.count({
      where: { wholesalerOrgId: orgId, lockedAt: { gte: range.start, lt: range.end } },
    }),
    countStatusMessage(orgId, 'Order dispatched.', range),
    countStatusMessage(orgId, 'Order delivered.', range),
    loadOrders(orgId, range),
  ]);
  const months = monthKeys(range);
  return {
    from: range.from,
    to: range.to,
    counts: { received, confirmed, dispatched, delivered },
    orders: orders.map((order) => toActivityRow(order)),
    months: months.map(monthLabel),
    byRetailer: retailerPivot(orders, months),
    responseTime: averageResponse(orders, orgId),
  };
}

export async function getCatalogActivity(
  auth: AuthSessionUser,
  from: string,
  to: string,
): Promise<WholesalerCatalogActivity> {
  const orgId = requireWholesaler(auth);
  const range = parseRange(from, to);
  const items = await prisma.orderItem.findMany({
    where: { order: { wholesalerOrgId: orgId, createdAt: { gte: range.start, lt: range.end } } },
    select: { productName: true },
  });
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.productName, (counts.get(item.productName) ?? 0) + 1);
  }
  const products = [...counts.entries()]
    .map(([productName, orderLines]) => ({ productName, orderLines }))
    .sort(
      (left, right) =>
        right.orderLines - left.orderLines || left.productName.localeCompare(right.productName),
    )
    .slice(0, 10);
  return { from: range.from, to: range.to, products };
}

export async function exportOrderHistory(
  auth: AuthSessionUser,
  from: string,
  to: string,
  format: 'xlsx' | 'pdf' = 'xlsx',
): Promise<{ filename: string; body: Buffer }> {
  if (format === 'pdf') {
    return exportOrderHistoryPdf(auth, from, to);
  }
  const activity = await getOrderActivity(auth, from, to);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Order history');
  sheet.columns = [
    { header: 'Order #', key: 'reference', width: 14 },
    { header: 'Retailer', key: 'retailer', width: 28 },
    { header: 'Items', key: 'items', width: 36 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Submitted', key: 'submitted', width: 22 },
    { header: 'Confirmed', key: 'confirmed', width: 22 },
    { header: 'Dispatched', key: 'dispatched', width: 22 },
    { header: 'Delivered', key: 'delivered', width: 22 },
  ];
  for (const order of activity.orders) {
    sheet.addRow({
      reference: order.reference,
      retailer: order.retailerName,
      items: order.itemsSummary,
      status: order.status,
      submitted: order.submittedAt,
      confirmed: order.confirmedAt ?? '',
      dispatched: order.dispatchedAt ?? '',
      delivered: order.deliveredAt ?? '',
    });
  }
  styleSheet(sheet);
  const body = Buffer.from(await workbook.xlsx.writeBuffer());
  return { filename: 'order-history.xlsx', body };
}

async function exportOrderHistoryPdf(
  auth: AuthSessionUser,
  from: string,
  to: string,
): Promise<{ filename: string; body: Buffer }> {
  const activity = await getOrderActivity(auth, from, to);
  return {
    filename: 'order-history.pdf',
    body: renderTablePdf({
      title: 'OptiWorld order history',
      landscape: true,
      tables: [
        {
          heading: 'Range',
          columns: ['From', 'To'],
          rows: [[activity.from, activity.to]],
        },
        {
          heading: 'Orders',
          columns: [
            'Order',
            'Retailer',
            'Items',
            'Status',
            'Submitted',
            'Confirmed',
            'Dispatched',
            'Delivered',
          ],
          widths: [0.8, 1.4, 1.8, 0.9, 1.1, 1.1, 1.1, 1.1],
          empty: 'No orders in this range.',
          rows: activity.orders.map((order) => [
            order.reference,
            order.retailerName,
            order.itemsSummary,
            order.status,
            pdfWhen(order.submittedAt),
            pdfWhen(order.confirmedAt),
            pdfWhen(order.dispatchedAt),
            pdfWhen(order.deliveredAt),
          ]),
        },
      ],
    }),
  };
}

async function countStatusMessage(orgId: string, content: string, range: Range): Promise<number> {
  return prisma.chatMessage.count({
    where: {
      messageType: 'SYSTEM',
      content,
      createdAt: { gte: range.start, lt: range.end },
      thread: { order: { wholesalerOrgId: orgId } },
    },
  });
}

async function loadOrders(orgId: string, range: Range): Promise<ActivityOrder[]> {
  return prisma.order.findMany({
    where: { wholesalerOrgId: orgId, createdAt: { gte: range.start, lt: range.end } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      createdAt: true,
      lockedAt: true,
      retailer: { select: { name: true } },
      items: { select: { productName: true, quantity: true }, orderBy: { createdAt: 'asc' } },
      chatThread: {
        select: {
          messages: {
            select: { content: true, messageType: true, senderOrgId: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  });
}

function toActivityRow(order: ActivityOrder): WholesalerOrderActivity['orders'][number] {
  const messages = order.chatThread?.messages ?? [];
  return {
    id: order.id,
    reference: order.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
    retailerName: order.retailer.name,
    itemsSummary: summarizeItems(order.items),
    status: order.status,
    submittedAt: order.createdAt.toISOString(),
    confirmedAt: order.lockedAt ? order.lockedAt.toISOString() : null,
    dispatchedAt: messageTime(messages, 'Order dispatched.'),
    deliveredAt: messageTime(messages, 'Order delivered.'),
  };
}

function retailerPivot(
  orders: readonly ActivityOrder[],
  months: readonly string[],
): WholesalerOrderActivity['byRetailer'] {
  const rows = new Map<string, number[]>();
  for (const order of orders) {
    const counts = rows.get(order.retailer.name) ?? months.map(() => 0);
    const index = months.indexOf(order.createdAt.toISOString().slice(0, 7));
    if (index >= 0) {
      const current = counts[index] ?? 0;
      counts[index] = current + 1;
    }
    rows.set(order.retailer.name, counts);
  }
  return [...rows.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([retailerName, counts]) => ({ retailerName, counts }));
}

function averageResponse(
  orders: readonly ActivityOrder[],
  orgId: string,
): WholesalerOrderActivity['responseTime'] {
  const minutes: number[] = [];
  for (const order of orders) {
    const reply = order.chatThread?.messages.find(
      (message) => message.messageType === 'TEXT' && message.senderOrgId === orgId,
    );
    if (!reply) {
      continue;
    }
    const elapsed = Math.round((reply.createdAt.getTime() - order.createdAt.getTime()) / 60_000);
    if (elapsed >= 0) {
      minutes.push(elapsed);
    }
  }
  if (minutes.length === 0) {
    return { averageMinutes: null, sampleSize: 0 };
  }
  const total = minutes.reduce((sum, value) => sum + value, 0);
  return { averageMinutes: Math.round(total / minutes.length), sampleSize: minutes.length };
}

function messageTime(
  messages: readonly { content: string; createdAt: Date }[],
  content: string,
): string | null {
  const match = messages.find((message) => message.content === content);
  return match ? match.createdAt.toISOString() : null;
}

function summarizeItems(items: readonly { productName: string; quantity: number }[]): string {
  const first = items[0];
  if (!first) {
    return 'No items';
  }
  const head = `${first.productName} × ${first.quantity}`;
  return items.length === 1 ? head : `${head} + ${items.length - 1} more`;
}

function monthKeys(range: Range): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), 1));
  const last = new Date(range.end.getTime() - 1);
  const endMonth = Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1);
  while (cursor.getTime() <= endMonth) {
    keys.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

function monthLabel(key: string): string {
  const [year, month] = key.split('-');
  const index = Number(month) - 1;
  return `${MONTHS[index] ?? month} ${year ?? ''}`;
}

function parseRange(from: string, to: string): Range {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Choose a valid date range');
  }
  if ((end.getTime() - start.getTime()) / DAY_MS > MAX_DAYS) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Choose a range of 366 days or less');
  }
  return { from, to, start, end };
}

function requireWholesaler(auth: AuthSessionUser): string {
  if (auth.orgType !== 'WHOLESALER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This action is available to wholesalers');
  }
  return auth.orgId;
}
