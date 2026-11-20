import type ExcelJS from 'exceljs';
import type { CustomerReport, InventoryReport, SalesReport } from '@optiworld/shared';

import type { PdfTable } from '../lib/text-pdf.js';
import { pdfWhen } from '../lib/text-pdf.js';

export function addSalesSheets(workbook: ExcelJS.Workbook, report: SalesReport): void {
  addSheet(
    workbook,
    'Daily',
    [
      'Date',
      'Bills',
      'Sale',
      'Discount',
      'Cash',
      'Credit',
      'Cost',
      'Lab expense',
      'Profit',
      'Margin %',
    ],
    report.dailySummary.map((row) => [
      row.date,
      String(row.invoiceCount),
      row.sale,
      row.discount,
      row.cash,
      row.credit,
      costText(row.cost, row.costMissing),
      row.labExpense ?? '',
      row.profit ?? '',
      marginText(row.margin),
    ]),
  );
  addSheet(
    workbook,
    'Products',
    ['Product', 'Category', 'Quantity', 'Sale', 'Discount', 'Cost', 'Profit', 'Margin %'],
    report.byProduct.map((row) => [
      row.productName,
      row.category,
      String(row.quantity),
      row.sale,
      row.discount,
      costText(row.cost, row.costMissing),
      row.profit ?? '',
      marginText(row.margin),
    ]),
  );
  addSheet(
    workbook,
    'Categories',
    ['Category', 'Quantity', 'Sale', 'Discount', 'Cost', 'Profit', 'Margin %'],
    report.byCategory.map((row) => [
      row.category,
      String(row.quantity),
      row.sale,
      row.discount,
      costText(row.cost, row.costMissing),
      row.profit ?? '',
      marginText(row.margin),
    ]),
  );
  addSheet(
    workbook,
    'Payments',
    ['Payment', 'Bills', 'Sale'],
    report.byPayment.map((row) => [row.label, String(row.invoiceCount), row.sale]),
  );
  addSheet(
    workbook,
    'Cashiers',
    ['Cashier', 'Bills', 'Sale'],
    report.byCashier.map((row) => [row.name, String(row.invoiceCount), row.sale]),
  );
  addSheet(
    workbook,
    'Discounts',
    ['Invoice', 'Customer', 'Discount', 'Total'],
    report.discounts.map((row) => [
      String(row.invoiceNumber),
      row.customerName,
      row.discount,
      row.total,
    ]),
  );
  addSheet(
    workbook,
    'Returns',
    ['Invoice', 'Customer', 'Status', 'Return', 'Reason', 'By'],
    report.returns.map((row) => [
      String(row.invoiceNumber),
      row.customerName,
      row.kind === 'REMOVED' ? 'Removed' : 'Cancelled',
      row.amount,
      row.reason ?? '',
      row.by ?? '',
    ]),
  );
}

export function salesPdfTables(report: SalesReport): PdfTable[] {
  return [
    {
      heading: 'Daily summary',
      columns: ['Date', 'Bills', 'Sale', 'Discount', 'Cash', 'Credit', 'Profit', 'Margin %'],
      widths: [1, 0.6, 0.9, 0.8, 0.8, 0.8, 0.9, 0.7],
      empty: 'No sales in this range.',
      rows: report.dailySummary.map((row) => [
        row.date,
        String(row.invoiceCount),
        row.sale,
        row.discount,
        row.cash,
        row.credit,
        row.profit ?? '',
        marginText(row.margin),
      ]),
    },
    {
      heading: 'By product',
      columns: ['Product', 'Category', 'Qty', 'Sale', 'Discount', 'Profit', 'Margin %'],
      widths: [1.6, 1.1, 0.5, 0.8, 0.8, 0.8, 0.7],
      empty: 'No products sold in this range.',
      rows: report.byProduct.map((row) => [
        row.productName,
        row.category,
        String(row.quantity),
        row.sale,
        row.discount,
        row.profit ?? '',
        marginText(row.margin),
      ]),
    },
    {
      heading: 'By category',
      columns: ['Category', 'Qty', 'Sale', 'Discount', 'Profit', 'Margin %'],
      widths: [1.6, 0.6, 1, 1, 1, 0.8],
      empty: 'No categories in this range.',
      rows: report.byCategory.map((row) => [
        row.category,
        String(row.quantity),
        row.sale,
        row.discount,
        row.profit ?? '',
        marginText(row.margin),
      ]),
    },
    {
      heading: 'By payment',
      columns: ['Payment', 'Bills', 'Sale'],
      widths: [1.4, 0.8, 1],
      rows: report.byPayment.map((row) => [row.label, String(row.invoiceCount), row.sale]),
    },
    {
      heading: 'By cashier',
      columns: ['Cashier', 'Bills', 'Sale'],
      widths: [1.6, 0.8, 1],
      empty: 'No cashier is recorded for these bills.',
      rows: report.byCashier.map((row) => [row.name, String(row.invoiceCount), row.sale]),
    },
    {
      heading: 'Discounts',
      columns: ['Invoice', 'Customer', 'Discount', 'Total'],
      widths: [0.8, 1.8, 1, 1],
      empty: 'No discounts in this range.',
      rows: report.discounts.map((row) => [
        String(row.invoiceNumber),
        row.customerName,
        row.discount,
        row.total,
      ]),
    },
    {
      heading: 'Returns',
      columns: ['Invoice', 'Customer', 'Status', 'Return', 'Reason', 'By'],
      widths: [0.7, 1.4, 0.9, 0.8, 1.4, 1],
      empty: 'No cancelled or removed bills in this range.',
      rows: report.returns.map((row) => [
        String(row.invoiceNumber),
        row.customerName,
        row.kind === 'REMOVED' ? 'Removed' : 'Cancelled',
        row.amount,
        row.reason ?? '',
        row.by ?? '',
      ]),
    },
  ];
}

export function addInventorySheets(workbook: ExcelJS.Workbook, report: InventoryReport): void {
  addSheet(
    workbook,
    'Valuation',
    ['Product', 'Product code', 'Quantity', 'Cost value', 'Sale value'],
    report.valuation.map((row) => [
      row.productName,
      row.priceCode,
      String(row.quantity),
      row.costMissing ? 'No cost price' : (row.costValue ?? ''),
      row.saleValue,
    ]),
  );
  addSheet(
    workbook,
    'Reorder',
    ['Product', 'Product code', 'Quantity', 'Threshold', 'Reorder'],
    report.reorder.map((row) => [
      row.productName,
      row.priceCode,
      String(row.quantity),
      String(row.threshold),
      String(row.reorder),
    ]),
  );
  addSheet(
    workbook,
    'Movement',
    ['When', 'Product', 'Kind', 'Quantity', 'Balance', 'Reason', 'By'],
    report.ledger.map((row) => [
      pdfWhen(row.at),
      row.productName,
      row.kind,
      String(row.quantity),
      String(row.balance),
      row.note ?? '',
      row.by ?? '',
    ]),
  );
  addSheet(
    workbook,
    'Dead stock',
    ['Product', 'Product code', 'Quantity', 'Last sale'],
    report.deadStock.map((row) => [
      row.productName,
      row.priceCode,
      String(row.quantity),
      row.lastSaleAt ? pdfWhen(row.lastSaleAt) : 'Never',
    ]),
  );
}

export function inventoryPdfTables(report: InventoryReport): PdfTable[] {
  return [
    {
      heading: 'Stock valuation',
      columns: ['Product', 'Code', 'Qty', 'Cost value', 'Sale value'],
      widths: [2, 1, 0.7, 1.1, 1.1],
      empty: 'No stock on hand.',
      rows: report.valuation.map((row) => [
        row.productName,
        row.priceCode,
        String(row.quantity),
        row.costMissing ? 'No cost price' : (row.costValue ?? ''),
        row.saleValue,
      ]),
    },
    {
      heading: 'Low stock and reorder',
      columns: ['Product', 'Code', 'Qty', 'Threshold', 'Reorder'],
      widths: [2, 1.1, 0.7, 1, 0.9],
      empty: 'No product is at or under its threshold.',
      rows: report.reorder.map((row) => [
        row.productName,
        row.priceCode,
        String(row.quantity),
        String(row.threshold),
        String(row.reorder),
      ]),
    },
    {
      heading: 'Movement ledger',
      columns: ['When', 'Product', 'Kind', 'Qty', 'Balance', 'Reason', 'By'],
      widths: [1.3, 1.6, 0.9, 0.6, 0.7, 1.3, 1],
      empty: 'No stock movement in this range.',
      rows: report.ledger.map((row) => [
        pdfWhen(row.at),
        row.productName,
        row.kind,
        String(row.quantity),
        String(row.balance),
        row.note ?? '',
        row.by ?? '',
      ]),
    },
    {
      heading: `Dead stock (${report.quietDays} quiet days)`,
      columns: ['Product', 'Code', 'Qty', 'Last sale'],
      widths: [2, 1.2, 0.7, 1.4],
      empty: 'No stock has been this quiet.',
      rows: report.deadStock.map((row) => [
        row.productName,
        row.priceCode,
        String(row.quantity),
        row.lastSaleAt ? pdfWhen(row.lastSaleAt) : 'Never',
      ]),
    },
  ];
}

export function addCustomerSheets(workbook: ExcelJS.Workbook, report: CustomerReport): void {
  addSheet(
    workbook,
    'Top customers',
    ['Customer', 'Bills', 'Sale', 'Outstanding'],
    report.top.map((row) => [
      row.customerName,
      String(row.invoiceCount),
      row.sale,
      row.outstanding ?? '',
    ]),
  );
  addSheet(
    workbook,
    'New customers',
    ['Customer', 'Bills', 'Sale', 'Outstanding'],
    report.acquired.newCustomers.map((row) => [
      row.customerName,
      String(row.invoiceCount),
      row.sale,
      row.outstanding ?? '',
    ]),
  );
  addSheet(
    workbook,
    'Returning',
    ['Customer', 'Bills', 'Sale', 'Outstanding'],
    report.acquired.returningCustomers.map((row) => [
      row.customerName,
      String(row.invoiceCount),
      row.sale,
      row.outstanding ?? '',
    ]),
  );
  if (report.outstanding) {
    addSheet(
      workbook,
      'Outstanding',
      ['Customer', 'Current', '31-60', '61-90', '90+', 'Outstanding', 'Status'],
      report.outstanding.rows.map((row) => [
        row.customerName,
        row.current,
        row.days31to60,
        row.days61to90,
        row.days90plus,
        row.total,
        agingStatus(row.status),
      ]),
    );
  }
  addSheet(
    workbook,
    'Inactive',
    ['Customer', 'Last visit', 'Outstanding'],
    report.inactive.map((row) => [
      row.customerName,
      row.lastVisit ? pdfWhen(row.lastVisit) : 'Never',
      row.outstanding ?? '',
    ]),
  );
}

export function customerPdfTables(report: CustomerReport): PdfTable[] {
  const tables: PdfTable[] = [
    {
      heading: 'Top customers',
      columns: ['Customer', 'Bills', 'Sale', 'Outstanding'],
      widths: [2, 0.7, 1, 1.1],
      empty: 'No customers bought in this range.',
      rows: report.top.map((row) => [
        row.customerName,
        String(row.invoiceCount),
        row.sale,
        row.outstanding ?? '',
      ]),
    },
    {
      heading: 'New customers',
      columns: ['Customer', 'Bills', 'Sale'],
      widths: [2, 0.8, 1],
      empty: 'No new customers in this range.',
      rows: report.acquired.newCustomers.map((row) => [
        row.customerName,
        String(row.invoiceCount),
        row.sale,
      ]),
    },
    {
      heading: 'Returning customers',
      columns: ['Customer', 'Bills', 'Sale'],
      widths: [2, 0.8, 1],
      empty: 'No returning customers in this range.',
      rows: report.acquired.returningCustomers.map((row) => [
        row.customerName,
        String(row.invoiceCount),
        row.sale,
      ]),
    },
  ];
  if (report.outstanding) {
    tables.push({
      heading: 'Outstanding balances',
      columns: ['Customer', 'Current', '31-60', '61-90', '90+', 'Outstanding', 'Status'],
      widths: [1.6, 0.9, 0.8, 0.8, 0.8, 1, 0.9],
      empty: 'No outstanding balances.',
      rows: report.outstanding.rows.map((row) => [
        row.customerName,
        row.current,
        row.days31to60,
        row.days61to90,
        row.days90plus,
        row.total,
        agingStatus(row.status),
      ]),
    });
  }
  tables.push({
    heading: 'Inactive customers',
    columns: ['Customer', 'Last visit', 'Outstanding'],
    widths: [2, 1.3, 1.1],
    empty: 'No inactive customers.',
    rows: report.inactive.map((row) => [
      row.customerName,
      row.lastVisit ? pdfWhen(row.lastVisit) : 'Never',
      row.outstanding ?? '',
    ]),
  });
  return tables;
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: string[][],
): void {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = headers.map((header) => ({ header, key: header, width: 18 }));
  for (const row of rows) {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    sheet.addRow(record);
  }
}

function costText(value: string | null, missing: boolean): string {
  if (value === null) {
    return '';
  }
  return missing ? `${value} (no cost price)` : value;
}

function marginText(value: string | null): string {
  return value ?? '';
}

function agingStatus(status: 'CURRENT' | 'DAYS_31_60' | 'OVERDUE'): string {
  if (status === 'OVERDUE') {
    return 'Overdue';
  }
  if (status === 'DAYS_31_60') {
    return '31-60 days';
  }
  return 'Current';
}
