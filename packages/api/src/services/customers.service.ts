import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  moneyToCents,
  type AuthSessionUser,
  type CreateCustomerRequest,
  type CustomerCreditBills,
  type CustomerLedger,
  type CustomerListItem,
  type CustomerListQuery,
  type CustomerProfile,
  type CustomerRecord,
  type ItemPrescription,
  type LinePrescriptionInput,
  type PageMeta,
  type RecordPaymentRequest,
  type SavedPrescription,
  type RecordPaymentResult,
  type UpdateCustomerRequest,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';

type InvoiceRow = {
  id: string;
  invoiceNumber: number;
  status: 'PAID' | 'CREDIT';
  cancelledAt: Date | null;
  reviewReason: string | null;
  total: { toFixed: (digits: number) => string };
  issuedAt: Date;
  payments: readonly {
    id: string;
    amount: { toFixed: (digits: number) => string };
    recordedAt: Date;
    method: string;
  }[];
};

const OPENING_CREDIT = 'Opening credit';

export async function listCustomers(
  auth: AuthSessionUser,
  query: CustomerListQuery,
): Promise<{ rows: CustomerListItem[]; meta: PageMeta }> {
  const orgId = requiredRetailerOrgId(auth);
  const customers = await prisma.customer.findMany({
    where: {
      orgId,
      deletedAt: null,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      gender: true,
      dateOfBirth: true,
      invoices: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          cancelledAt: true,
          reviewReason: true,
          total: true,
          issuedAt: true,
          payments: { select: { amount: true } },
        },
      },
    },
  });

  const rows = customers
    .map((customer) => toListItem(customer))
    .filter((row) => matchesDues(row.outstanding, query.dues))
    .filter((row) => matchesListFilters(row, query))
    .sort((left, right) => compareCustomers(left, right, query.sort));
  const start = (query.page - 1) * query.limit;
  return {
    rows: rows.slice(start, start + query.limit),
    meta: { total: rows.length, page: query.page, limit: query.limit },
  };
}

export async function createCustomer(
  auth: AuthSessionUser,
  input: CreateCustomerRequest,
): Promise<CustomerRecord> {
  const orgId = requiredRetailerOrgId(auth);
  const creditCents = moneyToCents(input.currentCredit);
  const created = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: {
        orgId,
        name: input.name,
        phone: blank(input.phone),
        whatsappNumber: input.whatsappNumber,
        email: blank(input.email),
        gender: input.gender ?? null,
        dateOfBirth: toDateOnly(input.dateOfBirth),
        referredBy: input.referredBy ?? null,
        address: input.address ?? null,
        creditLimit: centsToMoney(moneyToCents(input.creditLimit)),
        notes: input.notes ?? null,
      },
      select: { id: true },
    });
    if (creditCents > 0) {
      const invoiceNumber = await nextInvoiceNumber(tx, orgId);
      await tx.invoice.create({
        data: {
          orgId,
          customerId: customer.id,
          status: 'CREDIT',
          total: centsToMoney(creditCents),
          discount: '0.00',
          paymentType: 'CREDIT',
          invoiceNumber,
          isOffline: false,
          issuedAt: new Date(),
          syncedAt: new Date(),
          reviewReason: OPENING_CREDIT,
          items: {
            create: {
              productName: OPENING_CREDIT,
              priceCode: 'OPENING',
              quantity: 1,
              unitPrice: centsToMoney(creditCents),
              salePrice: centsToMoney(creditCents),
            },
          },
        },
      });
      await tx.auditLog.create({
        data: {
          orgId,
          userId: auth.userId,
          action: 'CUSTOMER_OPENING_CREDIT',
          entityType: 'Customer',
          entityId: customer.id,
          metadata: { amount: centsToMoney(creditCents) },
        },
      });
    }
    return customer;
  });
  return getCustomerRecord(auth, created.id);
}

export async function getCustomer(
  auth: AuthSessionUser,
  customerId: string,
): Promise<CustomerProfile> {
  const orgId = requiredRetailerOrgId(auth);
  const customer = await loadCustomer(orgId, customerId);
  const invoiceIds = customer.invoices.map((invoice) => invoice.id);
  const [jobs, saved, reminders] = await Promise.all([
    prisma.labJob.findMany({
      where: { retailerOrgId: orgId, retailerInvoiceId: { in: invoiceIds } },
      select: {
        id: true,
        referenceNumber: true,
        createdAt: true,
        retailerInvoiceId: true,
        prescription: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.customerPrescription.findMany({
      where: { orgId, customerId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.findMany({
      where: {
        orgId,
        action: { in: ['WHATSAPP_RECEIPT_SENT', 'WHATSAPP_PAYMENT_REMINDER_SENT'] },
        entityId: { in: [...invoiceIds, customerId] },
      },
      select: { id: true, action: true, createdAt: true, entityId: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const record = summarize(customer);
  const invoices = [...customer.invoices]
    .filter((invoice) => invoice.cancelledAt === null && !isOpeningCredit(invoice))
    .sort((left, right) => right.issuedAt.getTime() - left.issuedAt.getTime());
  return {
    ...record,
    prescriptions: [
      ...saved.map((record) => ({
        id: record.id,
        referenceNumber: 'Saved',
        createdAt: record.createdAt.toISOString(),
        invoiceId: null,
        summary: readingSummaryPayload(record).summary,
      })),
      ...jobs.map((job) => ({
        id: job.id,
        referenceNumber: job.referenceNumber,
        createdAt: job.createdAt.toISOString(),
        invoiceId: job.retailerInvoiceId,
        summary: prescriptionSummary(job.prescription),
      })),
    ],
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt.toISOString(),
      status: invoice.status,
      total: money(invoice.total),
    })),
    activity: buildActivity(customer.invoices, jobs, reminders),
  };
}

export async function updateCustomer(
  auth: AuthSessionUser,
  customerId: string,
  input: UpdateCustomerRequest,
): Promise<CustomerRecord> {
  const orgId = requiredRetailerOrgId(auth);
  await loadCustomer(orgId, customerId);
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: blank(input.phone) } : {}),
      ...(input.whatsappNumber !== undefined
        ? { whatsappNumber: blank(input.whatsappNumber) }
        : {}),
      ...(input.email !== undefined ? { email: blank(input.email) } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.dateOfBirth !== undefined ? { dateOfBirth: toDateOnly(input.dateOfBirth) } : {}),
      ...(input.referredBy !== undefined ? { referredBy: input.referredBy ?? null } : {}),
      ...(input.address !== undefined ? { address: input.address ?? null } : {}),
      ...(input.creditLimit !== undefined
        ? { creditLimit: centsToMoney(moneyToCents(input.creditLimit)) }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
    },
  });
  return getCustomerRecord(auth, customerId);
}

export async function deleteCustomer(auth: AuthSessionUser, customerId: string): Promise<void> {
  const orgId = requiredRetailerOrgId(auth);
  const existing = await loadCustomer(orgId, customerId);
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'CUSTOMER_REMOVED',
        entityType: 'Customer',
        entityId: existing.id,
        metadata: { name: existing.name },
      },
    });
  });
}

export async function listCustomerCreditBills(
  auth: AuthSessionUser,
  customerId: string,
): Promise<CustomerCreditBills> {
  const orgId = requiredRetailerOrgId(auth);
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!customer) {
    throw new AppError(404, 'NOT_FOUND', 'Customer was not found');
  }
  const invoices = await prisma.invoice.findMany({
    where: { orgId, customerId, status: 'CREDIT', cancelledAt: null },
    orderBy: { issuedAt: 'asc' },
    select: {
      id: true,
      invoiceNumber: true,
      reviewReason: true,
      issuedAt: true,
      total: true,
      payments: {
        select: { amount: true, recordedAt: true, notes: true },
        orderBy: { recordedAt: 'asc' },
      },
    },
  });
  const bills = invoices.flatMap((invoice) => {
    const paid = invoice.payments.reduce(
      (sum, payment) => sum + moneyToCents(money(payment.amount)),
      0,
    );
    const due = Math.max(0, moneyToCents(money(invoice.total)) - paid);
    if (due <= 0) {
      return [];
    }
    return [
      {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        label:
          invoice.reviewReason === OPENING_CREDIT
            ? OPENING_CREDIT
            : `Invoice #${invoice.invoiceNumber}`,
        issuedAt: invoice.issuedAt.toISOString(),
        total: money(invoice.total),
        amountPaid: centsToMoney(paid),
        outstanding: centsToMoney(due),
        payments: invoice.payments.map((payment) => ({
          amount: money(payment.amount),
          recordedAt: payment.recordedAt.toISOString(),
          notes: payment.notes,
        })),
      },
    ];
  });
  const outstanding = bills.reduce((sum, bill) => sum + moneyToCents(bill.outstanding), 0);
  return { outstanding: centsToMoney(outstanding), bills };
}

export async function getCustomerLedger(
  auth: AuthSessionUser,
  customerId: string,
): Promise<CustomerLedger> {
  const orgId = requiredRetailerOrgId(auth);
  const customer = await loadCustomer(orgId, customerId);
  const actors = await ledgerActors(orgId, customer.id, customer.invoices);
  return {
    outstanding: summarize(customer).outstanding,
    entries: ledgerEntries(customer.invoices, actors),
  };
}

export async function recordCustomerPayment(
  auth: AuthSessionUser,
  customerId: string,
  input: RecordPaymentRequest,
): Promise<RecordPaymentResult> {
  const orgId = requiredRetailerOrgId(auth);
  const amount = moneyToCents(input.amount);
  if (amount <= 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Enter a payment amount');
  }
  const paymentIds = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: customerId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!customer) {
      throw new AppError(404, 'NOT_FOUND', 'Customer was not found');
    }
    const invoices = await tx.invoice.findMany({
      where: { orgId, customerId, status: 'CREDIT', cancelledAt: null },
      orderBy: { issuedAt: 'asc' },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        payments: { select: { amount: true } },
      },
    });
    let remaining = amount;
    const allocations: { invoiceId: string; cents: number; clears: boolean }[] = [];
    for (const invoice of invoices) {
      const paid = invoice.payments.reduce(
        (sum, payment) => sum + moneyToCents(money(payment.amount)),
        0,
      );
      const due = Math.max(0, moneyToCents(money(invoice.total)) - paid);
      const take = Math.min(due, remaining);
      if (take > 0) {
        allocations.push({ invoiceId: invoice.id, cents: take, clears: take === due });
        remaining -= take;
      }
    }
    if (allocations.length === 0 || remaining > 0) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        'The amount is larger than the outstanding balance',
      );
    }
    const ids: string[] = [];
    for (const allocation of allocations) {
      const created = await tx.payment.create({
        data: {
          customerId,
          invoiceId: allocation.invoiceId,
          orgId,
          amount: centsToMoney(allocation.cents),
          method: input.method,
          notes:
            input.notes && input.notes.trim().length > 0 ? input.notes.trim() : 'Amount received',
          recordedAt: new Date(input.recordedAt),
        },
        select: { id: true },
      });
      ids.push(created.id);
      if (allocation.clears) {
        await tx.invoice.update({
          where: { id: allocation.invoiceId },
          data: { status: 'PAID' },
        });
      }
    }
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'CUSTOMER_PAYMENT_RECORDED',
        entityType: 'Customer',
        entityId: customerId,
        metadata: { amount: input.amount, method: input.method, paymentIds: ids },
      },
    });
    return ids;
  });
  const ledger = await getCustomerLedger(auth, customerId);
  return { outstanding: ledger.outstanding, paymentIds };
}

async function getCustomerRecord(
  auth: AuthSessionUser,
  customerId: string,
): Promise<CustomerRecord> {
  const orgId = requiredRetailerOrgId(auth);
  return summarize(await loadCustomer(orgId, customerId));
}

async function loadCustomer(orgId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, orgId, deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      whatsappNumber: true,
      email: true,
      gender: true,
      dateOfBirth: true,
      referredBy: true,
      address: true,
      creditLimit: true,
      notes: true,
      invoices: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          cancelledAt: true,
          reviewReason: true,
          total: true,
          issuedAt: true,
          payments: { select: { id: true, amount: true, recordedAt: true, method: true } },
        },
      },
    },
  });
  if (!customer) {
    throw new AppError(404, 'NOT_FOUND', 'Customer was not found');
  }
  return customer;
}

function summarize(customer: {
  id: string;
  name: string;
  phone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  dateOfBirth: Date | null;
  referredBy: string | null;
  address: string | null;
  creditLimit: { toFixed: (digits: number) => string };
  notes: string | null;
  invoices: readonly InvoiceRow[];
}): CustomerRecord {
  const kept = customer.invoices.filter((invoice) => invoice.cancelledAt === null);
  const sales = kept.filter((invoice) => !isOpeningCredit(invoice));
  const totalSpent = sales.reduce((sum, invoice) => sum + moneyToCents(money(invoice.total)), 0);
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    whatsappNumber: customer.whatsappNumber,
    email: customer.email,
    gender: customer.gender,
    dateOfBirth: formatDateOnly(customer.dateOfBirth),
    referredBy: customer.referredBy,
    address: customer.address,
    creditLimit: money(customer.creditLimit),
    notes: customer.notes,
    outstanding: centsToMoney(outstandingCents(kept)),
    totalSpent: centsToMoney(totalSpent),
    invoiceCount: sales.length,
  };
}

function toListItem(customer: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  dateOfBirth: Date | null;
  invoices: readonly {
    id: string;
    invoiceNumber: number;
    status: 'PAID' | 'CREDIT';
    cancelledAt: Date | null;
    reviewReason: string | null;
    total: { toFixed: (digits: number) => string };
    issuedAt: Date;
    payments: readonly { amount: { toFixed: (digits: number) => string } }[];
  }[];
}): CustomerListItem {
  const kept = customer.invoices.filter((invoice) => invoice.cancelledAt === null);
  const sales = kept.filter((invoice) => !isOpeningCredit(invoice));
  const latest = [...sales].sort(
    (left, right) => right.issuedAt.getTime() - left.issuedAt.getTime(),
  )[0];
  const total = sales.reduce((sum, invoice) => sum + moneyToCents(money(invoice.total)), 0);
  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    gender: customer.gender,
    dateOfBirth: formatDateOnly(customer.dateOfBirth),
    totalPurchases: centsToMoney(total),
    outstanding: centsToMoney(outstandingCents(kept)),
    lastInvoice: latest
      ? {
          id: latest.id,
          invoiceNumber: latest.invoiceNumber,
          issuedAt: latest.issuedAt.toISOString(),
        }
      : null,
  };
}

function outstandingCents(
  invoices: readonly {
    status: 'PAID' | 'CREDIT';
    total: { toFixed: (digits: number) => string };
    payments: readonly { amount: { toFixed: (digits: number) => string } }[];
  }[],
): number {
  return invoices.reduce((sum, invoice) => {
    if (invoice.status !== 'CREDIT') {
      return sum;
    }
    const paid = invoice.payments.reduce(
      (paidSum, payment) => paidSum + moneyToCents(money(payment.amount)),
      0,
    );
    return sum + Math.max(0, moneyToCents(money(invoice.total)) - paid);
  }, 0);
}

const SALE_AUDIT_ACTIONS = [
  'POS_INVOICE_CREATED',
  'OFFLINE_INVOICE_SYNCED',
  'OFFLINE_INVOICE_REPLACED',
] as const;
const SAME_SALE_WINDOW_MS = 2 * 60 * 1000;

type LedgerActors = {
  invoiceBy: ReadonlyMap<string, string>;
  paymentBy: ReadonlyMap<string, string>;
};

function amountFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null || !('amount' in metadata)) {
    return null;
  }
  return typeof metadata.amount === 'string' ? metadata.amount : null;
}

function paymentIdsFromMetadata(metadata: unknown): string[] {
  if (typeof metadata !== 'object' || metadata === null || !('paymentIds' in metadata)) {
    return [];
  }
  const ids = metadata.paymentIds;
  if (!Array.isArray(ids)) {
    return [];
  }
  return ids.filter((id): id is string => typeof id === 'string');
}

async function ledgerActors(
  orgId: string,
  customerId: string,
  invoices: readonly InvoiceRow[],
): Promise<LedgerActors> {
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const audits = await prisma.auditLog.findMany({
    where: {
      orgId,
      OR: [
        ...(invoiceIds.length === 0
          ? []
          : [
              {
                entityType: 'Invoice' as const,
                entityId: { in: invoiceIds },
                action: { in: [...SALE_AUDIT_ACTIONS, 'INVOICE_CREDIT_CLEARED'] },
              },
            ]),
        {
          entityType: 'Customer',
          entityId: customerId,
          action: { in: ['CUSTOMER_PAYMENT_RECORDED', 'CUSTOMER_OPENING_CREDIT'] },
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      action: true,
      entityId: true,
      createdAt: true,
      metadata: true,
      user: { select: { name: true } },
    },
  });
  const invoiceBy = new Map<string, string>();
  const paymentBy = new Map<string, string>();
  let openingBy: string | null = null;
  for (const audit of audits) {
    const name = audit.user?.name ?? null;
    if (!name || !audit.entityId) {
      continue;
    }
    if (audit.action === 'CUSTOMER_OPENING_CREDIT') {
      openingBy = name;
      continue;
    }
    if (audit.action === 'CUSTOMER_PAYMENT_RECORDED') {
      for (const paymentId of paymentIdsFromMetadata(audit.metadata)) {
        paymentBy.set(paymentId, name);
      }
      continue;
    }
    if (
      (SALE_AUDIT_ACTIONS as readonly string[]).includes(audit.action) &&
      !invoiceBy.has(audit.entityId)
    ) {
      invoiceBy.set(audit.entityId, name);
      continue;
    }
    if (audit.action !== 'INVOICE_CREDIT_CLEARED') {
      continue;
    }
    const invoice = invoices.find((row) => row.id === audit.entityId);
    const expected = amountFromMetadata(audit.metadata);
    const payment = invoice?.payments.reduce<{ id: string; gap: number } | null>((best, row) => {
      if (paymentBy.has(row.id)) {
        return best;
      }
      if (expected !== null && money(row.amount) !== expected) {
        return best;
      }
      const gap = Math.abs(row.recordedAt.getTime() - audit.createdAt.getTime());
      if (gap > SAME_SALE_WINDOW_MS) {
        return best;
      }
      if (!best || gap < best.gap) {
        return { id: row.id, gap };
      }
      return best;
    }, null);
    if (payment) {
      paymentBy.set(payment.id, name);
    }
  }
  if (openingBy) {
    for (const invoice of invoices) {
      if (isOpeningCredit(invoice)) {
        invoiceBy.set(invoice.id, openingBy);
      }
    }
  }
  return { invoiceBy, paymentBy };
}

function ledgerEntries(
  invoices: readonly InvoiceRow[],
  actors: LedgerActors,
): CustomerLedger['entries'] {
  const events: {
    id: string;
    at: Date;
    kind: 'DEBIT' | 'CREDIT';
    label: string;
    cents: number;
    invoiceId: string | null;
    order: number;
    handledBy: string | null;
  }[] = [];
  for (const invoice of invoices) {
    events.push({
      id: `invoice-${invoice.id}`,
      at: invoice.issuedAt,
      kind: 'DEBIT',
      label: isOpeningCredit(invoice) ? OPENING_CREDIT : `Invoice #${invoice.invoiceNumber}`,
      cents: moneyToCents(money(invoice.total)),
      invoiceId: invoice.id,
      order: 0,
      handledBy: actors.invoiceBy.get(invoice.id) ?? null,
    });
    for (const payment of invoice.payments) {
      const withTheSale =
        Math.abs(payment.recordedAt.getTime() - invoice.issuedAt.getTime()) <= SAME_SALE_WINDOW_MS;
      events.push({
        id: `payment-${payment.id}`,
        at: payment.recordedAt,
        kind: 'CREDIT',
        label: `Payment · ${paymentLabel(payment.method)}`,
        cents: moneyToCents(money(payment.amount)),
        invoiceId: invoice.id,
        order: 1,
        handledBy:
          actors.paymentBy.get(payment.id) ??
          (withTheSale ? (actors.invoiceBy.get(invoice.id) ?? null) : null),
      });
    }
  }
  events.sort((left, right) => left.at.getTime() - right.at.getTime() || left.order - right.order);
  let balance = 0;
  return events.map((event) => {
    balance += event.kind === 'DEBIT' ? event.cents : -event.cents;
    return {
      id: event.id,
      at: event.at.toISOString(),
      kind: event.kind,
      label: event.label,
      amount: centsToMoney(event.cents),
      balance: centsToMoney(balance),
      invoiceId: event.invoiceId,
      handledBy: event.handledBy,
    };
  });
}

function buildActivity(
  invoices: readonly InvoiceRow[],
  jobs: readonly { id: string; referenceNumber: string; createdAt: Date }[],
  reminders: readonly { id: string; createdAt: Date; action: string }[],
): CustomerProfile['activity'] {
  const events: CustomerProfile['activity'] = [
    ...invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      kind: 'INVOICE' as const,
      at: invoice.issuedAt.toISOString(),
      title: isOpeningCredit(invoice) ? OPENING_CREDIT : `Invoice #${invoice.invoiceNumber}`,
      detail: `${invoice.status === 'PAID' ? 'Paid' : 'On credit'} · ${centsToMoney(moneyToCents(money(invoice.total)))}`,
    })),
    ...invoices.flatMap((invoice) =>
      invoice.payments.map((payment) => ({
        id: `payment-${payment.id}`,
        kind: 'PAYMENT' as const,
        at: payment.recordedAt.toISOString(),
        title: 'Payment recorded',
        detail: `${paymentLabel(payment.method)} · ${centsToMoney(moneyToCents(money(payment.amount)))}`,
      })),
    ),
    ...jobs.map((job) => ({
      id: `rx-${job.id}`,
      kind: 'PRESCRIPTION' as const,
      at: job.createdAt.toISOString(),
      title: 'Prescription added',
      detail: job.referenceNumber,
    })),
    ...reminders.map((reminder) => ({
      id: `reminder-${reminder.id}`,
      kind: 'REMINDER' as const,
      at: reminder.createdAt.toISOString(),
      title: 'Reminder sent',
      detail:
        reminder.action === 'WHATSAPP_RECEIPT_SENT'
          ? 'Receipt sent on WhatsApp'
          : 'Payment reminder sent',
    })),
  ];
  return events.sort((left, right) => right.at.localeCompare(left.at));
}

function matchesListFilters(row: CustomerListItem, query: CustomerListQuery): boolean {
  if (query.gender && row.gender !== query.gender) {
    return false;
  }
  if (query.minAge !== undefined || query.maxAge !== undefined) {
    const age = ageYears(row.dateOfBirth);
    if (age === null) {
      return false;
    }
    if (query.minAge !== undefined && age < query.minAge) {
      return false;
    }
    if (query.maxAge !== undefined && age > query.maxAge) {
      return false;
    }
  }
  const due = moneyToCents(row.outstanding);
  if (query.minOutstanding !== undefined && due < moneyToCents(query.minOutstanding)) {
    return false;
  }
  if (query.maxOutstanding !== undefined && due > moneyToCents(query.maxOutstanding)) {
    return false;
  }
  return true;
}

function ageYears(value: string | null, now = new Date()): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const born = new Date(`${value}T00:00:00`);
  let years = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) {
    years -= 1;
  }
  return years >= 0 ? years : null;
}

function matchesDues(outstanding: string, dues: CustomerListQuery['dues']): boolean {
  const cents = moneyToCents(outstanding);
  if (dues === 'HAS_DUES') {
    return cents > 0;
  }
  if (dues === 'NO_DUES') {
    return cents === 0;
  }
  return true;
}

function compareCustomers(
  left: CustomerListItem,
  right: CustomerListItem,
  sort: CustomerListQuery['sort'],
): number {
  if (sort === 'HIGHEST_DUES') {
    return (
      moneyToCents(right.outstanding) - moneyToCents(left.outstanding) ||
      left.name.localeCompare(right.name)
    );
  }
  if (sort === 'RECENT') {
    const leftAt = left.lastInvoice?.issuedAt ?? '';
    const rightAt = right.lastInvoice?.issuedAt ?? '';
    return rightAt.localeCompare(leftAt) || left.name.localeCompare(right.name);
  }
  return left.name.localeCompare(right.name);
}

export async function listCustomerPrescriptions(
  auth: AuthSessionUser,
  customerId: string,
): Promise<SavedPrescription[]> {
  const orgId = requiredRetailerOrgId(auth);
  await loadCustomer(orgId, customerId);
  const invoiceIds = (
    await prisma.invoice.findMany({
      where: { orgId, customerId },
      select: { id: true },
    })
  ).map((invoice) => invoice.id);
  const [saved, jobs] = await Promise.all([
    prisma.customerPrescription.findMany({
      where: { orgId, customerId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.labJob.findMany({
      where: { retailerOrgId: orgId, retailerInvoiceId: { in: invoiceIds } },
      select: { id: true, prescription: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  return [
    ...saved.map((row) => savedChoice(row, 'SAVED')),
    ...jobs.map((job) =>
      savedChoice(readingFromUnknown(job.prescription, job.id, job.createdAt), 'LAB_JOB'),
    ),
  ];
}

export async function createCustomerPrescription(
  auth: AuthSessionUser,
  customerId: string,
  input: ItemPrescription,
): Promise<SavedPrescription> {
  const orgId = requiredRetailerOrgId(auth);
  await loadCustomer(orgId, customerId);
  const created = await prisma.customerPrescription.create({
    data: {
      orgId,
      customerId,
      right: input.right,
      left: input.left,
      add: input.add,
      pd: input.pd,
      notes: input.notes.length > 0 ? input.notes : null,
    },
  });
  return savedChoice(created, 'SAVED');
}

export async function updateCustomerPrescription(
  auth: AuthSessionUser,
  customerId: string,
  prescriptionId: string,
  input: ItemPrescription,
): Promise<SavedPrescription> {
  const orgId = requiredRetailerOrgId(auth);
  await loadCustomer(orgId, customerId);
  const existing = await prisma.customerPrescription.findFirst({
    where: { id: prescriptionId, orgId, customerId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'This saved prescription was not found');
  }
  const updated = await prisma.customerPrescription.update({
    where: { id: existing.id },
    data: {
      right: input.right,
      left: input.left,
      add: input.add,
      pd: input.pd,
      notes: input.notes.length > 0 ? input.notes : null,
    },
  });
  return savedChoice(updated, 'SAVED');
}

export async function persistLinePrescription(
  orgId: string,
  customerId: string,
  input: LinePrescriptionInput,
): Promise<ItemPrescription & { summary: string; labOrgId?: string }> {
  if (input.savedId) {
    const saved = await prisma.customerPrescription.findFirst({
      where: { id: input.savedId, orgId, customerId },
    });
    if (saved) {
      return withLab(readingSummaryPayload(saved), input.labOrgId);
    }
    const job = await prisma.labJob.findFirst({
      where: { id: input.savedId, retailerOrgId: orgId, retailerInvoice: { customerId, orgId } },
      select: { id: true, prescription: true, createdAt: true },
    });
    if (!job) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Choose a prescription saved for this customer');
    }
    return withLab(
      readingSummaryPayload(readingFromUnknown(job.prescription, job.id, job.createdAt)),
      input.labOrgId,
    );
  }
  const created = input.remember
    ? await prisma.customerPrescription.create({
        data: {
          orgId,
          customerId,
          right: input.right,
          left: input.left,
          add: input.add,
          pd: input.pd,
          notes: input.notes.length > 0 ? input.notes : null,
        },
      })
    : null;
  return withLab(
    {
      ...readingSummaryPayload({
        right: input.right,
        left: input.left,
        add: input.add,
        pd: input.pd,
        notes: input.notes,
      }),
      ...(created ? { savedId: created.id } : {}),
    },
    input.labOrgId,
  );
}

function withLab<T extends object>(
  value: T,
  labOrgId: string | undefined,
): T & { labOrgId?: string } {
  return labOrgId ? { ...value, labOrgId } : value;
}

function savedChoice(
  row: {
    id: string;
    right: unknown;
    left: unknown;
    add: string;
    pd: string;
    notes: string | null;
    createdAt: Date;
  },
  source: SavedPrescription['source'],
): SavedPrescription {
  const reading = {
    right: eyeReading(row.right),
    left: eyeReading(row.left),
    add: row.add,
    pd: row.pd,
    notes: row.notes ?? '',
  };
  return {
    id: row.id,
    source,
    createdAt: row.createdAt.toISOString(),
    summary: readingSummary(reading),
    ...reading,
  };
}

function readingFromUnknown(
  value: unknown,
  id: string,
  createdAt: Date,
): {
  id: string;
  right: unknown;
  left: unknown;
  add: string;
  pd: string;
  notes: string | null;
  createdAt: Date;
} {
  const record = asRecord(value);
  const right = asRecord(record.right ?? record.rightEye);
  const left = asRecord(record.left ?? record.leftEye);
  return {
    id,
    right,
    left,
    add: textValue(record.add),
    pd: textValue(record.pd ?? record.pupillaryDistance),
    notes: textValue(record.notes) || null,
    createdAt,
  };
}

function readingSummaryPayload(row: {
  right: unknown;
  left: unknown;
  add: string;
  pd: string;
  notes: string | null;
}): ItemPrescription & { summary: string } {
  const reading = {
    right: eyeReading(row.right),
    left: eyeReading(row.left),
    add: row.add,
    pd: row.pd,
    notes: row.notes ?? '',
  };
  return { ...reading, summary: readingSummary(reading) };
}

function readingSummary(value: ItemPrescription): string {
  return `R ${eyeText(value.right)} · L ${eyeText(value.left)}`;
}

function eyeText(eye: ItemPrescription['right']): string {
  const sphere = eye.sphere || '—';
  const cylinder = eye.cylinder || '—';
  const axis = eye.axis || '—';
  return `${sphere} / ${cylinder} × ${axis}`;
}

function eyeReading(value: unknown): ItemPrescription['right'] {
  const record = asRecord(value);
  return {
    sphere: textValue(record.sphere),
    cylinder: textValue(record.cylinder),
    axis: textValue(record.axis),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function textValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

function prescriptionSummary(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    return 'Prescription on file';
  }
  const record = value as { right?: { sphere?: unknown }; left?: { sphere?: unknown } };
  const right =
    typeof record.right?.sphere === 'string' && record.right.sphere ? record.right.sphere : '—';
  const left =
    typeof record.left?.sphere === 'string' && record.left.sphere ? record.left.sphere : '—';
  return `R ${right} · L ${left}`;
}

function paymentLabel(method: string): string {
  if (method === 'BANK_TRANSFER') {
    return 'Bank transfer';
  }
  if (method === 'OTHER') {
    return 'Other';
  }
  if (method === 'CASH') {
    return 'Cash';
  }
  return method;
}

function blank(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

function isOpeningCredit(invoice: { reviewReason?: string | null }): boolean {
  return invoice.reviewReason === OPENING_CREDIT;
}

async function nextInvoiceNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  orgId: string,
): Promise<number> {
  const sequence = await tx.invoiceSequence.upsert({
    where: { orgId },
    create: { orgId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return sequence.lastNumber;
}

function toDateOnly(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date | null): string | null {
  if (!value) {
    return null;
  }
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function money(value: { toFixed: (digits: number) => string }): string {
  return value.toFixed(2);
}

function requiredRetailerOrgId(auth: AuthSessionUser): string {
  if (auth.orgType !== 'RETAILER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This action is available to a retailer');
  }
  return auth.orgId;
}
