import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  moneyToCents,
  type AuthSessionUser,
  type CustomerReport,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { getAgingReport } from './ledger.service.js';

const DAY_MS = 86_400_000;
const MAX_DAYS = 366;
const LIST_LIMIT = 50;

export async function getCustomerReport(
  auth: AuthSessionUser,
  from: string,
  to: string,
): Promise<CustomerReport> {
  const orgId = requiredRetailerOrgId(auth);
  const range = parseRange(from, to);
  const owner = auth.role === 'OWNER';
  const [customers, aging] = await Promise.all([
    prisma.customer.findMany({
      where: { orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        invoices: {
          where: { cancelledAt: null, NOT: { reviewReason: 'Opening credit' } },
          select: { issuedAt: true, total: true },
        },
      },
      orderBy: { name: 'asc' },
    }),
    getAgingReport(auth),
  ]);
  const due = new Map(aging.rows.map((row) => [row.customerId, moneyToCents(row.total)]));
  const top: Ranked[] = [];
  const fresh: Ranked[] = [];
  const returning: Ranked[] = [];
  const inactive: CustomerReport['inactive'] = [];
  let newSale = 0;
  let returningSale = 0;

  for (const customer of customers) {
    let first: Date | null = null;
    let last: Date | null = null;
    let periodSale = 0;
    let periodCount = 0;
    for (const invoice of customer.invoices) {
      if (!first || invoice.issuedAt < first) {
        first = invoice.issuedAt;
      }
      if (!last || invoice.issuedAt > last) {
        last = invoice.issuedAt;
      }
      if (invoice.issuedAt >= range.start && invoice.issuedAt < range.end) {
        periodSale += moneyToCents(invoice.total.toFixed(2));
        periodCount += 1;
      }
    }
    const outstanding = due.get(customer.id) ?? 0;
    if (periodCount > 0 && first) {
      const ranked: Ranked = {
        customerId: customer.id,
        customerName: customer.name,
        invoiceCount: periodCount,
        saleCents: periodSale,
        outstanding,
      };
      top.push(ranked);
      if (periodCount > 1) {
        returning.push(ranked);
        returningSale += periodSale;
      } else if (first >= range.start) {
        fresh.push(ranked);
        newSale += periodSale;
      }
    } else if (last !== null || outstanding > 0) {
      inactive.push({
        customerId: customer.id,
        customerName: customer.name,
        lastVisit: last ? last.toISOString() : null,
        outstanding: owner ? centsToMoney(outstanding) : null,
      });
    }
  }

  top.sort(
    (left, right) =>
      right.saleCents - left.saleCents || left.customerName.localeCompare(right.customerName),
  );
  fresh.sort(
    (left, right) =>
      right.saleCents - left.saleCents || left.customerName.localeCompare(right.customerName),
  );
  returning.sort(
    (left, right) =>
      right.saleCents - left.saleCents || left.customerName.localeCompare(right.customerName),
  );
  inactive.sort((left, right) => {
    if (left.lastVisit === right.lastVisit) {
      return left.customerName.localeCompare(right.customerName);
    }
    if (left.lastVisit === null) {
      return -1;
    }
    if (right.lastVisit === null) {
      return 1;
    }
    return left.lastVisit.localeCompare(right.lastVisit);
  });

  return {
    from: range.from,
    to: range.to,
    top: top.slice(0, LIST_LIMIT).map((row) => present(row, owner)),
    acquired: {
      newCount: fresh.length,
      returningCount: returning.length,
      newSale: centsToMoney(newSale),
      returningSale: centsToMoney(returningSale),
      newCustomers: fresh.slice(0, LIST_LIMIT).map((row) => present(row, owner)),
      returningCustomers: returning.slice(0, LIST_LIMIT).map((row) => present(row, owner)),
    },
    outstanding: owner ? aging : null,
    inactive,
  };
}

type Ranked = {
  customerId: string;
  customerName: string;
  invoiceCount: number;
  saleCents: number;
  outstanding: number;
};

function present(row: Ranked, owner: boolean): CustomerReport['top'][number] {
  return {
    customerId: row.customerId,
    customerName: row.customerName,
    invoiceCount: row.invoiceCount,
    sale: centsToMoney(row.saleCents),
    outstanding: owner ? centsToMoney(row.outstanding) : null,
  };
}

function parseRange(
  from: string,
  to: string,
): { from: string; to: string; start: Date; end: Date } {
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

function requiredRetailerOrgId(auth: AuthSessionUser): string {
  if (!auth.orgId || auth.orgType !== 'RETAILER') {
    throw new AppError(403, 'FORBIDDEN', 'This area is not available for your organisation');
  }
  return auth.orgId;
}
