import ExcelJS from 'exceljs';
import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  moneyToCents,
  type AuthSessionUser,
  type LabBill,
  type LabBillListQuery,
  type LabServiceRow,
  type SaveLabServiceRequest,
  type UpdateLabBillRequest,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { styleSheet } from '../lib/sheet-table.js';
import { pdfWhen, renderTablePdf } from '../lib/text-pdf.js';

const DEFAULT_SERVICES = [
  'Cutting',
  'Fitting',
  'Edging',
  'Drilling',
  'Tint',
  'Coating',
  'Mounting',
] as const;

type BillTx = Pick<
  Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  'labService' | 'labBill' | 'labBillLine' | 'labBillAdjustment' | 'labClient'
>;

type MoneyValue = { toFixed: (digits: number) => string };

const billInclude = {
  lab: { select: { name: true } },
  retailer: { select: { name: true } },
  labClient: { select: { name: true } },
  labJob: {
    select: {
      referenceNumber: true,
      patientName: true,
      patientPhone: true,
      status: true,
      specialInstructions: true,
      notes: true,
      prescription: true,
      frameDetails: true,
      lensDetails: true,
    },
  },
  lines: { orderBy: { createdAt: 'asc' as const } },
  adjustments: { orderBy: { createdAt: 'asc' as const } },
} as const;

export async function ensureRateCard(labOrgId: string): Promise<void> {
  const count = await prisma.labService.count({ where: { labOrgId } });
  if (count > 0) {
    return;
  }
  await prisma.labService.createMany({
    data: DEFAULT_SERVICES.map((name, index) => ({
      labOrgId,
      name,
      price: '0.00',
      isActive: true,
      sortOrder: index,
    })),
  });
}

export async function listLabServices(auth: AuthSessionUser): Promise<LabServiceRow[]> {
  const labOrgId = requireLab(auth);
  await ensureRateCard(labOrgId);
  const rows = await prisma.labService.findMany({
    where: { labOrgId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toService);
}

export async function saveLabService(
  auth: AuthSessionUser,
  serviceId: string | null,
  input: SaveLabServiceRequest,
): Promise<LabServiceRow> {
  const labOrgId = requireLabAdmin(auth);
  await ensureRateCard(labOrgId);
  const name = input.name.trim();
  const clash = await prisma.labService.findFirst({
    where: { labOrgId, name, ...(serviceId ? { NOT: { id: serviceId } } : {}) },
    select: { id: true },
  });
  if (clash) {
    throw new AppError(409, 'VALIDATION_ERROR', 'That service is already on the rate card.');
  }
  if (serviceId) {
    const existing = await prisma.labService.findFirst({
      where: { id: serviceId, labOrgId },
      select: { id: true },
    });
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'That service was not found');
    }
    const saved = await prisma.labService.update({
      where: { id: serviceId },
      data: { name, price: input.price, isActive: input.isActive },
    });
    return toService(saved);
  }
  const count = await prisma.labService.count({ where: { labOrgId } });
  const saved = await prisma.labService.create({
    data: { labOrgId, name, price: input.price, isActive: input.isActive, sortOrder: count },
  });
  return toService(saved);
}

export async function listPricedServicesForShop(
  auth: AuthSessionUser,
  labOrgId: string,
): Promise<LabServiceRow[]> {
  const retailerOrgId = requireRetailer(auth);
  await requireApprovedLink(retailerOrgId, labOrgId);
  await ensureRateCard(labOrgId);
  const rows = await prisma.labService.findMany({
    where: { labOrgId, isActive: true, price: { gt: 0 } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toService);
}

export async function listShopLabServices(
  auth: AuthSessionUser,
): Promise<Array<{ labOrgId: string; services: LabServiceRow[] }>> {
  const retailerOrgId = requireRetailer(auth);
  const links = await prisma.labClient.findMany({
    where: { linkedOrgId: retailerOrgId, status: 'APPROVED' },
    select: { labOrgId: true },
  });
  const groups = [];
  for (const link of links) {
    groups.push({
      labOrgId: link.labOrgId,
      services: await listPricedServicesForShop(auth, link.labOrgId),
    });
  }
  return groups;
}

export async function openLabBill(
  tx: Pick<BillTx, 'labService' | 'labBill' | 'labClient'>,
  input: {
    labOrgId: string;
    retailerOrgId: string | null;
    labClientId: string | null;
    labJobId: string;
    retailerInvoiceId: string | null;
    serviceIds?: readonly string[];
    servicePrices?: readonly { serviceId: string; price: string }[];
  },
): Promise<void> {
  const existing = await tx.labBill.findUnique({
    where: { labJobId: input.labJobId },
    select: { id: true },
  });
  if (existing) {
    return;
  }
  if (input.serviceIds && input.serviceIds.length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Choose at least one lab service.');
  }
  const chosen = input.serviceIds ? [...new Set(input.serviceIds)] : [];
  const services =
    chosen.length === 0
      ? []
      : await tx.labService.findMany({
          where: { id: { in: chosen }, labOrgId: input.labOrgId, isActive: true },
        });
  if (services.length !== chosen.length) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Choose a service from this laboratory.');
  }
  if (services.some((service) => moneyToCents(money(service.price)) <= 0)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'That service has no price yet.');
  }
  const walkInQuote = input.retailerOrgId === null && input.labClientId === null;
  const quoted = new Map<string, string>();
  if (walkInQuote) {
    for (const row of input.servicePrices ?? []) {
      quoted.set(row.serviceId, centsToMoney(moneyToCents(row.price)));
    }
  }
  const linkedClient =
    input.labClientId === null && input.retailerOrgId
      ? await tx.labClient.findFirst({
          where: {
            labOrgId: input.labOrgId,
            linkedOrgId: input.retailerOrgId,
            status: 'APPROVED',
          },
          select: { id: true },
        })
      : null;
  const lines = services.map((service) => {
    const listPrice = money(service.price);
    const unitPrice = quoted.get(service.id) ?? listPrice;
    if (moneyToCents(unitPrice) <= 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Enter a price above zero for each service.');
    }
    return {
      labServiceId: service.id,
      serviceName: service.name,
      listPrice,
      unitPrice,
      quantity: 1,
    };
  });
  const total = centsToMoney(linesTotal(lines, 0, []));
  await tx.labBill.create({
    data: {
      labOrgId: input.labOrgId,
      retailerOrgId: input.retailerOrgId,
      labClientId: input.labClientId ?? linkedClient?.id ?? null,
      labJobId: input.labJobId,
      retailerInvoiceId: input.retailerInvoiceId,
      status: 'OPEN',
      discount: '0.00',
      total,
      lines: { create: lines },
    },
  });
}

export async function voidLabBillForJob(tx: Pick<BillTx, 'labBill'>, jobId: string): Promise<void> {
  const bill = await tx.labBill.findUnique({
    where: { labJobId: jobId },
    select: { id: true, status: true },
  });
  if (!bill || bill.status === 'VOID') {
    return;
  }
  if (bill.status === 'CLEARED') {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'This lab bill is already paid. It stays on the books.',
    );
  }
  await tx.labBill.update({
    where: { id: bill.id },
    data: { status: 'VOID', voidedAt: new Date() },
  });
}

export async function listRetailerLabBills(
  auth: AuthSessionUser,
  query: LabBillListQuery,
): Promise<LabBill[]> {
  const retailerOrgId = requireRetailer(auth);
  const rows = await prisma.labBill.findMany({
    where: {
      retailerOrgId,
      ...(query.labOrgId ? { labOrgId: query.labOrgId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...createdRange(query.from, query.to),
    },
    include: billInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map(toBill);
}

export async function listLaboratoryBills(
  auth: AuthSessionUser,
  query: LabBillListQuery,
): Promise<LabBill[]> {
  const labOrgId = requireLab(auth);
  const rows = await prisma.labBill.findMany({
    where: {
      labOrgId,
      ...(query.labClientId ? { labClientId: query.labClientId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...createdRange(query.from, query.to),
    },
    include: billInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map(toBill);
}

export async function updateOpenLabBill(
  auth: AuthSessionUser,
  billId: string,
  input: UpdateLabBillRequest,
): Promise<LabBill> {
  const labOrgId = requireLabAdmin(auth);
  const bill = await ownedBill(labOrgId, billId);
  if (bill.status !== 'OPEN') {
    throw new AppError(409, 'ORDER_LOCKED', 'Only an open lab bill can be edited.');
  }
  const known = new Set(bill.lines.map((line) => line.id));
  if (input.lines.some((line) => !known.has(line.id)) || input.lines.length !== bill.lines.length) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Keep every service that is already on the bill.');
  }
  const discount = moneyToCents(input.discount);
  const nextLines = input.lines.map((line) => ({
    unitPrice: line.unitPrice,
    quantity: line.quantity,
  }));
  if (discount > linesTotal(nextLines, 0, [])) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The discount is larger than the lab bill.');
  }
  await prisma.$transaction(async (tx) => {
    for (const line of input.lines) {
      await tx.labBillLine.update({
        where: { id: line.id },
        data: { unitPrice: line.unitPrice, quantity: line.quantity },
      });
    }
    await tx.labBill.update({
      where: { id: bill.id },
      data: {
        discount: input.discount,
        discountReason: blank(input.discountReason),
        total: centsToMoney(linesTotal(nextLines, discount, adjustmentCents(bill.adjustments))),
      },
    });
    await tx.auditLog.create({
      data: {
        orgId: labOrgId,
        userId: auth.userId,
        action: 'LAB_BILL_UPDATED',
        entityType: 'LabBill',
        entityId: bill.id,
        metadata: { discount: input.discount },
      },
    });
  });
  return readBill(bill.id);
}

export async function addLabBillLine(
  auth: AuthSessionUser,
  billId: string,
  labServiceId: string,
  quantity: number,
): Promise<LabBill> {
  const labOrgId = requireLabAdmin(auth);
  const bill = await ownedBill(labOrgId, billId);
  const walkIn = isWalkInBill(bill);
  if (bill.status === 'VOID') {
    throw new AppError(409, 'ORDER_LOCKED', 'A void bill cannot take another service.');
  }
  if (!walkIn && bill.status !== 'OPEN') {
    throw new AppError(409, 'ORDER_LOCKED', 'Services can be added only while the bill is open.');
  }
  if (walkIn && bill.status !== 'OPEN' && bill.status !== 'ISSUED' && bill.status !== 'CLEARED') {
    throw new AppError(409, 'ORDER_LOCKED', 'This walk-in bill cannot take another service.');
  }
  const service = await prisma.labService.findFirst({
    where: { id: labServiceId, labOrgId, isActive: true },
  });
  if (!service || moneyToCents(money(service.price)) <= 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Choose a priced service from the rate card.');
  }
  const paidBefore =
    bill.status === 'CLEARED' && moneyToCents(money(bill.amountPaid)) === 0
      ? moneyToCents(money(bill.total))
      : moneyToCents(money(bill.amountPaid));
  await prisma.$transaction(async (tx) => {
    await tx.labBillLine.create({
      data: {
        labBillId: bill.id,
        labServiceId: service.id,
        serviceName: service.name,
        listPrice: money(service.price),
        unitPrice: money(service.price),
        quantity,
      },
    });
    await refreshTotal(tx, bill.id);
    if (walkIn && bill.status !== 'OPEN') {
      const next = await tx.labBill.findUniqueOrThrow({
        where: { id: bill.id },
        select: { total: true },
      });
      const balance = moneyToCents(money(next.total)) > paidBefore;
      await tx.labBill.update({
        where: { id: bill.id },
        data: balance
          ? {
              status: 'ISSUED',
              amountPaid: centsToMoney(paidBefore),
              issuedAt: bill.issuedAt ?? new Date(),
              clearedAt: null,
            }
          : {
              status: 'CLEARED',
              amountPaid: centsToMoney(paidBefore),
              clearedAt: bill.clearedAt ?? new Date(),
            },
      });
    }
  });
  return readBill(bill.id);
}

export async function settleWalkInOpening(
  tx: Pick<BillTx, 'labBill'>,
  labJobId: string,
  amountReceived: string | undefined,
  userId: string,
): Promise<void> {
  const bill = await tx.labBill.findUnique({
    where: { labJobId },
    include: { lines: true },
  });
  if (!bill || bill.retailerOrgId || bill.labClientId) {
    return;
  }
  const totalCents = linesTotal(
    bill.lines.map((line) => ({ unitPrice: money(line.unitPrice), quantity: line.quantity })),
    0,
    [],
  );
  if (totalCents === 0) {
    return;
  }
  const received = (amountReceived ?? '').trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(received) || moneyToCents(received) !== totalCents) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Collect the full walk-in amount before saving the job.',
    );
  }
  const now = new Date();
  await tx.labBill.update({
    where: { id: bill.id },
    data: {
      status: 'CLEARED',
      amountPaid: centsToMoney(totalCents),
      issuedAt: now,
      clearedAt: now,
      clearedByUserId: userId,
    },
  });
}

export async function loadLabBillForJob(
  labOrgId: string,
  labJobId: string,
): Promise<LabBill | null> {
  const row = await prisma.labBill.findFirst({
    where: { labOrgId, labJobId },
    include: billInclude,
  });
  return row ? toBill(row) : null;
}

export async function collectWalkInBalance(
  auth: AuthSessionUser,
  billId: string,
): Promise<LabBill> {
  const labOrgId = requireLabAdmin(auth);
  const bill = await ownedBill(labOrgId, billId);
  if (!isWalkInBill(bill)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'A shop bill is settled with the retailer.');
  }
  if (bill.status !== 'ISSUED') {
    throw new AppError(409, 'ORDER_LOCKED', 'This walk-in bill has no balance to collect.');
  }
  await prisma.labBill.update({
    where: { id: bill.id },
    data: {
      status: 'CLEARED',
      amountPaid: money(bill.total),
      clearedAt: new Date(),
      clearedByUserId: auth.userId,
      issuedAt: bill.issuedAt ?? new Date(),
    },
  });
  return readBill(bill.id);
}

export async function issueLabBill(auth: AuthSessionUser, billId: string): Promise<LabBill> {
  const labOrgId = requireLabAdmin(auth);
  const bill = await ownedBill(labOrgId, billId);
  if (bill.status !== 'OPEN') {
    throw new AppError(409, 'ORDER_LOCKED', 'This lab bill is already issued.');
  }
  if (bill.lines.length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Add a service before issuing the bill.');
  }
  await prisma.labBill.update({
    where: { id: bill.id },
    data: { status: 'ISSUED', issuedAt: new Date() },
  });
  if (bill.retailerOrgId) {
    await prisma.alert.create({
      data: {
        orgId: bill.retailerOrgId,
        type: 'LAB_JOB_STATUS',
        title: 'Lab bill issued',
        body: `${bill.labJob.referenceNumber} has a laboratory bill of ${money(bill.total)}.`,
        relatedEntityId: bill.labJobId,
        relatedEntityType: 'LabJob',
      },
    });
  }
  return readBill(bill.id);
}

export async function clearLabBill(auth: AuthSessionUser, billId: string): Promise<LabBill> {
  const labOrgId = requireLabAdmin(auth);
  const bill = await ownedBill(labOrgId, billId);
  if (bill.status !== 'ISSUED') {
    throw new AppError(409, 'ORDER_LOCKED', 'Issue the lab bill before marking it paid.');
  }
  await prisma.labBill.update({
    where: { id: bill.id },
    data: {
      status: 'CLEARED',
      amountPaid: money(bill.total),
      clearedAt: new Date(),
      clearedByUserId: auth.userId,
    },
  });
  if (bill.retailerOrgId) {
    await prisma.alert.create({
      data: {
        orgId: bill.retailerOrgId,
        type: 'LAB_JOB_STATUS',
        title: 'Lab bill paid',
        body: `${bill.labJob.referenceNumber} is marked paid by the laboratory.`,
        relatedEntityId: bill.labJobId,
        relatedEntityType: 'LabJob',
      },
    });
  }
  return readBill(bill.id);
}

export async function adjustIssuedLabBill(
  auth: AuthSessionUser,
  billId: string,
  note: string,
  amount: string,
): Promise<LabBill> {
  const labOrgId = requireLabAdmin(auth);
  const bill = await ownedBill(labOrgId, billId);
  if (bill.status !== 'ISSUED') {
    throw new AppError(409, 'ORDER_LOCKED', 'An adjustment belongs on an issued bill.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.labBillAdjustment.create({
      data: {
        labBillId: bill.id,
        note: note.trim(),
        amount,
        createdByUserId: auth.userId,
      },
    });
    await refreshTotal(tx, bill.id);
    await tx.auditLog.create({
      data: {
        orgId: labOrgId,
        userId: auth.userId,
        action: 'LAB_BILL_ADJUSTED',
        entityType: 'LabBill',
        entityId: bill.id,
        metadata: { note: note.trim(), amount },
      },
    });
  });
  return readBill(bill.id);
}

export async function exportRetailerLabBills(
  auth: AuthSessionUser,
  query: LabBillListQuery,
  format: 'xlsx' | 'pdf',
): Promise<{ filename: string; body: Buffer }> {
  const rows = await listRetailerLabBills(auth, query);
  return exportBills('Lab expense', 'lab-expense', rows, format, 'lab');
}

export async function exportLaboratoryBills(
  auth: AuthSessionUser,
  query: LabBillListQuery,
  format: 'xlsx' | 'pdf',
): Promise<{ filename: string; body: Buffer }> {
  const rows = await listLaboratoryBills(auth, query);
  const shop = query.labClientId
    ? (rows[0]?.clientName ?? rows[0]?.retailerName ?? 'Retailer')
    : null;
  return exportBills(
    shop ? `${shop} statement` : 'Lab income',
    'lab-income',
    rows,
    format,
    'party',
  );
}

export async function labExpenseByInvoice(
  invoiceIds: readonly string[],
): Promise<Map<string, { issued: number; pending: number }>> {
  const totals = new Map<string, { issued: number; pending: number }>();
  if (invoiceIds.length === 0) {
    return totals;
  }
  const rows = await prisma.labBill.findMany({
    where: {
      retailerInvoiceId: { in: [...invoiceIds] },
      status: { in: ['OPEN', 'ISSUED', 'CLEARED'] },
    },
    select: { retailerInvoiceId: true, status: true, total: true },
  });
  for (const row of rows) {
    if (!row.retailerInvoiceId) {
      continue;
    }
    const current = totals.get(row.retailerInvoiceId) ?? { issued: 0, pending: 0 };
    const cents = moneyToCents(money(row.total));
    if (row.status === 'OPEN') {
      current.pending += cents;
    } else {
      current.issued += cents;
    }
    totals.set(row.retailerInvoiceId, current);
  }
  return totals;
}

async function refreshTotal(tx: BillTx, billId: string): Promise<void> {
  const bill = await tx.labBill.findUniqueOrThrow({
    where: { id: billId },
    include: { lines: true, adjustments: true },
  });
  const total = linesTotal(
    bill.lines.map((line) => ({ unitPrice: money(line.unitPrice), quantity: line.quantity })),
    moneyToCents(money(bill.discount)),
    bill.adjustments.map((row) => signedCents(money(row.amount))),
  );
  await tx.labBill.update({
    where: { id: billId },
    data: { total: centsToMoney(Math.max(0, total)) },
  });
}

async function readBill(id: string): Promise<LabBill> {
  const row = await prisma.labBill.findUniqueOrThrow({ where: { id }, include: billInclude });
  return toBill(row);
}

async function ownedBill(labOrgId: string, billId: string) {
  const bill = await prisma.labBill.findFirst({
    where: { id: billId, labOrgId },
    include: billInclude,
  });
  if (!bill) {
    throw new AppError(404, 'NOT_FOUND', 'That lab bill was not found');
  }
  return bill;
}

function toService(row: {
  id: string;
  name: string;
  price: MoneyValue;
  isActive: boolean;
}): LabServiceRow {
  return { id: row.id, name: row.name, price: money(row.price), isActive: row.isActive };
}

function toBill(row: {
  id: string;
  status: LabBill['status'];
  discount: MoneyValue;
  discountReason: string | null;
  total: MoneyValue;
  amountPaid: MoneyValue;
  issuedAt: Date | null;
  clearedAt: Date | null;
  createdAt: Date;
  labOrgId: string;
  lab: { name: string };
  retailer: { name: string } | null;
  labClient: { name: string } | null;
  labJob: {
    referenceNumber: string;
    patientName: string;
    patientPhone: string | null;
    status: LabBill['jobStatus'];
    specialInstructions: string | null;
    notes: string | null;
    prescription: unknown;
    frameDetails: unknown;
    lensDetails: unknown;
  };
  lines: Array<{
    id: string;
    serviceName: string;
    listPrice: MoneyValue;
    unitPrice: MoneyValue;
    quantity: number;
  }>;
  adjustments: Array<{ id: string; note: string; amount: MoneyValue; createdAt: Date }>;
}): LabBill {
  return {
    id: row.id,
    referenceNumber: row.labJob.referenceNumber,
    patientName: row.labJob.patientName,
    patientPhone: row.labJob.patientPhone ?? '',
    jobStatus: row.labJob.status,
    jobSummary: describeJob(row.labJob),
    labOrgId: row.labOrgId,
    labName: row.lab.name,
    retailerName: row.retailer?.name ?? null,
    clientName: row.labClient?.name ?? null,
    status: row.status,
    discount: money(row.discount),
    discountReason: row.discountReason,
    total: money(row.total),
    amountPaid: recordedPayment(row.status, row.amountPaid, row.total),
    lines: row.lines.map((line) => ({
      id: line.id,
      serviceName: line.serviceName,
      listPrice: money(line.listPrice),
      unitPrice: money(line.unitPrice),
      quantity: line.quantity,
      lineTotal: centsToMoney(moneyToCents(money(line.unitPrice)) * line.quantity),
    })),
    adjustments: row.adjustments.map((rowAdjustment) => ({
      id: rowAdjustment.id,
      note: rowAdjustment.note,
      amount: money(rowAdjustment.amount),
      createdAt: rowAdjustment.createdAt.toISOString(),
    })),
    issuedAt: row.issuedAt?.toISOString() ?? null,
    clearedAt: row.clearedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function linesTotal(
  lines: readonly { unitPrice: string; quantity: number }[],
  discountCents: number,
  adjustments: readonly number[],
): number {
  const sale = lines.reduce((sum, line) => sum + moneyToCents(line.unitPrice) * line.quantity, 0);
  const adjusted = adjustments.reduce((sum, amount) => sum + amount, 0);
  return sale - discountCents + adjusted;
}

function adjustmentCents(rows: readonly { amount: MoneyValue }[]): number[] {
  return rows.map((row) => signedCents(money(row.amount)));
}

function signedCents(value: string): number {
  const negative = value.trim().startsWith('-');
  const cents = moneyToCents(negative ? value.trim().slice(1) : value);
  return negative ? -cents : cents;
}

function money(value: MoneyValue): string {
  return value.toFixed(2);
}

function recordedPayment(
  status: LabBill['status'],
  amountPaid: MoneyValue,
  total: MoneyValue,
): string {
  const paid = money(amountPaid);
  if (status === 'CLEARED' && moneyToCents(paid) === 0) {
    return money(total);
  }
  return paid;
}

function isWalkInBill(bill: { retailerOrgId: string | null; labClientId: string | null }): boolean {
  return bill.retailerOrgId === null && bill.labClientId === null;
}

function describeJob(job: {
  specialInstructions: string | null;
  notes: string | null;
  prescription: unknown;
  frameDetails: unknown;
  lensDetails: unknown;
}): string {
  const parts: string[] = [];
  const product = job.specialInstructions?.trim() ?? '';
  if (product.length > 0) {
    parts.push(product);
  }
  const lens = joinedRecord(job.lensDetails, ['name', 'type']);
  if (lens.length > 0) {
    parts.push(`Lens ${lens}`);
  }
  const frame = joinedRecord(job.frameDetails, ['name', 'type', 'material', 'eyeSize']);
  if (frame.length > 0) {
    parts.push(`Frame ${frame}`);
  }
  const reading = readingLine(job.prescription);
  if (reading.length > 0) {
    parts.push(reading);
  }
  const notes = job.notes?.trim() ?? '';
  if (notes.length > 0 && notes !== product) {
    parts.push(notes);
  }
  return parts.length > 0
    ? parts.join('. ')
    : 'This job has no frame, lens, or prescription notes.';
}

function readingLine(value: unknown): string {
  const record = asRecord(value);
  const right = eyeLine('Right', asRecord(record.right));
  const left = eyeLine('Left', asRecord(record.left));
  const add = textValue(record.add);
  const pd = textValue(record.pd);
  return [right, left, add.length > 0 ? `Add ${add}` : '', pd.length > 0 ? `PD ${pd}` : '']
    .filter((part) => part.length > 0)
    .join(', ');
}

function eyeLine(side: string, record: Record<string, unknown>): string {
  const powers = [
    textValue(record.sphere),
    textValue(record.cylinder),
    textValue(record.axis),
  ].filter((part) => part.length > 0);
  return powers.length > 0 ? `${side} ${powers.join(' / ')}` : '';
}

function joinedRecord(value: unknown, keys: readonly string[]): string {
  const record = asRecord(value);
  return keys
    .map((key) => textValue(record[key]))
    .filter((part) => part.length > 0)
    .join(', ');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value));
  }
  return {};
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function createdRange(
  from: string | undefined,
  to: string | undefined,
): { createdAt?: { gte: Date; lt: Date } } {
  if (!from || !to) {
    return {};
  }
  return {
    createdAt: {
      gte: new Date(`${from}T00:00:00.000Z`),
      lt: new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000),
    },
  };
}

async function requireApprovedLink(retailerOrgId: string, labOrgId: string): Promise<void> {
  const link = await prisma.labClient.findFirst({
    where: { labOrgId, linkedOrgId: retailerOrgId, status: 'APPROVED' },
    select: { id: true },
  });
  if (!link) {
    throw new AppError(
      403,
      'CONNECTION_REQUIRED',
      'That laboratory has not accepted this connection',
    );
  }
}

function requireRetailer(auth: AuthSessionUser): string {
  if (auth.orgType !== 'RETAILER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This belongs to a shop');
  }
  return auth.orgId;
}

function requireLab(auth: AuthSessionUser): string {
  if (auth.orgType !== 'LABORATORY' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This belongs to a laboratory');
  }
  return auth.orgId;
}

function requireLabAdmin(auth: AuthSessionUser): string {
  const labOrgId = requireLab(auth);
  if (auth.role !== 'ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'A laboratory admin sets prices and marks bills paid');
  }
  return labOrgId;
}

const STATUS_LABEL: Record<LabBill['status'], string> = {
  OPEN: 'Open',
  ISSUED: 'Issued',
  CLEARED: 'Paid',
  VOID: 'Rejected',
};

async function exportBills(
  title: string,
  filename: string,
  rows: readonly LabBill[],
  format: 'xlsx' | 'pdf',
  party: 'lab' | 'party',
): Promise<{ filename: string; body: Buffer }> {
  const tableRows = rows.map((row) => [
    row.referenceNumber,
    row.patientName,
    party === 'lab' ? row.labName : (row.retailerName ?? row.clientName ?? 'Walk-in'),
    row.lines.map((line) => line.serviceName).join(', '),
    STATUS_LABEL[row.status],
    row.total,
    pdfWhen(row.createdAt),
  ]);
  if (format === 'pdf') {
    return {
      filename: `${filename}.pdf`,
      body: renderTablePdf({
        title: `OptiWorld ${title.toLowerCase()}`,
        landscape: true,
        tables: [
          {
            heading: title,
            columns: [
              'Job',
              'Patient',
              party === 'lab' ? 'Laboratory' : 'Party',
              'Services',
              'Status',
              'Total',
              'Opened',
            ],
            widths: [1.1, 1.3, 1.4, 1.8, 0.8, 0.9, 1.1],
            empty: 'No lab bills in this range.',
            rows: tableRows,
          },
        ],
      }),
    };
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(title);
  sheet.columns = [
    { header: 'Job', key: 'job', width: 18 },
    { header: 'Patient', key: 'patient', width: 24 },
    { header: party === 'lab' ? 'Laboratory' : 'Party', key: 'party', width: 28 },
    { header: 'Services', key: 'services', width: 36 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Total', key: 'total', width: 14 },
    { header: 'Opened', key: 'opened', width: 20 },
  ];
  for (const row of tableRows) {
    sheet.addRow({
      job: row[0],
      patient: row[1],
      party: row[2],
      services: row[3],
      status: row[4],
      total: row[5],
      opened: row[6],
    });
  }
  styleSheet(sheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return { filename: `${filename}.xlsx`, body: Buffer.from(buffer) };
}
