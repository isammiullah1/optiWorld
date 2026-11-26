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
import { isShopOwner, requiredShopOrgId } from '../lib/shop-org.js';
import { styleSheet } from '../lib/sheet-table.js';
import { pdfWhen, renderTablePdf } from '../lib/text-pdf.js';
import { getCustomerReport } from './customer-report.js';
import { getAgingReport } from './ledger.service.js';
import { labExpenseByInvoice } from './lab-bills.service.js';
import { invoiceActivityMap } from './record-activity.js';
import {
  addCustomerSheets,
  addInventorySheets,
  addSalesSheets,
  customerPdfTables,
  inventoryPdfTables,
  salesPdfTables,
} from './report-sheets.js';
import {
  salesSections,
  type ReturnSectionInput,
  type SaleSectionInput,
} from './sales-breakdown.js';

export { getCustomerReport };

const DAY_MS = 86_400_000;
// A missing review note is a normal bill. `not` alone drops those rows in SQL.
const excludeOpeningCredit = {
  OR: [{ reviewReason: null }, { reviewReason: { not: 'Opening credit' } }],
} as const;
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
      ...excludeOpeningCredit,
    },
    select: {
      id: true,
      invoiceNumber: true,
      status: true,
      paymentType: true,
      total: true,
      discount: true,
      issuedAt: true,
      customer: { select: { id: true, name: true, gender: true } },
      payments: { select: { amount: true } },
      cancelledAt: true,
      items: {
        select: {
          productName: true,
          quantity: true,
          unitPrice: true,
          prescription: true,
          inventoryBatch: { select: { costPrice: true, category: true } },
        },
      },
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
  const removals = await loadRemovalNotes(
    orgId,
    invoices.map((invoice) => invoice.id),
  );

  let revenue = 0;
  let costIncurred = 0;
  let cash = 0;
  let credit = 0;
  const owner = isShopOwner(auth);
  const byDay = new Map<string, number>();
  const products = new Map<string, { quantity: number; total: number }>();
  const sectionBills: SaleSectionInput[] = [];
  for (const day of eachDay(range)) {
    byDay.set(day, 0);
  }
  const activeInvoices = invoices.filter((invoice) => invoice.cancelledAt === null);
  const activeIds = activeInvoices.map((invoice) => invoice.id);
  const [labExpense, cashiers, returns] = await Promise.all([
    owner
      ? labExpenseByInvoice(activeIds)
      : Promise.resolve(new Map<string, { issued: number; pending: number }>()),
    loadCashiers(orgId, activeIds),
    loadReturns(orgId, range),
  ]);
  let labIssued = 0;
  let labPending = 0;
  for (const value of labExpense.values()) {
    labIssued += value.issued;
    labPending += value.pending;
  }
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
    let lineCost = 0;
    let costMissing = false;
    const lines: SaleSectionInput['lines'] = [];
    for (const item of invoice.items) {
      const current = products.get(item.productName) ?? { quantity: 0, total: 0 };
      const lineSale = item.quantity * cents(item.unitPrice);
      current.quantity += item.quantity;
      current.total += lineSale;
      products.set(item.productName, current);
      const unitCost = item.inventoryBatch ? cents(item.inventoryBatch.costPrice) : 0;
      const knownCost = unitCost > 0 ? item.quantity * unitCost : null;
      if (knownCost === null) {
        costMissing = true;
      } else if (owner) {
        lineCost += knownCost;
        costIncurred += knownCost;
      }
      const category = item.inventoryBatch?.category.trim() ?? '';
      lines.push({
        productName: item.productName,
        category: category.length > 0 ? category : 'Uncategorised',
        quantity: item.quantity,
        sale: lineSale,
        cost: knownCost,
      });
    }
    const lab = labExpense.get(invoice.id) ?? { issued: 0, pending: 0 };
    sectionBills.push({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customer.name,
      day,
      paymentType: invoice.paymentType,
      total,
      discount: cents(invoice.discount),
      cash: cashPart,
      credit: creditPart,
      cost: lineCost,
      lab: lab.issued,
      costMissing,
      cashier: cashiers.get(invoice.id) ?? 'Unknown',
      lines,
    });
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
    costIncurred: owner ? centsToMoney(costIncurred) : null,
    labExpense: owner ? centsToMoney(labIssued) : null,
    labExpensePending: owner ? centsToMoney(labPending) : null,
    profit: owner ? centsToMoney(revenue - costIncurred - labIssued) : null,
    profitRows: activeInvoices.map((invoice) => {
      let lineCost = 0;
      let costMissing = false;
      for (const item of invoice.items) {
        const unitCost = item.inventoryBatch ? cents(item.inventoryBatch.costPrice) : 0;
        if (unitCost > 0) {
          lineCost += item.quantity * unitCost;
        } else {
          costMissing = true;
        }
      }
      const sale = cents(invoice.total);
      const lab = labExpense.get(invoice.id) ?? { issued: 0, pending: 0 };
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customer.name,
        products: [...new Set(invoice.items.map((item) => item.productName))].join(', '),
        sale: centsToMoney(sale),
        cost: owner ? centsToMoney(lineCost) : null,
        profit: owner ? centsToMoney(sale - lineCost - lab.issued) : null,
        costMissing: owner ? costMissing : false,
        labPending: owner ? lab.pending > 0 : false,
      };
    }),
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
      removed: removals.has(invoice.id),
      removalReason: removals.get(invoice.id)?.reason ?? null,
      removedBy: removals.get(invoice.id)?.by ?? null,
      issuedAt: invoice.issuedAt.toISOString(),
      activity: activity.get(invoice.id) ?? [],
    })),
    ...salesSections(owner, sectionBills, returns),
  };
}

export async function getInventoryReport(
  auth: AuthSessionUser,
  from: string,
  to: string,
  quietDays = 60,
): Promise<InventoryReport> {
  if (!isShopOwner(auth)) {
    throw new AppError(403, 'FORBIDDEN', 'Stock movement is visible to the owner');
  }
  const orgId = requiredRetailerOrgId(auth);
  const range = parseRange(from, to);
  const quiet = Math.min(365, Math.max(1, Math.trunc(quietDays)));
  const quietStart = new Date(range.end.getTime() - quiet * DAY_MS);
  const [batches, sales, lowStockAlerts, movements, recentSales, lastSales] = await Promise.all([
    prisma.inventoryBatch.findMany({
      where: { orgId, deletedAt: null },
      select: {
        id: true,
        productName: true,
        priceCode: true,
        salePrice: true,
        costPrice: true,
        stockQty: true,
        lowStockThreshold: true,
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
          ...excludeOpeningCredit,
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
    prisma.stockMovement.findMany({
      where: { orgId, createdAt: { gte: range.start, lt: range.end } },
      select: {
        id: true,
        type: true,
        quantityChange: true,
        balanceAfter: true,
        note: true,
        createdAt: true,
        createdByUserId: true,
        batch: { select: { productName: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.stockMovement.findMany({
      where: { orgId, type: 'SALE', createdAt: { gte: quietStart, lt: range.end } },
      select: { batchId: true },
      distinct: ['batchId'],
    }),
    prisma.stockMovement.groupBy({
      by: ['batchId'],
      where: { orgId, type: 'SALE' },
      _max: { createdAt: true },
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

  const userIds = [
    ...new Set(movements.flatMap((row) => (row.createdByUserId ? [row.createdByUserId] : []))),
  ];
  const users =
    userIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: userIds }, orgId },
          select: { id: true, name: true },
        });
  const userNames = new Map(users.map((user) => [user.id, user.name]));
  const soldRecently = new Set(recentSales.map((row) => row.batchId));
  const lastSaleAt = new Map(
    lastSales.flatMap((row) =>
      row._max.createdAt ? [[row.batchId, row._max.createdAt] as const] : [],
    ),
  );
  let stockCost = 0;
  let stockSale = 0;
  let missingCost = 0;
  const valuation: InventoryReport['valuation'] = [];
  const reorder: InventoryReport['reorder'] = [];
  const deadStock: InventoryReport['deadStock'] = [];
  for (const batch of batches) {
    if (batch.stockQty > 0) {
      const costCents = unitCost.get(batch.id) ?? 0;
      const lineSale = batch.stockQty * (listedPrice.get(batch.id) ?? 0);
      stockSale += lineSale;
      const costMissing = costCents <= 0;
      if (costMissing) {
        missingCost += 1;
      } else {
        stockCost += batch.stockQty * costCents;
      }
      valuation.push({
        batchId: batch.id,
        productName: batch.productName,
        priceCode: batch.priceCode,
        quantity: batch.stockQty,
        costValue: costMissing ? null : centsToMoney(batch.stockQty * costCents),
        saleValue: centsToMoney(lineSale),
        costMissing,
      });
      if (!soldRecently.has(batch.id)) {
        const last = lastSaleAt.get(batch.id) ?? null;
        deadStock.push({
          batchId: batch.id,
          productName: batch.productName,
          priceCode: batch.priceCode,
          quantity: batch.stockQty,
          lastSaleAt: last ? last.toISOString() : null,
        });
      }
    }
    if (batch.stockQty <= batch.lowStockThreshold) {
      reorder.push({
        batchId: batch.id,
        productName: batch.productName,
        priceCode: batch.priceCode,
        quantity: batch.stockQty,
        threshold: batch.lowStockThreshold,
        reorder: Math.max(0, batch.lowStockThreshold - batch.stockQty),
      });
    }
  }
  deadStock.sort(
    (left, right) =>
      right.quantity - left.quantity || left.productName.localeCompare(right.productName),
  );
  reorder.sort(
    (left, right) =>
      right.reorder - left.reorder || left.productName.localeCompare(right.productName),
  );

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
    stockValue: {
      cost: centsToMoney(stockCost),
      sale: centsToMoney(stockSale),
      missingCost,
    },
    valuation,
    reorder,
    ledger: movements.map((row) => ({
      id: row.id,
      at: row.createdAt.toISOString(),
      productName: row.batch.productName,
      kind: movementKind(row.type),
      quantity: row.quantityChange,
      balance: row.balanceAfter,
      note: row.note,
      by: row.createdByUserId ? (userNames.get(row.createdByUserId) ?? null) : null,
    })),
    deadStock,
    quietDays: quiet,
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
  reportType: 'SALES' | 'INVENTORY' | 'CREDIT' | 'CUSTOMERS',
  from: string,
  to: string,
  quietDays = 60,
): Promise<{ filename: string; body: Buffer }> {
  const workbook = new ExcelJS.Workbook();
  if (reportType === 'SALES') {
    const report = await getSalesReport(auth, from, to);
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Item', key: 'item', width: 28 },
      { header: 'Value', key: 'value', width: 24 },
    ];
    summary.addRows([
      { item: 'From', value: report.from },
      { item: 'To', value: report.to },
      { item: 'Total sale', value: report.revenue },
      ...(report.costIncurred ? [{ item: 'Total cost incurred', value: report.costIncurred }] : []),
      ...(report.labExpense ? [{ item: 'Lab expense', value: report.labExpense }] : []),
      ...(report.profit ? [{ item: 'Profit gained', value: report.profit }] : []),
      { item: 'Invoices', value: report.invoiceCount },
      { item: 'Average bill', value: report.averageValue },
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
    addSalesSheets(workbook, report);
    return { filename: 'sales-report.xlsx', body: await workbookBuffer(workbook) };
  }
  if (reportType === 'INVENTORY') {
    const report = await getInventoryReport(auth, from, to, quietDays);
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
      { item: 'Stock at cost', value: report.stockValue.cost },
      { item: 'Stock at sale price', value: report.stockValue.sale },
      { item: 'Dead stock', value: report.deadStock.length },
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
    addInventorySheets(workbook, report);
    return { filename: 'inventory-report.xlsx', body: await workbookBuffer(workbook) };
  }
  if (reportType === 'CUSTOMERS') {
    const report = await getCustomerReport(auth, from, to);
    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Item', key: 'item', width: 28 },
      { header: 'Value', key: 'value', width: 24 },
    ];
    summary.addRows([
      { item: 'From', value: report.from },
      { item: 'To', value: report.to },
      { item: 'New customers', value: report.acquired.newCount },
      { item: 'New customer sale', value: report.acquired.newSale },
      { item: 'Returning customers', value: report.acquired.returningCount },
      { item: 'Returning sale', value: report.acquired.returningSale },
    ]);
    addCustomerSheets(workbook, report);
    return { filename: 'customers-report.xlsx', body: await workbookBuffer(workbook) };
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
  reportType: 'SALES' | 'INVENTORY' | 'CREDIT' | 'CUSTOMERS',
  from: string,
  to: string,
  quietDays = 60,
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
              ['Total sale', report.revenue],
              ...(report.costIncurred ? [['Total cost incurred', report.costIncurred]] : []),
              ...(report.labExpense ? [['Lab expense', report.labExpense]] : []),
              ...(report.profit ? [['Profit gained', report.profit]] : []),
              ['Invoices', String(report.invoiceCount)],
              ['Average bill', report.averageValue],
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
          ...salesPdfTables(report),
        ],
      }),
    };
  }
  if (reportType === 'INVENTORY') {
    const report = await getInventoryReport(auth, from, to, quietDays);
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
              ['Stock at cost', report.stockValue.cost],
              ['Stock at sale price', report.stockValue.sale],
              ['Dead stock', String(report.deadStock.length)],
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
          ...inventoryPdfTables(report),
        ],
      }),
    };
  }
  if (reportType === 'CUSTOMERS') {
    const report = await getCustomerReport(auth, from, to);
    return {
      filename: 'customers-report.pdf',
      body: renderTablePdf({
        title: 'OptiWorld customers',
        landscape: true,
        tables: [
          {
            heading: 'Summary',
            columns: ['Item', 'Value'],
            widths: [1.4, 1],
            rows: [
              ['From', report.from],
              ['To', report.to],
              ['New customers', String(report.acquired.newCount)],
              ['New customer sale', report.acquired.newSale],
              ['Returning customers', String(report.acquired.returningCount)],
              ['Returning sale', report.acquired.returningSale],
            ],
          },
          ...customerPdfTables(report),
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

async function loadCashiers(orgId: string, ids: readonly string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) {
    return names;
  }
  const logs = await prisma.auditLog.findMany({
    where: {
      orgId,
      entityType: 'Invoice',
      entityId: { in: [...ids] },
      action: 'POS_INVOICE_CREATED',
    },
    orderBy: { createdAt: 'asc' },
    select: { entityId: true, user: { select: { name: true } } },
  });
  for (const log of logs) {
    if (!names.has(log.entityId)) {
      names.set(log.entityId, log.user?.name ?? 'Unknown');
    }
  }
  return names;
}

async function loadReturns(orgId: string, range: Range): Promise<ReturnSectionInput[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      orgId,
      cancelledAt: { gte: range.start, lt: range.end },
      ...excludeOpeningCredit,
    },
    select: {
      id: true,
      invoiceNumber: true,
      total: true,
      customer: { select: { name: true } },
    },
    orderBy: { invoiceNumber: 'desc' },
  });
  if (invoices.length === 0) {
    return [];
  }
  const logs = await prisma.auditLog.findMany({
    where: {
      orgId,
      entityType: 'Invoice',
      entityId: { in: invoices.map((invoice) => invoice.id) },
      action: { in: ['INVOICE_REMOVED', 'INVOICE_CANCELLED'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { entityId: true, action: true, metadata: true, user: { select: { name: true } } },
  });
  const notes = new Map<string, Pick<ReturnSectionInput, 'kind' | 'reason' | 'by'>>();
  for (const log of logs) {
    const kind = log.action === 'INVOICE_REMOVED' ? 'REMOVED' : 'CANCELLED';
    const current = notes.get(log.entityId);
    if (current?.kind === 'REMOVED' || (current && kind !== 'REMOVED')) {
      continue;
    }
    notes.set(log.entityId, {
      kind,
      reason: reasonFromMetadata(log.metadata),
      by: log.user?.name ?? null,
    });
  }
  return invoices.map((invoice) => {
    const detail = notes.get(invoice.id);
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customer.name,
      amount: cents(invoice.total),
      reason: detail?.reason ?? null,
      by: detail?.by ?? null,
      kind: detail?.kind ?? 'CANCELLED',
    };
  });
}

function movementKind(type: string): 'In' | 'Out' | 'Adjustment' {
  if (type === 'SALE') {
    return 'Out';
  }
  if (type === 'RECEIVED' || type === 'OPENING') {
    return 'In';
  }
  return 'Adjustment';
}

async function loadRemovalNotes(
  orgId: string,
  ids: readonly string[],
): Promise<Map<string, { reason: string | null; by: string | null }>> {
  const notes = new Map<string, { reason: string | null; by: string | null }>();
  if (ids.length === 0) {
    return notes;
  }
  const logs = await prisma.auditLog.findMany({
    where: {
      orgId,
      entityType: 'Invoice',
      entityId: { in: [...ids] },
      action: 'INVOICE_REMOVED',
    },
    orderBy: { createdAt: 'desc' },
    select: { entityId: true, metadata: true, user: { select: { name: true } } },
  });
  for (const log of logs) {
    if (notes.has(log.entityId)) {
      continue;
    }
    notes.set(log.entityId, {
      reason: reasonFromMetadata(log.metadata),
      by: log.user?.name ?? null,
    });
  }
  return notes;
}

function reasonFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null || !('reason' in metadata)) {
    return null;
  }
  const reason = metadata.reason;
  return typeof reason === 'string' && reason.trim().length > 0 ? reason : null;
}

function requiredRetailerOrgId(auth: AuthSessionUser): string {
  return requiredShopOrgId(auth);
}

function requireOwner(auth: AuthSessionUser): void {
  if (!isShopOwner(auth)) {
    throw new AppError(403, 'FORBIDDEN', 'Outstanding credit is visible to the owner');
  }
}
