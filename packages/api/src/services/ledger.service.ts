import ExcelJS from 'exceljs';
import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  paymentReminderMessage,
  type AgingReport,
  type AgingRow,
  type AuthSessionUser,
  type LedgerSummary,
  type ReminderSendResult,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { styleSheet } from '../lib/sheet-table.js';
import { renderTablePdf } from '../lib/text-pdf.js';

type BucketCents = {
  current: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getLedgerSummary(
  auth: AuthSessionUser,
  now = new Date(),
): Promise<LedgerSummary> {
  const rows = await loadAgingRows(auth, now);
  const credit = await creditTotals(requiredRetailerOrgId(auth));
  const total = rows.reduce((sum, row) => sum + moneyToNumber(row.total), 0);
  return {
    totalOutstanding: centsToMoney(Math.round(total * 100)),
    creditBilled: centsToMoney(credit.billed),
    creditReceived: centsToMoney(credit.received),
    customersWithDues: rows.length,
    overdue30Plus: rows.filter((row) => row.status !== 'CURRENT').length,
    overdue60Plus: rows.filter((row) => row.status === 'OVERDUE').length,
    rows,
  };
}

export async function getAgingReport(
  auth: AuthSessionUser,
  now = new Date(),
): Promise<AgingReport> {
  const rows = await loadAgingRows(auth, now);
  const buckets = rows.reduce<BucketCents>(
    (sum, row) => ({
      current: sum.current + moneyToNumber(row.current),
      days31to60: sum.days31to60 + moneyToNumber(row.days31to60),
      days61to90: sum.days61to90 + moneyToNumber(row.days61to90),
      days90plus: sum.days90plus + moneyToNumber(row.days90plus),
    }),
    { current: 0, days31to60: 0, days61to90: 0, days90plus: 0 },
  );
  return {
    buckets: {
      current: centsToMoney(Math.round(buckets.current * 100)),
      days31to60: centsToMoney(Math.round(buckets.days31to60 * 100)),
      days61to90: centsToMoney(Math.round(buckets.days61to90 * 100)),
      days90plus: centsToMoney(Math.round(buckets.days90plus * 100)),
    },
    rows,
  };
}

export async function exportAgingPdf(auth: AuthSessionUser): Promise<Buffer> {
  const report = await getAgingReport(auth);
  return renderTablePdf({
    title: 'OptiWorld ledger',
    landscape: true,
    tables: [
      {
        heading: 'Customer balances still open on credit',
        columns: ['Customer', 'Current', '31-60d', '61-90d', '90+d', 'Total', 'Status'],
        widths: [1.8, 1, 1, 1, 1, 1, 1],
        empty: 'No outstanding dues.',
        rows: report.rows.map((row) => [
          row.customerName,
          row.current,
          row.days31to60,
          row.days61to90,
          row.days90plus,
          row.total,
          statusLabel(row.status),
        ]),
      },
    ],
  });
}

export async function exportAgingWorkbook(auth: AuthSessionUser): Promise<Buffer> {
  const report = await getAgingReport(auth);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Aging');
  sheet.columns = [
    { header: 'Customer', key: 'customer', width: 28 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Current (0-30d)', key: 'current', width: 18 },
    { header: '31-60d', key: 'days31to60', width: 14 },
    { header: '61-90d', key: 'days61to90', width: 14 },
    { header: '90+d', key: 'days90plus', width: 14 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
  ];
  for (const row of report.rows) {
    sheet.addRow({
      customer: row.customerName,
      phone: row.phone ?? '',
      current: row.current,
      days31to60: row.days31to60,
      days61to90: row.days61to90,
      days90plus: row.days90plus,
      total: row.total,
      status: statusLabel(row.status),
    });
  }
  styleSheet(sheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function sendPaymentReminders(
  auth: AuthSessionUser,
  customerIds: readonly string[] | undefined,
): Promise<ReminderSendResult> {
  const orgId = requiredRetailerOrgId(auth);
  const rows = await loadAgingRows(auth);
  const selected =
    customerIds && customerIds.length > 0
      ? rows.filter((row) => customerIds.includes(row.customerId))
      : rows;
  const missing = (customerIds ?? []).filter((id) => !rows.some((row) => row.customerId === id));
  const results: ReminderSendResult['results'] = [];
  for (const id of missing) {
    results.push({
      customerId: id,
      customerName: 'Customer',
      sent: false,
      message: 'This customer has nothing due.',
    });
  }
  for (const row of selected) {
    results.push(await sendOneReminder(orgId, auth.userId, row));
  }
  return { results };
}

async function loadAgingRows(auth: AuthSessionUser, now = new Date()): Promise<AgingRow[]> {
  const orgId = requiredRetailerOrgId(auth);
  const org = await prisma.organisation.findFirst({
    where: { id: orgId, deletedAt: null },
    select: { name: true, paymentTermDays: true },
  });
  if (!org) {
    throw new AppError(404, 'NOT_FOUND', 'This shop was not found');
  }
  const customers = await prisma.customer.findMany({
    where: { orgId, deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      invoices: {
        where: { status: 'CREDIT', cancelledAt: null },
        select: {
          invoiceNumber: true,
          issuedAt: true,
          total: true,
          payments: { select: { amount: true } },
        },
      },
    },
  });
  const rows: AgingRow[] = [];
  for (const customer of customers) {
    const buckets: BucketCents = { current: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
    const openBills: Array<{
      invoiceNumber: number;
      total: string;
      paid: string;
      remaining: string;
    }> = [];
    let earliestDue: Date | null = null;
    for (const invoice of customer.invoices) {
      const invoiceTotal = toCents(invoice.total);
      const paid = invoice.payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
      const due = Math.max(0, invoiceTotal - paid);
      if (due === 0) {
        continue;
      }
      openBills.push({
        invoiceNumber: invoice.invoiceNumber,
        total: formatAmount(invoiceTotal),
        paid: formatAmount(Math.min(paid, invoiceTotal)),
        remaining: formatAmount(due),
      });
      const age = ageDays(invoice.issuedAt, now);
      addBucket(buckets, age, due);
      const dueOn = addUtcDays(invoice.issuedAt, org.paymentTermDays);
      if (!earliestDue || dueOn.getTime() < earliestDue.getTime()) {
        earliestDue = dueOn;
      }
    }
    const total = buckets.current + buckets.days31to60 + buckets.days61to90 + buckets.days90plus;
    if (total === 0 || !earliestDue) {
      continue;
    }
    const dueOn = formatDay(earliestDue);
    const outstanding = formatAmount(total);
    rows.push({
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phone,
      current: centsToMoney(buckets.current),
      days31to60: centsToMoney(buckets.days31to60),
      days61to90: centsToMoney(buckets.days61to90),
      days90plus: centsToMoney(buckets.days90plus),
      total: centsToMoney(total),
      status: statusFor(buckets),
      dueOn,
      preview: paymentReminderMessage({
        customerName: customer.name,
        businessName: org.name,
        outstanding,
        dueOn,
        bills: openBills,
      }),
    });
  }
  rows.sort(
    (a, b) =>
      moneyToNumber(b.total) - moneyToNumber(a.total) ||
      a.customerName.localeCompare(b.customerName),
  );
  return rows;
}

async function sendOneReminder(
  orgId: string,
  userId: string,
  row: AgingRow,
): Promise<ReminderSendResult['results'][number]> {
  const phone = (row.phone ?? '').replace(/\D/g, '');
  if (!phone) {
    await logReminder(orgId, userId, row.customerId, false, 'Customer has no phone number');
    return {
      customerId: row.customerId,
      customerName: row.customerName,
      sent: false,
      message: 'This customer has no phone number on file.',
    };
  }
  const token = process.env.WHATSAPP_API_TOKEN ?? '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  if (!token || !phoneNumberId) {
    await logReminder(orgId, userId, row.customerId, false, 'WhatsApp is not configured');
    return {
      customerId: row.customerId,
      customerName: row.customerName,
      sent: false,
      message: 'WhatsApp is not configured yet.',
    };
  }
  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: 'optiworld_payment_reminder',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: row.customerName },
                { type: 'text', text: row.total },
                { type: 'text', text: row.dueOn },
              ],
            },
          ],
        },
      }),
    });
    if (!response.ok) {
      await logReminder(
        orgId,
        userId,
        row.customerId,
        false,
        `WhatsApp returned ${response.status}`,
      );
      return {
        customerId: row.customerId,
        customerName: row.customerName,
        sent: false,
        message: 'WhatsApp could not send this reminder.',
      };
    }
    await logReminder(orgId, userId, row.customerId, true, 'Payment reminder sent');
    return {
      customerId: row.customerId,
      customerName: row.customerName,
      sent: true,
      message: 'Reminder sent on WhatsApp.',
    };
  } catch (error) {
    logger.error('WhatsApp payment reminder failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    await logReminder(orgId, userId, row.customerId, false, 'WhatsApp request failed');
    return {
      customerId: row.customerId,
      customerName: row.customerName,
      sent: false,
      message: 'WhatsApp could not send this reminder.',
    };
  }
}

async function logReminder(
  orgId: string,
  userId: string,
  customerId: string,
  sent: boolean,
  detail: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId,
      userId,
      action: sent ? 'WHATSAPP_REMINDER_SENT' : 'WHATSAPP_REMINDER_FAILED',
      entityType: 'Customer',
      entityId: customerId,
      metadata: { detail: detail.slice(0, 500) },
    },
  });
}

function addBucket(buckets: BucketCents, age: number, cents: number): void {
  if (age <= 30) {
    buckets.current += cents;
    return;
  }
  if (age <= 60) {
    buckets.days31to60 += cents;
    return;
  }
  if (age <= 90) {
    buckets.days61to90 += cents;
    return;
  }
  buckets.days90plus += cents;
}

function statusFor(buckets: BucketCents): AgingRow['status'] {
  if (buckets.days61to90 > 0 || buckets.days90plus > 0) {
    return 'OVERDUE';
  }
  if (buckets.days31to60 > 0) {
    return 'DAYS_31_60';
  }
  return 'CURRENT';
}

function statusLabel(status: AgingRow['status']): string {
  if (status === 'CURRENT') {
    return 'Current';
  }
  if (status === 'DAYS_31_60') {
    return '31-60 days';
  }
  return 'Overdue';
}

function ageDays(issuedAt: Date, now: Date): number {
  return Math.max(0, Math.round((utcDay(now) - utcDay(issuedAt)) / DAY_MS));
}

function utcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatAmount(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toCents(value: { toFixed: (digits: number) => string }): number {
  return Math.round(Number(value.toFixed(2)) * 100);
}

function moneyToNumber(value: string): number {
  return Number(value);
}

async function creditTotals(orgId: string): Promise<{ billed: number; received: number }> {
  const invoices = await prisma.invoice.findMany({
    where: { orgId, status: 'CREDIT', cancelledAt: null },
    select: { total: true, payments: { select: { amount: true } } },
  });
  let billed = 0;
  let received = 0;
  for (const invoice of invoices) {
    const total = toCents(invoice.total);
    const paid = invoice.payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
    billed += total;
    received += Math.min(paid, total);
  }
  return { billed, received };
}

function requiredRetailerOrgId(auth: AuthSessionUser): string {
  if (!auth.orgId || auth.orgType !== 'RETAILER') {
    throw new AppError(403, 'FORBIDDEN', 'This action is only available to a retailer');
  }
  return auth.orgId;
}
