import { prisma } from '@optiworld/db';
import type { AuthSessionUser, ImportResult, ImportRowError } from '@optiworld/shared';
import ExcelJS from 'exceljs';

import { AppError } from '../lib/errors.js';

const PREVIEW_ROWS = 5;
const MAX_ROWS = 500;

const TEMPLATES = {
  customers: ['Name', 'Phone', 'Email', 'Address', 'Credit Limit', 'Outstanding Balance'],
  inventory: [
    'Product Code',
    'Prefix',
    'Product Name',
    'Brand',
    'Category',
    'Sale Price',
    'Stock Qty',
    'Low Stock Threshold',
  ],
  dues: ['Customer Name', 'Customer Phone', 'Amount Due', 'Due Date', 'Notes'],
} as const;

export type ImportKind = keyof typeof TEMPLATES;

export async function workbookTemplate(kind: ImportKind): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.addRow([...TEMPLATES[kind]]);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function importWorkbook(
  auth: AuthSessionUser,
  kind: ImportKind,
  fileBase64: string,
  preview: boolean,
): Promise<ImportResult> {
  const orgId = requiredOrgId(auth);
  const table = await readTable(fileBase64, TEMPLATES[kind]);
  const errors: ImportRowError[] = [];
  let imported = 0;

  if (table.dataRows.length > MAX_ROWS) {
    throw new AppError(422, 'VALIDATION_ERROR', `Import up to ${MAX_ROWS} rows at a time`);
  }

  for (const entry of table.dataRows) {
    const outcome = parseRow(kind, entry.cells);
    if (!outcome.ok) {
      errors.push({ row: entry.rowNumber, message: outcome.message });
      continue;
    }
    if (preview) {
      continue;
    }
    const saved = await writeRow(orgId, kind, outcome.value);
    if (!saved.ok) {
      errors.push({ row: entry.rowNumber, message: saved.message });
      continue;
    }
    imported += 1;
  }

  return {
    preview,
    imported,
    columns: [...TEMPLATES[kind]],
    rows: table.dataRows.slice(0, PREVIEW_ROWS).map((entry) => entry.cells),
    errors,
  };
}

type Parsed =
  { ok: true; value: CustomerRow | InventoryRow | DueRow } | { ok: false; message: string };

type CustomerRow = {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: string;
  outstanding: string;
};

type InventoryRow = {
  priceCode: string;
  prefix: string;
  productName: string;
  brand: string | null;
  category: string;
  salePrice: string;
  stockQty: number;
  lowStockThreshold: number;
};

type DueRow = {
  name: string;
  phone: string | null;
  amount: string;
  dueDate: Date;
  notes: string | null;
};

function parseRow(kind: ImportKind, cells: string[]): Parsed {
  if (kind === 'customers') {
    return parseCustomer(cells);
  }
  if (kind === 'inventory') {
    return parseInventory(cells);
  }
  return parseDue(cells);
}

function parseCustomer(cells: string[]): Parsed {
  const name = cell(cells, 0);
  if (!name) {
    return { ok: false, message: 'Name is required' };
  }
  const email = cell(cells, 2);
  if (email && !email.includes('@')) {
    return { ok: false, message: 'Email is not valid' };
  }
  const credit = money(cell(cells, 4), '0.00');
  const outstanding = money(cell(cells, 5), '0.00');
  if (!credit.ok) {
    return { ok: false, message: 'Credit Limit must be a number' };
  }
  if (!outstanding.ok) {
    return { ok: false, message: 'Outstanding Balance must be a number' };
  }
  return {
    ok: true,
    value: {
      name,
      phone: cell(cells, 1) || null,
      email: email || null,
      address: cell(cells, 3) || null,
      creditLimit: credit.value,
      outstanding: outstanding.value,
    },
  };
}

function parseInventory(cells: string[]): Parsed {
  const priceCode = cell(cells, 0);
  const prefix = cell(cells, 1);
  const productName = cell(cells, 2);
  const category = cell(cells, 4);
  if (!priceCode || !prefix || !productName || !category) {
    return { ok: false, message: 'Product Code, Prefix, Product Name, and Category are required' };
  }
  const salePrice = money(cell(cells, 5), '');
  if (!salePrice.ok || salePrice.value === '') {
    return { ok: false, message: 'Sale Price must be a number' };
  }
  const stock = integer(cell(cells, 6), 0);
  const threshold = integer(cell(cells, 7), 5);
  if (!stock.ok || !threshold.ok) {
    return { ok: false, message: 'Stock Qty and Low Stock Threshold must be whole numbers' };
  }
  return {
    ok: true,
    value: {
      priceCode,
      prefix,
      productName,
      brand: cell(cells, 3) || null,
      category,
      salePrice: salePrice.value,
      stockQty: stock.value,
      lowStockThreshold: threshold.value,
    },
  };
}

function parseDue(cells: string[]): Parsed {
  const name = cell(cells, 0);
  if (!name) {
    return { ok: false, message: 'Customer Name is required' };
  }
  const amount = money(cell(cells, 2), '');
  if (!amount.ok || amount.value === '' || amount.value === '0.00') {
    return { ok: false, message: 'Amount Due must be greater than zero' };
  }
  const dueDate = parseDate(cell(cells, 3));
  if (!dueDate) {
    return { ok: false, message: 'Due Date is required' };
  }
  return {
    ok: true,
    value: {
      name,
      phone: cell(cells, 1) || null,
      amount: amount.value,
      dueDate,
      notes: cell(cells, 4) || null,
    },
  };
}

async function writeRow(
  orgId: string,
  kind: ImportKind,
  value: CustomerRow | InventoryRow | DueRow,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (kind === 'customers') {
    return writeCustomer(orgId, value as CustomerRow);
  }
  if (kind === 'inventory') {
    return writeInventory(orgId, value as InventoryRow);
  }
  return writeDue(orgId, value as DueRow);
}

async function writeCustomer(
  orgId: string,
  row: CustomerRow,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (row.phone) {
    const existing = await prisma.customer.findFirst({
      where: { orgId, phone: row.phone, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      return { ok: false, message: 'A customer with this phone already exists' };
    }
  }
  await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        orgId,
        name: row.name,
        phone: row.phone,
        email: row.email,
        address: row.address,
        creditLimit: row.creditLimit,
      },
    });
    if (row.outstanding !== '0.00') {
      await createCreditInvoice(
        tx,
        orgId,
        customer.id,
        row.outstanding,
        new Date(),
        'Opening balance',
      );
    }
  });
  return { ok: true };
}

async function writeInventory(
  orgId: string,
  row: InventoryRow,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const existing = await prisma.inventoryBatch.findFirst({
    where: { orgId, prefix: row.prefix, priceCode: row.priceCode, deletedAt: null },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, message: 'This product code already exists' };
  }
  await prisma.inventoryBatch.create({
    data: {
      orgId,
      priceCode: row.priceCode,
      prefix: row.prefix,
      productName: row.productName,
      brand: row.brand,
      category: row.category,
      salePrice: row.salePrice,
      stockQty: row.stockQty,
      lowStockThreshold: row.lowStockThreshold,
    },
  });
  return { ok: true };
}

async function writeDue(
  orgId: string,
  row: DueRow,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const customer = await findOrCreateCustomer(orgId, row.name, row.phone);
  await prisma.$transaction(async (tx) => {
    await createCreditInvoice(
      tx,
      orgId,
      customer.id,
      row.amount,
      row.dueDate,
      row.notes ? `Outstanding due — ${row.notes}` : 'Outstanding due',
    );
  });
  return { ok: true };
}

async function findOrCreateCustomer(
  orgId: string,
  name: string,
  phone: string | null,
): Promise<{ id: string }> {
  if (phone) {
    const byPhone = await prisma.customer.findFirst({
      where: { orgId, phone, deletedAt: null },
      select: { id: true },
    });
    if (byPhone) {
      return byPhone;
    }
  }
  const byName = await prisma.customer.findFirst({
    where: { orgId, name, deletedAt: null },
    select: { id: true },
  });
  if (byName) {
    return byName;
  }
  return prisma.customer.create({
    data: { orgId, name, phone },
    select: { id: true },
  });
}

async function createCreditInvoice(
  tx: Pick<typeof prisma, 'invoice' | 'invoiceSequence'>,
  orgId: string,
  customerId: string,
  total: string,
  issuedAt: Date,
  productName: string,
): Promise<void> {
  const invoiceNumber = await nextInvoiceNumber(tx, orgId);
  await tx.invoice.create({
    data: {
      orgId,
      customerId,
      status: 'CREDIT',
      total,
      discount: '0.00',
      paymentType: 'CREDIT',
      invoiceNumber,
      issuedAt,
      items: {
        create: {
          productName,
          priceCode: 'OPENING',
          quantity: 1,
          unitPrice: total,
          salePrice: total,
        },
      },
    },
  });
}

async function nextInvoiceNumber(
  tx: Pick<typeof prisma, 'invoiceSequence'>,
  orgId: string,
): Promise<number> {
  const sequence = await tx.invoiceSequence.upsert({
    where: { orgId },
    create: { orgId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return sequence.lastNumber;
}

async function readTable(
  fileBase64: string,
  expected: readonly string[],
): Promise<{ dataRows: Array<{ rowNumber: number; cells: string[] }> }> {
  const workbook = new ExcelJS.Workbook();
  try {
    const payload = Buffer.from(fileBase64, 'base64');
    await workbook.xlsx.load(payload as unknown as Parameters<ExcelJS.Xlsx['load']>[0]);
  } catch {
    throw new AppError(422, 'VALIDATION_ERROR', 'Upload an Excel file from the template');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The workbook has no sheet');
  }
  const header = sheet.getRow(1);
  const headers = expected.map((_, index) => cellText(header.getCell(index + 1).value));
  const mismatch = expected.some(
    (name, index) => headers[index]?.toLowerCase() !== name.toLowerCase(),
  );
  if (mismatch) {
    throw new AppError(422, 'VALIDATION_ERROR', `Use the template columns: ${expected.join(', ')}`);
  }
  const dataRows: Array<{ rowNumber: number; cells: string[] }> = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    const cells = expected.map((_, index) => cellText(row.getCell(index + 1).value));
    if (cells.every((value) => value.length === 0)) {
      return;
    }
    dataRows.push({ rowNumber, cells });
  });
  return { dataRows };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') {
    return value.text.trim();
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellText(value.result);
  }
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText
      .map((part) => (typeof part.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }
  return '';
}

function cell(cells: string[], index: number): string {
  return cells[index]?.trim() ?? '';
}

function money(
  value: string,
  fallback: string,
): { ok: true; value: string } | { ok: false; value: '' } {
  if (!value) {
    return fallback === '' ? { ok: false, value: '' } : { ok: true, value: fallback };
  }
  const normalised = value.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) {
    return { ok: false, value: '' };
  }
  const [whole = '0', fraction = ''] = normalised.split('.');
  return { ok: true, value: `${whole}.${`${fraction}00`.slice(0, 2)}` };
}

function integer(
  value: string,
  fallback: number,
): { ok: true; value: number } | { ok: false; value: 0 } {
  if (!value) {
    return { ok: true, value: fallback };
  }
  if (!/^\d+$/.test(value)) {
    return { ok: false, value: 0 };
  }
  return { ok: true, value: Number(value) };
}

function parseDate(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function requiredOrgId(auth: AuthSessionUser): string {
  if (!auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'You are not part of this organisation');
  }
  return auth.orgId;
}
