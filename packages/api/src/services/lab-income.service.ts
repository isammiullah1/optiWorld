import ExcelJS from 'exceljs';
import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  isMarkedDoneNote,
  isProcessingStatus,
  moneyToCents,
  PROCESSING_JOB_STATUSES,
  type AuthSessionUser,
  type JobStatus,
  type LabIncome,
  type LabIncomeQuery,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { styleSheet } from '../lib/sheet-table.js';
import { renderTablePdf } from '../lib/text-pdf.js';

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;
const LIST_CAP = 100;

type BillStatus = 'OPEN' | 'ISSUED' | 'CLEARED' | 'VOID';

type LoadedJob = {
  id: string;
  referenceNumber: string;
  patientName: string;
  status: JobStatus;
  isUrgent: boolean;
  completedAt: Date | null;
  updatedAt: Date;
  retailerOrgId: string | null;
  labClientId: string | null;
  retailer: { name: string } | null;
  labClient: { name: string } | null;
  statusHistory: Array<{
    status: JobStatus;
    notes: string | null;
    changedAt: Date;
    changedByUser: { id: string; name: string } | null;
  }>;
  labBill: {
    status: BillStatus;
    discount: { toFixed(digits: number): string };
    total: { toFixed(digits: number): string };
    amountPaid: { toFixed(digits: number): string };
    issuedAt: Date | null;
    clearedAt: Date | null;
    lines: Array<{
      serviceName: string;
      unitPrice: { toFixed(digits: number): string };
      quantity: number;
    }>;
    adjustments: Array<{ amount: { toFixed(digits: number): string } }>;
  } | null;
  stockMovements: Array<{
    quantity: { toString(): string };
    unitCost: { toFixed(digits: number): string } | null;
    item: { name: string; category: string; unit: string };
  }>;
};

type Sale = {
  id: string;
  referenceNumber: string;
  customerName: string;
  partyId: string;
  partyName: string;
  partyKind: 'SHOP' | 'WALK_IN';
  finishedOn: string;
  services: string;
  income: number;
  discount: number;
  adjustments: number;
  collected: number;
  outstanding: number;
  materialCost: number | null;
  profit: number | null;
  costMissing: boolean;
  billStatus: 'ISSUED' | 'CLEARED';
  finisherId: string;
  finishedBy: string;
  lines: Array<{ name: string; quantity: number; share: number }>;
  usage: LoadedJob['stockMovements'];
};

export async function getLabIncome(
  auth: AuthSessionUser,
  query: LabIncomeQuery,
): Promise<LabIncome> {
  const labOrgId = requireLabAdmin(auth);
  const range = parseRange(query.from, query.to);
  const [jobs, received, unassigned, lowStock, partyClient] = await Promise.all([
    loadJobs(labOrgId, range),
    loadReceived(labOrgId, range),
    loadUnassigned(labOrgId, range),
    loadLowStock(labOrgId),
    resolveParty(labOrgId, query.party),
  ]);
  const sales = jobs
    .map((job) => toSale(job, range, query, partyClient))
    .filter((sale): sale is Sale => sale !== null);
  const openJobs = jobs
    .map((job) => toHeld(job, range, query, partyClient, 'OPEN'))
    .filter((row): row is LabIncome['openJobs'][number] => row !== null);
  const voidedJobs = jobs
    .map((job) => toHeld(job, range, query, partyClient, 'VOID'))
    .filter((row): row is LabIncome['voidedJobs'][number] => row !== null);
  return {
    from: query.from,
    to: query.to,
    summary: summarise(sales, openJobs, voidedJobs.length),
    daily: dailyRows(sales),
    retailers: rankParties(sales.filter((sale) => sale.partyKind === 'SHOP')),
    clients: rankParties(sales.filter((sale) => sale.partyKind === 'WALK_IN')),
    services: rankServices(sales),
    finishers: rankFinishers(sales),
    openJobs: openJobs.slice(0, LIST_CAP),
    voidedJobs: voidedJobs.slice(0, LIST_CAP),
    sales: sales.slice(0, LIST_CAP).map(saleRow),
    usedOnSales: usedOnSales(sales),
    received,
    unassignedUse: unassigned,
    lowStock,
  };
}

export async function exportLabIncome(
  auth: AuthSessionUser,
  query: LabIncomeQuery,
  format: 'xlsx' | 'pdf',
): Promise<{ filename: string; body: Buffer }> {
  const report = await getLabIncome(auth, query);
  if (format === 'pdf') {
    return { filename: 'lab-income.pdf', body: incomePdf(report) };
  }
  return { filename: 'lab-income.xlsx', body: await incomeWorkbook(report) };
}

async function loadJobs(labOrgId: string, range: { start: Date; end: Date }): Promise<LoadedJob[]> {
  return prisma.labJob.findMany({
    where: {
      labOrgId,
      status: { notIn: ['REJECTED', 'CANCELLED', 'OUTSOURCED'] },
      OR: [
        { completedAt: { gte: range.start, lt: range.end } },
        { status: { in: ['READY', 'DISPATCHED'] } },
        {
          labBill: {
            status: { in: ['ISSUED', 'CLEARED'] },
            OR: [
              { issuedAt: { gte: range.start, lt: range.end } },
              { clearedAt: { gte: range.start, lt: range.end } },
            ],
          },
        },
      ],
    },
    select: {
      id: true,
      referenceNumber: true,
      patientName: true,
      status: true,
      isUrgent: true,
      completedAt: true,
      updatedAt: true,
      retailerOrgId: true,
      labClientId: true,
      retailer: { select: { name: true } },
      labClient: { select: { name: true } },
      statusHistory: {
        orderBy: { changedAt: 'asc' },
        select: {
          status: true,
          notes: true,
          changedAt: true,
          changedByUser: { select: { id: true, name: true } },
        },
      },
      labBill: {
        select: {
          status: true,
          discount: true,
          total: true,
          amountPaid: true,
          issuedAt: true,
          clearedAt: true,
          lines: { select: { serviceName: true, unitPrice: true, quantity: true } },
          adjustments: { select: { amount: true } },
        },
      },
      stockMovements: {
        where: { kind: 'USAGE' },
        select: {
          quantity: true,
          unitCost: true,
          item: { select: { name: true, category: true, unit: true } },
        },
      },
    },
  });
}

function toSale(
  job: LoadedJob,
  range: { start: Date; end: Date },
  query: LabIncomeQuery,
  party: PartyMatch,
): Sale | null {
  const recognized = saleDate(job, range);
  if (!recognized) {
    return null;
  }
  if (!matchesJob(job, query, party)) {
    return null;
  }
  const bill = job.labBill;
  if (!bill || (bill.status !== 'ISSUED' && bill.status !== 'CLEARED')) {
    return null;
  }
  if (query.billStatus && bill.status !== query.billStatus) {
    return null;
  }
  const lines = bill.lines.map((line) => ({
    name: line.serviceName,
    quantity: line.quantity,
    base: moneyToCents(line.unitPrice.toFixed(2)) * line.quantity,
  }));
  const wanted = query.service?.toLowerCase();
  if (wanted && !lines.some((line) => line.name.toLowerCase() === wanted)) {
    return null;
  }
  const income = moneyToCents(bill.total.toFixed(2));
  const payment = settlement(bill.status, income, bill.amountPaid.toFixed(2));
  const materials = materialCost(job.stockMovements);
  const finisher = finisherOf(job);
  if (query.finishedBy && finisher.id !== query.finishedBy) {
    return null;
  }
  const partyKind = job.retailerOrgId ? 'SHOP' : 'WALK_IN';
  return {
    id: job.id,
    referenceNumber: job.referenceNumber,
    customerName: job.patientName,
    partyId: job.retailerOrgId ?? job.labClientId ?? 'walk-in',
    partyName: job.retailer?.name ?? job.labClient?.name ?? 'Walk-in',
    partyKind,
    finishedOn: dayKey(recognized),
    services: lines.map((line) => `${line.name} × ${line.quantity}`).join(', '),
    income,
    discount: moneyToCents(bill.discount.toFixed(2)),
    adjustments: bill.adjustments.reduce((sum, row) => sum + signedCents(row.amount.toFixed(2)), 0),
    collected: payment.collected,
    outstanding: payment.outstanding,
    materialCost: materials.missing ? null : materials.cents,
    profit: materials.missing ? null : income - materials.cents,
    costMissing: materials.missing,
    billStatus: bill.status,
    finisherId: finisher.id,
    finishedBy: finisher.name,
    lines: shareLines(lines, income),
    usage: job.stockMovements,
  };
}

function toHeld(
  job: LoadedJob,
  range: { start: Date; end: Date },
  query: LabIncomeQuery,
  party: PartyMatch,
  status: 'OPEN' | 'VOID',
): LabIncome['openJobs'][number] | null {
  const finished = finishedAt(job);
  if (!finished || finished < range.start || finished >= range.end) {
    return null;
  }
  if (!matchesJob(job, query, party)) {
    return null;
  }
  const bill = job.labBill;
  const held = !bill || bill.status === 'OPEN';
  if (status === 'OPEN' && !held) {
    return null;
  }
  if (status === 'VOID' && bill?.status !== 'VOID') {
    return null;
  }
  if (query.billStatus && query.billStatus !== status) {
    return null;
  }
  if (query.service) {
    const names = bill?.lines.map((line) => line.serviceName.toLowerCase()) ?? [];
    if (!names.includes(query.service.toLowerCase())) {
      return null;
    }
  }
  const finisher = finisherOf(job);
  if (query.finishedBy && finisher.id !== query.finishedBy) {
    return null;
  }
  return {
    id: job.id,
    referenceNumber: job.referenceNumber,
    customerName: job.patientName,
    partyName: job.retailer?.name ?? job.labClient?.name ?? 'Walk-in',
    finishedOn: dayKey(finished),
    total: bill ? bill.total.toFixed(2) : '0.00',
  };
}

function matchesJob(job: LoadedJob, query: LabIncomeQuery, party: PartyMatch): boolean {
  if (query.urgent === 'true' && !job.isUrgent) {
    return false;
  }
  if (query.status) {
    const allowed: readonly JobStatus[] = isProcessingStatus(query.status)
      ? PROCESSING_JOB_STATUSES
      : [query.status];
    if (!allowed.includes(job.status)) {
      return false;
    }
  }
  if (party.kind === 'SHOPS' && !job.retailerOrgId) {
    return false;
  }
  if (party.kind === 'WALK_IN' && job.retailerOrgId) {
    return false;
  }
  if (party.kind === 'CLIENT') {
    const linked = party.linkedOrgId !== null && job.retailerOrgId === party.linkedOrgId;
    if (job.labClientId !== party.clientId && !linked) {
      return false;
    }
  }
  return true;
}

function summarise(
  sales: readonly Sale[],
  openJobs: readonly { total: string }[],
  voided: number,
): LabIncome['summary'] {
  const income = sales.reduce((sum, sale) => sum + sale.income, 0);
  const costMissing = sales.some((sale) => sale.costMissing);
  const material = sales.reduce((sum, sale) => sum + (sale.materialCost ?? 0), 0);
  return {
    finishedSales: sales.length,
    income: centsToMoney(income),
    discount: centsToMoney(sales.reduce((sum, sale) => sum + sale.discount, 0)),
    adjustments: centsToMoney(sales.reduce((sum, sale) => sum + sale.adjustments, 0)),
    collected: centsToMoney(sales.reduce((sum, sale) => sum + sale.collected, 0)),
    outstanding: centsToMoney(sales.reduce((sum, sale) => sum + sale.outstanding, 0)),
    shopIncome: centsToMoney(
      sales.filter((sale) => sale.partyKind === 'SHOP').reduce((sum, sale) => sum + sale.income, 0),
    ),
    walkInIncome: centsToMoney(
      sales
        .filter((sale) => sale.partyKind === 'WALK_IN')
        .reduce((sum, sale) => sum + sale.income, 0),
    ),
    materialCost: costMissing ? null : centsToMoney(material),
    profit: costMissing ? null : centsToMoney(income - material),
    costMissing,
    openOnFinished: openJobs.length,
    openValue: centsToMoney(openJobs.reduce((sum, job) => sum + moneyToCents(job.total), 0)),
    voided,
  };
}

function dailyRows(sales: readonly Sale[]): LabIncome['daily'] {
  const rows = new Map<
    string,
    { jobs: number; income: number; collected: number; outstanding: number }
  >();
  for (const sale of sales) {
    const row = rows.get(sale.finishedOn) ?? { jobs: 0, income: 0, collected: 0, outstanding: 0 };
    row.jobs += 1;
    row.income += sale.income;
    row.collected += sale.collected;
    row.outstanding += sale.outstanding;
    rows.set(sale.finishedOn, row);
  }
  return [...rows.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, row]) => ({
      date,
      jobs: row.jobs,
      income: centsToMoney(row.income),
      collected: centsToMoney(row.collected),
      outstanding: centsToMoney(row.outstanding),
    }));
}

function rankParties(sales: readonly Sale[]): LabIncome['retailers'] {
  const groups = new Map<
    string,
    { name: string; jobs: number; income: number; outstanding: number }
  >();
  for (const sale of sales) {
    const group = groups.get(sale.partyId) ?? {
      name: sale.partyName,
      jobs: 0,
      income: 0,
      outstanding: 0,
    };
    group.jobs += 1;
    group.income += sale.income;
    group.outstanding += sale.outstanding;
    groups.set(sale.partyId, group);
  }
  return [...groups.entries()]
    .sort(
      (left, right) =>
        right[1].income - left[1].income || left[1].name.localeCompare(right[1].name),
    )
    .slice(0, 50)
    .map(([id, group]) => ({
      id,
      name: group.name,
      jobs: group.jobs,
      income: centsToMoney(group.income),
      outstanding: centsToMoney(group.outstanding),
      average: centsToMoney(group.jobs === 0 ? 0 : Math.round(group.income / group.jobs)),
    }));
}

function rankServices(sales: readonly Sale[]): LabIncome['services'] {
  const groups = new Map<string, { jobs: number; quantity: number; income: number }>();
  for (const sale of sales) {
    const seen = new Set<string>();
    for (const line of sale.lines) {
      const key = line.name;
      const group = groups.get(key) ?? { jobs: 0, quantity: 0, income: 0 };
      if (!seen.has(key)) {
        group.jobs += 1;
        seen.add(key);
      }
      group.quantity += line.quantity;
      group.income += line.share;
      groups.set(key, group);
    }
  }
  return [...groups.entries()]
    .sort((left, right) => right[1].income - left[1].income || left[0].localeCompare(right[0]))
    .slice(0, 50)
    .map(([name, group]) => ({
      name,
      jobs: group.jobs,
      quantity: group.quantity,
      income: centsToMoney(group.income),
    }));
}

function rankFinishers(sales: readonly Sale[]): LabIncome['finishers'] {
  const groups = new Map<string, { name: string; jobs: number; income: number }>();
  for (const sale of sales) {
    const group = groups.get(sale.finisherId) ?? { name: sale.finishedBy, jobs: 0, income: 0 };
    group.jobs += 1;
    group.income += sale.income;
    groups.set(sale.finisherId, group);
  }
  return [...groups.entries()]
    .sort(
      (left, right) =>
        right[1].income - left[1].income || left[1].name.localeCompare(right[1].name),
    )
    .map(([id, group]) => ({
      id,
      name: group.name,
      jobs: group.jobs,
      income: centsToMoney(group.income),
    }));
}

function saleRow(sale: Sale): LabIncome['sales'][number] {
  return {
    id: sale.id,
    referenceNumber: sale.referenceNumber,
    customerName: sale.customerName,
    partyName: sale.partyName,
    partyKind: sale.partyKind,
    finishedOn: sale.finishedOn,
    services: sale.services,
    income: centsToMoney(sale.income),
    materialCost: sale.materialCost === null ? null : centsToMoney(sale.materialCost),
    profit: sale.profit === null ? null : centsToMoney(sale.profit),
    costMissing: sale.costMissing,
    billStatus: sale.billStatus,
    finishedBy: sale.finishedBy,
  };
}

function usedOnSales(sales: readonly Sale[]): LabIncome['usedOnSales'] {
  const groups = new Map<
    string,
    {
      name: string;
      category: string;
      unit: string;
      milli: number;
      jobs: Set<string>;
      cost: number;
      missing: boolean;
    }
  >();
  for (const sale of sales) {
    for (const movement of sale.usage) {
      const key = `${movement.item.name}|${movement.item.category}|${movement.item.unit}`;
      const group = groups.get(key) ?? {
        name: movement.item.name,
        category: movement.item.category,
        unit: movement.item.unit,
        milli: 0,
        jobs: new Set<string>(),
        cost: 0,
        missing: false,
      };
      group.milli += milli(movement.quantity.toString());
      group.jobs.add(sale.id);
      if (!movement.unitCost) {
        group.missing = true;
      } else {
        group.cost += Math.round(
          (milli(movement.quantity.toString()) * moneyToCents(movement.unitCost.toFixed(2))) / 1000,
        );
      }
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .sort((left, right) => right.milli - left.milli || left.name.localeCompare(right.name))
    .map((group) => ({
      name: group.name,
      category: group.category,
      quantity: fromMilli(group.milli),
      unit: group.unit,
      jobs: group.jobs.size,
      cost: group.missing ? null : centsToMoney(group.cost),
      costMissing: group.missing,
    }));
}

async function loadReceived(
  labOrgId: string,
  range: { start: Date; end: Date },
): Promise<LabIncome['received']> {
  const rows = await prisma.labStockMovement.findMany({
    where: { labOrgId, kind: 'RECEIVED', occurredAt: { gte: range.start, lt: range.end } },
    include: { item: { select: { name: true, category: true, unit: true } } },
    orderBy: { occurredAt: 'desc' },
    take: LIST_CAP,
  });
  return rows.map((row) => ({
    name: row.item.name,
    category: row.item.category,
    quantity: formatQty(row.quantity.toString()),
    unit: row.item.unit,
    supplier: row.supplier?.trim() || 'No supplier',
    occurredOn: dayKey(row.occurredAt),
    unitCost: row.unitCost ? row.unitCost.toFixed(2) : null,
  }));
}

async function loadUnassigned(
  labOrgId: string,
  range: { start: Date; end: Date },
): Promise<LabIncome['unassignedUse']> {
  const rows = await prisma.labStockMovement.findMany({
    where: {
      labOrgId,
      kind: 'USAGE',
      labJobId: null,
      occurredAt: { gte: range.start, lt: range.end },
    },
    include: { item: { select: { name: true, category: true, unit: true } } },
    orderBy: { occurredAt: 'desc' },
    take: LIST_CAP,
  });
  return rows.map((row) => ({
    name: row.item.name,
    category: row.item.category,
    quantity: formatQty(row.quantity.toString()),
    unit: row.item.unit,
    occurredOn: dayKey(row.occurredAt),
  }));
}

async function loadLowStock(labOrgId: string): Promise<LabIncome['lowStock']> {
  const rows = await prisma.labInventory.findMany({
    where: { labOrgId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return rows
    .filter((row) => milli(row.quantity.toString()) <= milli(row.reorderLevel.toString()))
    .map((row) => ({
      name: row.name,
      category: row.category,
      quantity: formatQty(row.quantity.toString()),
      unit: row.unit,
      reorderLevel: formatQty(row.reorderLevel.toString()),
    }));
}

type PartyMatch =
  | { kind: 'ALL' | 'SHOPS' | 'WALK_IN' }
  | { kind: 'CLIENT'; clientId: string; linkedOrgId: string | null };

async function resolveParty(labOrgId: string, party: string | undefined): Promise<PartyMatch> {
  if (!party || party === 'ALL') {
    return { kind: 'ALL' };
  }
  if (party === 'SHOPS') {
    return { kind: 'SHOPS' };
  }
  if (party === 'WALK_IN') {
    return { kind: 'WALK_IN' };
  }
  const client = await prisma.labClient.findFirst({
    where: { id: party, labOrgId, status: 'APPROVED' },
    select: { id: true, linkedOrgId: true },
  });
  if (!client) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Choose a client from this laboratory');
  }
  return { kind: 'CLIENT', clientId: client.id, linkedOrgId: client.linkedOrgId };
}

function saleDate(job: LoadedJob, range: { start: Date; end: Date }): Date | null {
  const finished = finishedAt(job);
  if (finished) {
    return finished >= range.start && finished < range.end ? finished : null;
  }
  const bill = job.labBill;
  if (!bill || (bill.status !== 'ISSUED' && bill.status !== 'CLEARED')) {
    return null;
  }
  const billed = bill.status === 'CLEARED' ? (bill.clearedAt ?? bill.issuedAt) : bill.issuedAt;
  if (!billed || billed < range.start || billed >= range.end) {
    return null;
  }
  return billed;
}

function settlement(
  status: 'ISSUED' | 'CLEARED',
  total: number,
  amountPaid: string,
): { collected: number; outstanding: number } {
  const recorded = moneyToCents(amountPaid);
  const collected =
    status === 'CLEARED' && recorded === 0 ? total : Math.min(Math.max(recorded, 0), total);
  return { collected, outstanding: Math.max(0, total - collected) };
}

function finishedAt(job: LoadedJob): Date | null {
  if (job.status === 'REJECTED' || job.status === 'CANCELLED' || job.status === 'OUTSOURCED') {
    return null;
  }
  if (job.completedAt) {
    return job.completedAt;
  }
  const ready = job.statusHistory.find(
    (entry) =>
      !isMarkedDoneNote(entry.notes) && (entry.status === 'READY' || entry.status === 'DISPATCHED'),
  );
  if (job.status === 'READY' || job.status === 'DISPATCHED') {
    return ready?.changedAt ?? job.updatedAt;
  }
  return null;
}

function finisherOf(job: LoadedJob): { id: string; name: string } {
  const marked = job.statusHistory.find((entry) => isMarkedDoneNote(entry.notes));
  const ready = job.statusHistory.find(
    (entry) => entry.status === 'READY' || entry.status === 'DISPATCHED',
  );
  const user = marked?.changedByUser ?? ready?.changedByUser;
  return user ? { id: user.id, name: user.name } : { id: 'unknown', name: 'Unknown' };
}

function materialCost(movements: LoadedJob['stockMovements']): { cents: number; missing: boolean } {
  let cents = 0;
  let missing = false;
  for (const movement of movements) {
    if (!movement.unitCost) {
      missing = true;
      continue;
    }
    cents += Math.round(
      (milli(movement.quantity.toString()) * moneyToCents(movement.unitCost.toFixed(2))) / 1000,
    );
  }
  return { cents, missing };
}

function shareLines(
  lines: readonly { name: string; quantity: number; base: number }[],
  income: number,
): Sale['lines'] {
  const base = lines.reduce((sum, line) => sum + line.base, 0);
  if (lines.length === 0 || base <= 0) {
    return lines.map((line) => ({ name: line.name, quantity: line.quantity, share: 0 }));
  }
  let used = 0;
  return lines.map((line, index) => {
    const share =
      index === lines.length - 1 ? income - used : Math.floor((income * line.base) / base);
    used += share;
    return { name: line.name, quantity: line.quantity, share };
  });
}

function incomePdf(report: LabIncome): Buffer {
  const moneyText = (value: string | null): string => (value === null ? 'No cost price' : value);
  return renderTablePdf({
    title: `Laboratory income ${report.from} to ${report.to}`,
    landscape: true,
    tables: [
      {
        columns: [
          'Finished sales',
          'Income',
          'Collected',
          'Outstanding',
          'Shop income',
          'Walk-in income',
          'Material cost',
          'Profit',
        ],
        widths: [1, 1, 1, 1, 1, 1, 1, 1],
        empty: 'No finished sales in this period.',
        rows: [
          [
            String(report.summary.finishedSales),
            report.summary.income,
            report.summary.collected,
            report.summary.outstanding,
            report.summary.shopIncome,
            report.summary.walkInIncome,
            moneyText(report.summary.materialCost),
            moneyText(report.summary.profit),
          ],
        ],
      },
      {
        columns: ['Date', 'Jobs', 'Income', 'Collected', 'Outstanding'],
        widths: [1.2, 0.8, 1, 1, 1],
        empty: 'No finished sales in this period.',
        rows: report.daily.map((row) => [
          row.date,
          String(row.jobs),
          row.income,
          row.collected,
          row.outstanding,
        ]),
      },
      {
        columns: ['Retailer', 'Jobs', 'Income', 'Outstanding', 'Average'],
        widths: [2, 0.7, 1, 1, 1],
        empty: 'No connected-shop sales in this period.',
        rows: report.retailers.map((row) => [
          row.name,
          String(row.jobs),
          row.income,
          row.outstanding,
          row.average,
        ]),
      },
      {
        columns: ['Client', 'Jobs', 'Income', 'Outstanding', 'Average'],
        widths: [2, 0.7, 1, 1, 1],
        empty: 'No walk-in sales in this period.',
        rows: report.clients.map((row) => [
          row.name,
          String(row.jobs),
          row.income,
          row.outstanding,
          row.average,
        ]),
      },
      {
        columns: ['Service', 'Jobs', 'Quantity', 'Income'],
        widths: [2, 0.8, 0.8, 1],
        empty: 'No services were billed in this period.',
        rows: report.services.map((row) => [
          row.name,
          String(row.jobs),
          String(row.quantity),
          row.income,
        ]),
      },
      {
        columns: ['Finished by', 'Jobs', 'Income'],
        widths: [2, 0.8, 1],
        empty: 'No finished sales in this period.',
        rows: report.finishers.map((row) => [row.name, String(row.jobs), row.income]),
      },
      {
        columns: [
          'Job',
          'Customer',
          'Party',
          'Finished',
          'Services',
          'Income',
          'Cost',
          'Profit',
          'Bill',
        ],
        widths: [1.2, 1.2, 1.3, 1, 1.6, 0.9, 0.9, 0.9, 0.8],
        empty: 'No finished sales in this period.',
        rows: report.sales.map((row) => [
          row.referenceNumber,
          row.customerName,
          row.partyName,
          row.finishedOn,
          row.services,
          row.income,
          row.costMissing ? 'No cost price' : moneyText(row.materialCost),
          moneyText(row.profit),
          row.billStatus === 'CLEARED' ? 'Paid' : 'Issued',
        ]),
      },
      {
        columns: ['Job', 'Customer', 'Party', 'Finished', 'Open bill'],
        widths: [1.2, 1.4, 1.6, 1, 1],
        empty: 'Every finished job in this period has been issued.',
        rows: report.openJobs.map((row) => [
          row.referenceNumber,
          row.customerName,
          row.partyName,
          row.finishedOn,
          row.total,
        ]),
      },
      {
        columns: ['Job', 'Customer', 'Party', 'Finished', 'Voided bill'],
        widths: [1.2, 1.4, 1.6, 1, 1],
        empty: 'No voided bills.',
        rows: report.voidedJobs.map((row) => [
          row.referenceNumber,
          row.customerName,
          row.partyName,
          row.finishedOn,
          row.total,
        ]),
      },
      {
        columns: ['Item', 'Category', 'Quantity', 'Unit', 'Jobs', 'Cost'],
        widths: [1.6, 1.2, 0.9, 0.7, 0.7, 1],
        empty: 'No stock was recorded against these sales.',
        rows: report.usedOnSales.map((row) => [
          row.name,
          row.category,
          row.quantity,
          row.unit,
          String(row.jobs),
          row.costMissing ? 'No cost price' : moneyText(row.cost),
        ]),
      },
      {
        columns: ['Item', 'Category', 'Quantity', 'Unit', 'Supplier', 'Date', 'Unit cost'],
        widths: [1.4, 1, 0.8, 0.6, 1.2, 1, 0.9],
        empty: 'No stock was received in this period.',
        rows: report.received.map((row) => [
          row.name,
          row.category,
          row.quantity,
          row.unit,
          row.supplier,
          row.occurredOn,
          moneyText(row.unitCost),
        ]),
      },
      {
        columns: ['Item', 'Category', 'Quantity', 'Unit', 'Date'],
        widths: [1.6, 1.2, 1, 0.8, 1],
        empty: 'No unassigned usage in this period.',
        rows: report.unassignedUse.map((row) => [
          row.name,
          row.category,
          row.quantity,
          row.unit,
          row.occurredOn,
        ]),
      },
      {
        columns: ['Item', 'Category', 'Quantity', 'Unit', 'Reorder level'],
        widths: [1.6, 1.2, 1, 0.8, 1],
        empty: 'Nothing is at the reorder level.',
        rows: report.lowStock.map((row) => [
          row.name,
          row.category,
          row.quantity,
          row.unit,
          row.reorderLevel,
        ]),
      },
    ],
  });
}

async function incomeWorkbook(report: LabIncome): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  addSheet(
    workbook,
    'Summary',
    ['Measure', 'Value'],
    [
      ['Finished sales', String(report.summary.finishedSales)],
      ['Income', report.summary.income],
      ['Discount', report.summary.discount],
      ['Adjustments', report.summary.adjustments],
      ['Collected', report.summary.collected],
      ['Outstanding', report.summary.outstanding],
      ['Shop income', report.summary.shopIncome],
      ['Walk-in income', report.summary.walkInIncome],
      ['Material cost', report.summary.materialCost ?? 'No cost price'],
      ['Profit', report.summary.profit ?? 'No cost price'],
      ['Open on finished jobs', String(report.summary.openOnFinished)],
      ['Open bill value', report.summary.openValue],
      ['Voided', String(report.summary.voided)],
    ],
  );
  addSheet(
    workbook,
    'Daily',
    ['Date', 'Jobs', 'Income', 'Collected', 'Outstanding'],
    report.daily.map((row) => [
      row.date,
      String(row.jobs),
      row.income,
      row.collected,
      row.outstanding,
    ]),
  );
  addSheet(
    workbook,
    'Retailers',
    ['Retailer', 'Jobs', 'Income', 'Outstanding', 'Average'],
    report.retailers.map((row) => [
      row.name,
      String(row.jobs),
      row.income,
      row.outstanding,
      row.average,
    ]),
  );
  addSheet(
    workbook,
    'Clients',
    ['Client', 'Jobs', 'Income', 'Outstanding', 'Average'],
    report.clients.map((row) => [
      row.name,
      String(row.jobs),
      row.income,
      row.outstanding,
      row.average,
    ]),
  );
  addSheet(
    workbook,
    'Services',
    ['Service', 'Jobs', 'Quantity', 'Income'],
    report.services.map((row) => [row.name, String(row.jobs), String(row.quantity), row.income]),
  );
  addSheet(
    workbook,
    'Finished by',
    ['Finished by', 'Jobs', 'Income'],
    report.finishers.map((row) => [row.name, String(row.jobs), row.income]),
  );
  addSheet(
    workbook,
    'Sales',
    [
      'Job',
      'Customer',
      'Party',
      'Finished',
      'Services',
      'Income',
      'Cost',
      'Profit',
      'Bill',
      'Finished by',
    ],
    report.sales.map((row) => [
      row.referenceNumber,
      row.customerName,
      row.partyName,
      row.finishedOn,
      row.services,
      row.income,
      row.costMissing ? 'No cost price' : (row.materialCost ?? '0.00'),
      row.profit ?? 'No cost price',
      row.billStatus === 'CLEARED' ? 'Paid' : 'Issued',
      row.finishedBy,
    ]),
  );
  addSheet(
    workbook,
    'Open bills',
    ['Job', 'Customer', 'Party', 'Finished', 'Open bill'],
    report.openJobs.map((row) => [
      row.referenceNumber,
      row.customerName,
      row.partyName,
      row.finishedOn,
      row.total,
    ]),
  );
  addSheet(
    workbook,
    'Materials used',
    ['Item', 'Category', 'Quantity', 'Unit', 'Jobs', 'Cost'],
    report.usedOnSales.map((row) => [
      row.name,
      row.category,
      row.quantity,
      row.unit,
      String(row.jobs),
      row.costMissing ? 'No cost price' : (row.cost ?? '0.00'),
    ]),
  );
  addSheet(
    workbook,
    'Received',
    ['Item', 'Category', 'Quantity', 'Unit', 'Supplier', 'Date', 'Unit cost'],
    report.received.map((row) => [
      row.name,
      row.category,
      row.quantity,
      row.unit,
      row.supplier,
      row.occurredOn,
      row.unitCost ?? 'No cost price',
    ]),
  );
  addSheet(
    workbook,
    'Unassigned use',
    ['Item', 'Category', 'Quantity', 'Unit', 'Date'],
    report.unassignedUse.map((row) => [
      row.name,
      row.category,
      row.quantity,
      row.unit,
      row.occurredOn,
    ]),
  );
  addSheet(
    workbook,
    'Low stock',
    ['Item', 'Category', 'Quantity', 'Unit', 'Reorder level'],
    report.lowStock.map((row) => [
      row.name,
      row.category,
      row.quantity,
      row.unit,
      row.reorderLevel,
    ]),
  );
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function addSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: string[][],
): void {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(row);
  }
  if (rows.length === 0) {
    sheet.addRow(['None']);
  }
  sheet.columns = headers.map((header) => ({ width: Math.max(header.length + 4, 16) }));
  styleSheet(sheet);
}

function signedCents(value: string): number {
  const negative = value.trim().startsWith('-');
  const cents = moneyToCents(negative ? value.trim().slice(1) : value);
  return negative ? -cents : cents;
}

function milli(value: string): number {
  const [whole, fraction = ''] = value.split('.');
  const padded = `${fraction}000`.slice(0, 3);
  return Number(whole) * 1000 + Number(padded);
}

function fromMilli(value: number): string {
  const whole = Math.trunc(value / 1000);
  const fraction = String(Math.abs(value) % 1000).padStart(3, '0');
  return formatQty(`${whole}.${fraction}`);
}

function formatQty(value: string): string {
  if (!value.includes('.')) {
    return value;
  }
  return value.replace(/0+$/, '').replace(/\.$/, '');
}

function parseRange(from: string, to: string): { start: Date; end: Date } {
  if (from > to) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The start date must be on or before the end date');
  }
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS);
  if ((end.getTime() - start.getTime()) / DAY_MS > MAX_DAYS) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Choose a range of 366 days or fewer');
  }
  return { start, end };
}

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function requireLabAdmin(auth: AuthSessionUser): string {
  if (auth.orgType !== 'LABORATORY' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This action is available to laboratories');
  }
  if (auth.role !== 'ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'Income is available to the laboratory admin');
  }
  return auth.orgId;
}
