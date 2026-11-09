import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  moneyToCents,
  type AuthSessionUser,
  type DashboardStats,
  type PageMeta,
  type RetailerAlert,
  type RetailerInvoiceDetail,
  type RetailerInvoiceRow,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { assertLabFeature } from './lab-account.service.js';

const ACTIVE_JOB_STATUSES = [
  'SUBMITTED',
  'CONFIRMED',
  'REJECTED',
  'RECEIVED',
  'CUTTING',
  'FITTING',
  'QC',
  'READY',
] as const;
const MONTH_LABELS = [
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
const CHART_MONTHS = 6;

export async function getDashboardStats(
  auth: AuthSessionUser,
  now = new Date(),
): Promise<DashboardStats> {
  const orgId = requiredRetailerOrgId(auth);
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = addUtcDays(todayStart, 1);
  const yesterdayStart = addUtcDays(todayStart, -1);
  const chartStart = startOfUtcMonth(addUtcMonths(todayStart, -(CHART_MONTHS - 1)));

  const [salesInvoices, creditInvoices, batches, activeLabJobCount, readyLabJobCount] =
    await Promise.all([
      prisma.invoice.findMany({
        where: {
          orgId,
          cancelledAt: null,
          issuedAt: { gte: chartStart, lt: tomorrowStart },
          NOT: { reviewReason: 'Opening credit' },
        },
        select: { total: true, issuedAt: true },
      }),
      prisma.invoice.findMany({
        where: { orgId, status: 'CREDIT', cancelledAt: null },
        select: {
          customerId: true,
          total: true,
          payments: { select: { amount: true } },
        },
      }),
      prisma.inventoryBatch.findMany({
        where: { orgId, deletedAt: null },
        select: { stockQty: true, lowStockThreshold: true },
      }),
      prisma.labJob.count({
        where: {
          retailerOrgId: orgId,
          completedAt: null,
          status: { in: [...ACTIVE_JOB_STATUSES] },
        },
      }),
      prisma.labJob.count({
        where: { retailerOrgId: orgId, completedAt: null, status: 'READY' },
      }),
    ]);

  const todaySales = sumIssuedBetween(salesInvoices, todayStart, tomorrowStart);
  const yesterdaySales = sumIssuedBetween(salesInvoices, yesterdayStart, todayStart);
  const outstanding = outstandingDues(creditInvoices);

  return {
    todaySales: centsToMoney(todaySales),
    yesterdaySales: centsToMoney(yesterdaySales),
    salesChangePercent: changePercent(todaySales, yesterdaySales),
    outstandingDues: centsToMoney(outstanding.amount),
    outstandingCustomerCount: outstanding.customers,
    stockItemCount: batches.length,
    lowStockCount: batches.filter((batch) => batch.stockQty <= batch.lowStockThreshold).length,
    activeLabJobCount,
    readyLabJobCount,
    monthlySales: monthlyTotals(salesInvoices, todayStart),
  };
}

export async function listRetailerInvoices(
  auth: AuthSessionUser,
  limit: number,
): Promise<{ rows: RetailerInvoiceRow[]; meta: PageMeta }> {
  const orgId = requiredRetailerOrgId(auth);
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where: { orgId, NOT: { reviewReason: 'Opening credit' } },
      orderBy: { issuedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        status: true,
        issuedAt: true,
        customer: { select: { name: true } },
      },
    }),
    prisma.invoice.count({ where: { orgId, NOT: { reviewReason: 'Opening credit' } } }),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      customerName: row.customer.name,
      amount: money(row.total),
      status: row.status,
      issuedAt: row.issuedAt.toISOString(),
    })),
    meta: { total, page: 1, limit },
  };
}

export async function getRetailerInvoice(
  auth: AuthSessionUser,
  invoiceId: string,
): Promise<RetailerInvoiceDetail> {
  const orgId = requiredRetailerOrgId(auth);
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId },
    select: {
      id: true,
      invoiceNumber: true,
      total: true,
      status: true,
      issuedAt: true,
      customer: { select: { name: true } },
      items: {
        select: { id: true, productName: true, quantity: true, unitPrice: true },
        orderBy: { productName: 'asc' },
      },
    },
  });
  if (!invoice) {
    throw new AppError(404, 'NOT_FOUND', 'Invoice was not found');
  }
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.customer.name,
    amount: money(invoice.total),
    status: invoice.status,
    issuedAt: invoice.issuedAt.toISOString(),
    items: invoice.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
    })),
  };
}

const ALERTS_BY_CATEGORY = {
  ALL: undefined,
  LOW_STOCK: ['LOW_STOCK'],
  PAYMENTS: ['PAYMENT_DUE', 'PAYMENT_OVERDUE'],
  LAB_JOBS: ['LAB_JOB_STATUS', 'LAB_JOB_READY', 'CONNECTION_REQUEST'],
  ORDERS: ['ORDER_PLACED', 'ORDER_CONFIRMED', 'ORDER_DISPATCHED', 'ORDER_DELIVERED'],
  REVIEWS: ['INVOICE_REVIEW'],
} as const;

export async function listRetailerAlerts(
  auth: AuthSessionUser,
  options: { limit: number; includeRead: boolean; category: keyof typeof ALERTS_BY_CATEGORY },
): Promise<{ rows: RetailerAlert[]; meta: PageMeta }> {
  return listAlertsForOrg(requiredRetailerOrgId(auth), options);
}

export async function listOrgAlerts(
  auth: AuthSessionUser,
  options: { limit: number; includeRead: boolean; category: keyof typeof ALERTS_BY_CATEGORY },
): Promise<{ rows: RetailerAlert[]; meta: PageMeta }> {
  await assertLabNotificationAccess(auth);
  return listAlertsForOrg(requiredOrgId(auth), options);
}

async function listAlertsForOrg(
  orgId: string,
  options: { limit: number; includeRead: boolean; category: keyof typeof ALERTS_BY_CATEGORY },
): Promise<{ rows: RetailerAlert[]; meta: PageMeta }> {
  const types = ALERTS_BY_CATEGORY[options.category];
  const where = {
    orgId,
    ...(options.includeRead ? {} : { isRead: false }),
    ...(types ? { type: { in: [...types] } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.alert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options.limit,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        isRead: true,
        relatedEntityId: true,
        relatedEntityType: true,
        createdAt: true,
      },
    }),
    prisma.alert.count({ where }),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      isRead: row.isRead,
      relatedEntityId: row.relatedEntityId,
      relatedEntityType: row.relatedEntityType,
      createdAt: row.createdAt.toISOString(),
    })),
    meta: { total, page: 1, limit: options.limit },
  };
}

export async function markRetailerAlertRead(
  auth: AuthSessionUser,
  alertId: string,
): Promise<RetailerAlert> {
  return markAlertReadForOrg(requiredRetailerOrgId(auth), alertId);
}

export async function markOrgAlertRead(
  auth: AuthSessionUser,
  alertId: string,
): Promise<RetailerAlert> {
  await assertLabNotificationAccess(auth);
  return markAlertReadForOrg(requiredOrgId(auth), alertId);
}

async function markAlertReadForOrg(orgId: string, alertId: string): Promise<RetailerAlert> {
  const existing = await prisma.alert.findFirst({
    where: { id: alertId, orgId },
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      isRead: true,
      relatedEntityId: true,
      relatedEntityType: true,
      createdAt: true,
    },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Alert was not found');
  }
  const row = existing.isRead
    ? existing
    : await prisma.alert.update({
        where: { id: existing.id },
        data: { isRead: true },
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          isRead: true,
          relatedEntityId: true,
          relatedEntityType: true,
          createdAt: true,
        },
      });
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    isRead: row.isRead,
    relatedEntityId: row.relatedEntityId,
    relatedEntityType: row.relatedEntityType,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function markAllRetailerAlertsRead(
  auth: AuthSessionUser,
): Promise<{ updated: number }> {
  return markAllReadForOrg(requiredRetailerOrgId(auth));
}

export async function markAllOrgAlertsRead(auth: AuthSessionUser): Promise<{ updated: number }> {
  await assertLabNotificationAccess(auth);
  return markAllReadForOrg(requiredOrgId(auth));
}

async function assertLabNotificationAccess(auth: AuthSessionUser): Promise<void> {
  if (auth.orgType !== 'LABORATORY') {
    return;
  }
  await assertLabFeature(auth, 'notifications');
}

async function markAllReadForOrg(orgId: string): Promise<{ updated: number }> {
  const result = await prisma.alert.updateMany({
    where: { orgId, isRead: false },
    data: { isRead: true },
  });
  return { updated: result.count };
}

function requiredRetailerOrgId(auth: AuthSessionUser): string {
  if (!auth.orgId || auth.orgType !== 'RETAILER') {
    throw new AppError(403, 'FORBIDDEN', 'This area is not available for your organisation');
  }
  return auth.orgId;
}

function requiredOrgId(auth: AuthSessionUser): string {
  if (!auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This area is not available for your organisation');
  }
  return auth.orgId;
}

function money(value: { toFixed: (digits: number) => string }): string {
  return centsToMoney(moneyToCents(value.toFixed(2)));
}

function sumIssuedBetween(
  invoices: readonly { total: { toFixed: (digits: number) => string }; issuedAt: Date }[],
  start: Date,
  end: Date,
): number {
  return invoices.reduce((sum, invoice) => {
    if (invoice.issuedAt >= start && invoice.issuedAt < end) {
      return sum + moneyToCents(invoice.total.toFixed(2));
    }
    return sum;
  }, 0);
}

function outstandingDues(
  invoices: readonly {
    customerId: string;
    total: { toFixed: (digits: number) => string };
    payments: readonly { amount: { toFixed: (digits: number) => string } }[];
  }[],
): { amount: number; customers: number } {
  const byCustomer = new Map<string, number>();
  for (const invoice of invoices) {
    const paid = invoice.payments.reduce(
      (sum, payment) => sum + moneyToCents(payment.amount.toFixed(2)),
      0,
    );
    const due = Math.max(0, moneyToCents(invoice.total.toFixed(2)) - paid);
    byCustomer.set(invoice.customerId, (byCustomer.get(invoice.customerId) ?? 0) + due);
  }
  let amount = 0;
  let customers = 0;
  for (const due of byCustomer.values()) {
    if (due > 0) {
      amount += due;
      customers += 1;
    }
  }
  return { amount, customers };
}

function changePercent(todayCents: number, yesterdayCents: number): number | null {
  if (yesterdayCents === 0) {
    return todayCents === 0 ? 0 : null;
  }
  return Math.round(((todayCents - yesterdayCents) / yesterdayCents) * 1000) / 10;
}

function monthlyTotals(
  invoices: readonly { total: { toFixed: (digits: number) => string }; issuedAt: Date }[],
  todayStart: Date,
): DashboardStats['monthlySales'] {
  const months = Array.from({ length: CHART_MONTHS }, (_, index) => {
    const start = startOfUtcMonth(addUtcMonths(todayStart, index - (CHART_MONTHS - 1)));
    return {
      month: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`,
      label: MONTH_LABELS[start.getUTCMonth()] ?? '',
      totalCents: 0,
      isCurrent:
        start.getUTCFullYear() === todayStart.getUTCFullYear() &&
        start.getUTCMonth() === todayStart.getUTCMonth(),
    };
  });
  for (const invoice of invoices) {
    const key = `${invoice.issuedAt.getUTCFullYear()}-${String(invoice.issuedAt.getUTCMonth() + 1).padStart(2, '0')}`;
    const bucket = months.find((month) => month.month === key);
    if (bucket) {
      bucket.totalCents += moneyToCents(invoice.total.toFixed(2));
    }
  }
  return months.map((month) => ({
    month: month.month,
    label: month.label,
    total: centsToMoney(month.totalCents),
    isCurrent: month.isCurrent,
  }));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}
