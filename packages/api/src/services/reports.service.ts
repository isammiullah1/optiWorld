import ExcelJS from 'exceljs';
import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  moneyToCents,
  type AuthSessionUser,
  type CreditReport,
  type CreditRisk,
  type InventoryReport,
  type SalesReport,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { styleSheet } from '../lib/sheet-table.js';
import { pdfWhen, renderTablePdf } from '../lib/text-pdf.js';
import { getAgingReport } from './ledger.service.js';
import { invoiceActivityMap } from './record-activity.js';

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;
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

type Range = { from: string; to: string; start: Date; end: Date };

export async function getSalesReport(
  auth: AuthSessionUser,
  from: string,
  to: string,
): Promise<SalesReport> {
  const orgId = requiredRetailerOrgId(auth);
  const range = parseRange(from, to);
  const invoices = await prisma.invoice.findMany({
    where: {
      orgId,
      issuedAt: { gte: range.start, lt: range.end },
      NOT: { reviewReason: 'Opening credit' },
    },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      paymentType: true,
      total: true,
      issuedAt: true,
      customer: { select: { id: true, name: true, gender: true } },
      payments: { select: { amount: true } },
      cancelledAt: true,
      items: { select: { productName: true, quantity: true, unitPrice: true, prescription: true } },
    },
    orderBy: { issuedAt: 'desc' },
  });
  const activity = await invoiceActivityMap(
    orgId,
    invoices.map((invoice) => invoice.id),
    new Map(
      invoices.map((invoice) => [
        invoice.id,
        invoice.items.map((item) => `${item.productName} × ${item.quantity}`),
      ]),
    ),
  );

  let revenue = 0;
  let cash = 0;
  let credit = 0;
  const byDay = new Map<string, number>();
  const products = new Map<string, { quantity: number; total: number }>();
  for (const day of eachDay(range)) {
    byDay.set(day, 0);
  }
  const activeInvoices = invoices.filter((invoice) => invoice.cancelledAt === null);
  for (const invoice of activeInvoices) {
    const total = cents(invoice.total);
    const paid = invoice.payments.reduce((sum, payment) => sum + cents(payment.amount), 0);
    const onCredit = invoice.paymentType === 'CREDIT' || invoice.status === 'CREDIT';
    const creditPart = onCredit ? Math.max(0, total - Math.min(paid, total)) : 0;
    const cashPart = total - creditPart;
    revenue += cashPart + creditPart;
    cash += cashPart;
    credit += creditPart;
    const day = invoice.issuedAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + total);
    for (const item of invoice.items) {
      const current = products.get(item.productName) ?? { quantity: 0, total: 0 };
      current.quantity += item.quantity;
      current.total += item.quantity * cents(item.unitPrice);
      products.set(item.productName, current);
    }
  }

  const topProducts = [...products.entries()]
    .map(([productName, value]) => ({
      productName,
      quantity: value.quantity,
      total: centsToMoney(value.total),
      sort: value.total,
    }))
    .sort((a, b) => b.sort - a.sort || a.productName.localeCompare(b.productName))
    .slice(0, 8)
    .map(({ productName, quantity, total }) => ({ productName, quantity, total }));

  return {
    from: range.from,
    to: range.to,
    revenue: centsToMoney(revenue),
    invoiceCount: activeInvoices.length,
    averageValue: centsToMoney(
      activeInvoices.length === 0 ? 0 : Math.round(revenue / activeInvoices.length),
    ),
    cashTotal: centsToMoney(cash),
    creditTotal: centsToMoney(credit),
    daily: [...byDay.entries()].map(([date, total]) => ({ date, total: centsToMoney(total) })),
    topProducts,
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customer.id,
      customerName: invoice.customer.name,
      gender: invoice.customer.gender,
      products: [...new Set(invoice.items.map((item) => item.productName))],
      total: centsToMoney(cents(invoice.total)),
      outstanding: outstandingOf(invoice),
      paymentType: invoice.paymentType,
      status: invoice.status,
      hasPrescription: invoice.items.some((item) => item.prescription !== null),
      cancelled: invoice.cancelledAt !== null,
      issuedAt: invoice.issuedAt.toISOString(),
      activity: activity.get(invoice.id) ?? [],
    })),
  };
}

export async function getInventoryReport(
  auth: AuthSessionUser,
  from: string,
  to: string,
): Promise<InventoryReport> {
  if (auth.role !== 'OWNER') {
    throw new AppError(403, 'FORBIDDEN', 'Stock movement is visible to the owner');
  }
  const orgId = requiredRetailerOrgId(auth);
  const range = parseRange(from, to);
  const [batches, sales, lowStockAlerts] = await Promise.all([
    prisma.inventoryBatch.findMany({
      where: { orgId, deletedAt: null },
      select: {
        id: true,
        productName: true,
        priceCode: true,
        salePrice: true,
        costPrice: true,
        stockQty: true,
        stockMovements: {
          where: { createdAt: { gte: range.start } },
          select: { type: true, quantityChange: true, createdAt: true },
        },
      },
      orderBy: { productName: 'asc' },
    }),
    prisma.invoiceItem.findMany({
      where: {
        inventoryBatchId: { not: null },
        invoice: {
          orgId,
          cancelledAt: null,
          issuedAt: { gte: range.start, lt: range.end },
          NOT: { reviewReason: 'Opening credit' },
        },
      },
      select: { inventoryBatchId: true, quantity: true, stockShortfall: true, unitPrice: true },
    }),
    prisma.alert.findMany({
      where: { orgId, type: 'LOW_STOCK', createdAt: { gte: range.start, lt: range.end } },
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
        relatedEntityId: true,
        relatedEntityType: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  let itemsSold = 0;
  let unitsMoved = 0;
  const unitCost = new Map(
    batches.map((batch) => [batch.id, moneyToCents(batch.costPrice.toFixed(2))]),
  );
  const listedPrice = new Map(
    batches.map((batch) => [batch.id, moneyToCents(batch.salePrice.toFixed(2))]),
  );
  const billedProfit = new Map<string, number>();
  for (const line of sales) {
    if (!line.inventoryBatchId) {
      continue;
    }
    const soldUnits = Math.max(0, line.quantity - line.stockShortfall);
    const revenue = soldUnits * moneyToCents(line.unitPrice.toFixed(2));
    const cost = soldUnits * (unitCost.get(line.inventoryBatchId) ?? 0);
    billedProfit.set(
      line.inventoryBatchId,
      (billedProfit.get(line.inventoryBatchId) ?? 0) + revenue - cost,
    );
  }
  const rows = batches.map((batch) => {
    let changeFromStart = 0;
    let changeFromEnd = 0;
    let added = 0;
    let sold = 0;
    let units = 0;
    let hadSale = false;
    for (const movement of batch.stockMovements) {
      if (movement.createdAt >= range.end) {
        changeFromEnd += movement.quantityChange;
        changeFromStart += movement.quantityChange;
        continue;
      }
      changeFromStart += movement.quantityChange;
      const moved = Math.abs(movement.quantityChange);
      units += moved;
      unitsMoved += moved;
      if (movement.type === 'SALE') {
        sold += Math.abs(movement.quantityChange);
        hadSale = true;
      } else if (
        movement.quantityChange > 0 &&
        (movement.type === 'RECEIVED' ||
          movement.type === 'OPENING' ||
          movement.type === 'CORRECTION')
      ) {
        added += movement.quantityChange;
      }
    }
    if (hadSale) {
      itemsSold += 1;
    }
    return {
      batchId: batch.id,
      productName: batch.productName,
      priceCode: batch.priceCode,
      opening: batch.stockQty - changeFromStart,
      added,
      sold,
      profit: centsToMoney(
        billedProfit.has(batch.id)
          ? (billedProfit.get(batch.id) ?? 0)
          : sold * ((listedPrice.get(batch.id) ?? 0) - (unitCost.get(batch.id) ?? 0)),
      ),
      units,
      closing: batch.stockQty - changeFromEnd,
    };
  });

  return {
    from: range.from,
    to: range.to,
    itemsSold,
    unitsMoved,
    lowStockEvents: lowStockAlerts.length,
    lowStockItems: lowStockAlerts.map((alert) => ({
      id: alert.id,
      title: alert.title,
      body: alert.body,
      createdAt: alert.createdAt.toISOString(),
      batchId: alert.relatedEntityType === 'InventoryBatch' ? alert.relatedEntityId : null,
    })),
    rows,
  };
}

export async function getCreditReport(
  auth: AuthSessionUser,
  now = new Date(),
): Promise<CreditReport> {
  requireOwner(auth);
  const orgId = requiredRetailerOrgId(auth);
  const [aging, invoices] = await Promise.all([
    getAgingReport(auth, now),
    prisma.invoice.findMany({
      where: { orgId, status: 'CREDIT', cancelledAt: null },
      select: {
        issuedAt: true,
        total: true,
        status: true,
        payments: { select: { amount: true, recordedAt: true } },
      },
    }),
  ]);
  const months = monthEnds(now).map((point) => ({
    label: point.label,
    total: centsToMoney(outstandingAt(invoices, point.end)),
  }));
  return {
    months,
    rows: aging.rows.map((row) => ({
      customerId: row.customerId,
      customerName: row.customerName,
      total: row.total,
      risk: riskOf(row.days31to60, row.days61to90, row.days90plus),
    })),
  };
}

export async function exportReportWorkbook(
  auth: AuthSessionUser,
  reportType: 'SALES' | 'INVENTORY' | 'CREDIT',
  from: string,
  to: string,
): Promise<{ filename: string; body: Buffer }> {
  const workbook = new ExcelJS.Workbook();
  if (reportType === 'SALES') {
    const report = await getSalesReport(auth, from, to);
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Item', key: 'item', width: 22 },
      { header: 'Value', key: 'value', width: 24 },
    ];
    summary.addRows([
      { item: 'From', value: report.from },
      { item: 'To', value: report.to },
      { item: 'Revenue', value: report.revenue },
      { item: 'Invoices', value: report.invoiceCount },
      { item: 'Average value', value: report.averageValue },
      { item: 'Cash', value: report.cashTotal },
      { item: 'Credit', value: report.creditTotal },
    ]);
    const invoices = workbook.addWorksheet('Invoices');
    invoices.columns = [
      { header: 'Invoice', key: 'invoice', width: 12 },
      { header: 'Customer', key: 'customer', width: 28 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Payment', key: 'payment', width: 16 },
      { header: 'Total', key: 'total', width: 14 },
      { header: 'Issued', key: 'issued', width: 22 },
    ];
    for (const row of report.invoices) {
      invoices.addRow({
        invoice: row.invoiceNumber,
        customer: row.customerName,
        status: row.status,
        payment: row.paymentType,
        total: row.total,
        issued: row.issuedAt,
      });
    }
    return { filename: 'sales-report.xlsx', body: await workbookBuffer(workbook) };
  }
  if (reportType === 'INVENTORY') {
    const report = await getInventoryReport(auth, from, to);
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Item', key: 'item', width: 22 },
      { header: 'Value', key: 'value', width: 24 },
    ];
    summary.addRows([
      { item: 'From', value: report.from },
      { item: 'To', value: report.to },
      { item: 'Items sold', value: report.itemsSold },
      { item: 'Units moved', value: report.unitsMoved },
      { item: 'Low stock events', value: report.lowStockEvents },
    ]);
    const stock = workbook.addWorksheet('Stock');
    stock.columns = [
      { header: 'Product', key: 'product', width: 32 },
      { header: 'Product code', key: 'code', width: 16 },
      { header: 'Opening', key: 'opening', width: 12 },
      { header: 'Added', key: 'added', width: 12 },
      { header: 'Sold', key: 'sold', width: 12 },
      { header: 'Closing', key: 'closing', width: 12 },
    ];
    for (const row of report.rows) {
      stock.addRow({
        product: row.productName,
        code: row.priceCode,
        opening: row.opening,
        added: row.added,
        sold: row.sold,
        closing: row.closing,
      });
    }
    return { filename: 'inventory-report.xlsx', body: await workbookBuffer(workbook) };
  }
  requireOwner(auth);
  const report = await getCreditReport(auth);
  const trend = workbook.addWorksheet('Trend');
  trend.columns = [
    { header: 'Month', key: 'month', width: 12 },
    { header: 'Outstanding', key: 'total', width: 16 },
  ];
  for (const month of report.months) {
    trend.addRow({ month: month.label, total: month.total });
  }
  const customers = workbook.addWorksheet('Customers');
  customers.columns = [
    { header: 'Customer', key: 'customer', width: 28 },
    { header: 'Outstanding', key: 'total', width: 16 },
    { header: 'Risk', key: 'risk', width: 14 },
  ];
  for (const row of report.rows) {
    customers.addRow({ customer: row.customerName, total: row.total, risk: row.risk });
  }
  return { filename: 'credit-report.xlsx', body: await workbookBuffer(workbook) };
}

export async function exportReportPdf(
  auth: AuthSessionUser,
  reportType: 'SALES' | 'INVENTORY' | 'CREDIT',
  from: string,
  to: string,
): Promise<{ filename: string; body: Buffer }> {
  if (reportType === 'SALES') {
    const report = await getSalesReport(auth, from, to);
    return {
      filename: 'sales-report.pdf',
      body: renderTablePdf({
        title: 'OptiWorld sales',
        landscape: true,
        tables: [
          {
            heading: 'Summary',
            columns: ['Item', 'Value'],
            widths: [1, 1.4],
            rows: [
              ['From', report.from],
              ['To', report.to],
              ['Revenue', report.revenue],
              ['Invoices', String(report.invoiceCount)],
              ['Average value', report.averageValue],
              ['Cash', report.cashTotal],
              ['Credit', report.creditTotal],
            ],
          },
          {
            heading: 'Invoices',
            columns: ['Invoice', 'Customer', 'Status', 'Payment', 'Total', 'Issued'],
            widths: [0.7, 1.8, 0.9, 1, 0.9, 1.2],
            empty: 'No invoices in this range.',
            rows: report.invoices.map((row) => [
              String(row.invoiceNumber),
              row.customerName,
              row.status,
              row.paymentType,
              row.total,
              pdfWhen(row.issuedAt),
            ]),
          },
        ],
      }),
    };
  }
  if (reportType === 'INVENTORY') {
    const report = await getInventoryReport(auth, from, to);
    return {
      filename: 'inventory-report.pdf',
      body: renderTablePdf({
        title: 'OptiWorld inventory',
        landscape: true,
        tables: [
          {
            heading: 'Summary',
            columns: ['Item', 'Value'],
            widths: [1.2, 1],
            rows: [
              ['From', report.from],
              ['To', report.to],
              ['Items sold', String(report.itemsSold)],
              ['Units moved', String(report.unitsMoved)],
              ['Low stock events', String(report.lowStockEvents)],
            ],
          },
          {
            heading: 'Stock',
            columns: ['Product', 'Product code', 'Opening', 'Added', 'Sold', 'Closing'],
            widths: [2, 1.2, 0.8, 0.8, 0.8, 0.8],
            empty: 'No stock movement in this range.',
            rows: report.rows.map((row) => [
              row.productName,
              row.priceCode,
              String(row.opening),
              String(row.added),
              String(row.sold),
              String(row.closing),
            ]),
          },
        ],
      }),
    };
  }
  requireOwner(auth);
  const report = await getCreditReport(auth);
  return {
    filename: 'credit-report.pdf',
    body: renderTablePdf({
      title: 'OptiWorld outstanding credit',
      landscape: true,
      tables: [
        {
          heading: 'Trend',
          columns: ['Month', 'Outstanding'],
          widths: [1, 1],
          rows: report.months.map((month) => [month.label, month.total]),
          empty: 'No monthly outstanding.',
        },
        {
          heading: 'Customers',
          columns: ['Customer', 'Outstanding', 'Risk'],
          widths: [2, 1, 1],
          rows: report.rows.map((row) => [row.customerName, row.total, row.risk]),
          empty: 'No outstanding credit.',
        },
      ],
    }),
  };
}

function riskOf(days31to60: string, days61to90: string, days90plus: string): CreditRisk {
  if (Number(days90plus) > 0) {
    return 'severe';
  }
  if (Number(days61to90) > 0) {
    return 'overdue';
  }
  if (Number(days31to60) > 0) {
    return 'watch';
  }
  return 'current';
}

function outstandingAt(
  invoices: readonly {
    issuedAt: Date;
    total: { toFixed: (digits: number) => string };
    payments: readonly { amount: { toFixed: (digits: number) => string }; recordedAt: Date }[];
  }[],
  end: Date,
): number {
  let total = 0;
  for (const invoice of invoices) {
    if (invoice.issuedAt > end) {
      continue;
    }
    const paid = invoice.payments.reduce(
      (sum, payment) => (payment.recordedAt <= end ? sum + cents(payment.amount) : sum),
      0,
    );
    total += Math.max(0, cents(invoice.total) - paid);
  }
  return total;
}

function monthEnds(now: Date): { label: string; end: Date }[] {
  const points: { label: string; end: Date }[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() - offset;
    const end = offset === 0 ? now : new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    const label = MONTH_LABELS[end.getUTCMonth()] ?? '';
    points.push({ label, end });
  }
  return points;
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

function eachDay(range: Range): string[] {
  const days: string[] = [];
  for (let cursor = range.start.getTime(); cursor < range.end.getTime(); cursor += DAY_MS) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return days;
}

function outstandingOf(invoice: {
  status: 'PAID' | 'CREDIT';
  total: { toFixed: (digits: number) => string };
  payments: readonly { amount: { toFixed: (digits: number) => string } }[];
}): string {
  if (invoice.status !== 'CREDIT') {
    return '0.00';
  }
  const paid = invoice.payments.reduce((sum, payment) => sum + cents(payment.amount), 0);
  return centsToMoney(Math.max(0, cents(invoice.total) - paid));
}

function cents(value: { toFixed: (digits: number) => string }): number {
  return moneyToCents(value.toFixed(2));
}

async function workbookBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  for (const sheet of workbook.worksheets) {
    styleSheet(sheet);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function requiredRetailerOrgId(auth: AuthSessionUser): string {
  if (!auth.orgId || auth.orgType !== 'RETAILER') {
    throw new AppError(403, 'FORBIDDEN', 'This area is not available for your organisation');
  }
  return auth.orgId;
}

function requireOwner(auth: AuthSessionUser): void {
  if (auth.role !== 'OWNER') {
    throw new AppError(403, 'FORBIDDEN', 'Outstanding credit is visible to the owner');
  }
}
