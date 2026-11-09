'use client';

import type { AgingRow, CustomerCreditBills, PosReceipt } from '@optiworld/shared';
import { Bell, ChevronDown, Eye, Pencil } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';

import { RecordTrail } from '@/components/RecordTrail';

import { CreditUpdate } from './CreditUpdate';
import { formatRupee, formatShortDate } from './dashboard-format';
import { loadCustomerCreditBills } from './ledger-api';
import { loadPosReceipt } from './pos-api';

const STATUS_LABEL = {
  CURRENT: 'Current',
  DAYS_31_60: '31–60 days',
  OVERDUE: 'Overdue',
} as const;

const ROW_CLASS = {
  CURRENT: 'border-l-4 border-l-teal bg-teal-soft',
  DAYS_31_60: 'border-l-4 border-l-amber bg-amber-soft',
  OVERDUE: 'border-l-4 border-l-danger bg-danger-soft',
} as const;

const BADGE_CLASS = {
  CURRENT: 'bg-white text-teal',
  DAYS_31_60: 'bg-white text-amber',
  OVERDUE: 'bg-white text-danger',
} as const;

export function AgingTable({
  rows,
  token,
  onRemind,
  onUpdated,
}: {
  rows: AgingRow[];
  token: string | undefined;
  onRemind: (customerId: string) => void;
  onUpdated: () => void;
}): React.ReactElement {
  const [openId, setOpenId] = useState<string | null>(null);
  const [billId, setBillId] = useState<string | null>(null);
  const [bills, setBills] = useState<CustomerCreditBills | null>(null);
  const [billError, setBillError] = useState<string | null>(null);
  const [billBusy, setBillBusy] = useState(false);

  async function showBills(customerId: string): Promise<void> {
    if (billId === customerId) {
      setBillId(null);
      setBills(null);
      setBillError(null);
      return;
    }
    if (!token) {
      return;
    }
    setBillId(customerId);
    setBills(null);
    setBillError(null);
    setBillBusy(true);
    try {
      setBills(await loadCustomerCreditBills(token, customerId));
    } catch (caught: unknown) {
      setBillError(caught instanceof Error ? caught.message : 'The bills could not be loaded');
    } finally {
      setBillBusy(false);
    }
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-white p-6 text-center">
        <h2 className="text-md font-semibold text-ink">No outstanding dues</h2>
        <p className="text-sm text-ink2">Credit invoices with a balance will appear here.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <table className="w-full min-w-[920px] border-collapse text-left">
        <thead>
          <tr className="bg-navy text-left">
            {[
              'Customer',
              'Current (0-30d)',
              '31-60d',
              '61-90d',
              '90+d',
              'Total',
              'Status',
              'Bills',
              'Update',
              'Remind',
            ].map((heading) => (
              <th
                key={heading}
                className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-white"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.customerId}>
              <tr className={`border-b border-line ${ROW_CLASS[row.status]}`}>
                <td className="px-3 py-3 text-sm font-medium">
                  <Link href={`/retailer/customers/${row.customerId}`} className="text-action">
                    {row.customerName}
                  </Link>
                </td>
                <td className="px-3 py-3 text-sm text-ink">{formatRupee(row.current)}</td>
                <td className="px-3 py-3 text-sm text-ink">{formatRupee(row.days31to60)}</td>
                <td className="px-3 py-3 text-sm text-ink">{formatRupee(row.days61to90)}</td>
                <td className="px-3 py-3 text-sm text-ink">{formatRupee(row.days90plus)}</td>
                <td className="px-3 py-3 text-sm font-medium text-ink">{formatRupee(row.total)}</td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_CLASS[row.status]}`}
                  >
                    {STATUS_LABEL[row.status]}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-white px-3 text-sm font-medium text-action"
                    onClick={() => {
                      void showBills(row.customerId);
                    }}
                  >
                    <Eye size={14} aria-hidden="true" />
                    View
                  </button>
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-amber px-3 text-sm font-medium text-white"
                    onClick={() =>
                      setOpenId((current) => (current === row.customerId ? null : row.customerId))
                    }
                  >
                    <Pencil size={14} aria-hidden="true" />
                    Update
                  </button>
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-white px-3 text-sm font-medium text-action"
                    onClick={() => onRemind(row.customerId)}
                  >
                    <Bell size={14} aria-hidden="true" />
                    Remind
                  </button>
                </td>
              </tr>
              {billId === row.customerId ? (
                <tr className="border-b border-line">
                  <td colSpan={10} className="bg-white px-3 py-3">
                    <BillSummary bills={bills} busy={billBusy} error={billError} token={token} />
                  </td>
                </tr>
              ) : null}
              {openId === row.customerId && token ? (
                <tr className="border-b border-line">
                  <td colSpan={10} className="bg-white px-3 py-3">
                    <CreditUpdate
                      token={token}
                      customerId={row.customerId}
                      customerName={row.customerName}
                      onSaved={onUpdated}
                    />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BillSummary({
  bills,
  busy,
  error,
  token,
}: {
  bills: CustomerCreditBills | null;
  busy: boolean;
  error: string | null;
  token: string | undefined;
}): React.ReactElement {
  const [openId, setOpenId] = useState<string | null>(null);
  if (busy) {
    return <p className="text-sm text-ink2">Loading the bill summary…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  }
  if (!bills || bills.bills.length === 0) {
    return <p className="text-sm text-ink2">This customer has no open credit bills.</p>;
  }
  const billed = bills.bills.reduce((sum, bill) => sum + Math.round(Number(bill.total) * 100), 0);
  const received = bills.bills.reduce(
    (sum, bill) => sum + Math.round(Number(bill.amountPaid) * 100),
    0,
  );
  return (
    <div className="grid gap-2">
      <p className="text-sm text-ink">
        Credit bills {formatRupee((billed / 100).toFixed(2))} · Received{' '}
        {formatRupee((received / 100).toFixed(2))} · Remaining {formatRupee(bills.outstanding)}
      </p>
      <ul className="grid gap-2">
        {bills.bills.map((bill) => {
          const open = openId === bill.id;
          return (
            <li key={bill.id} className="rounded-lg border border-line bg-canvas">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : bill.id)}
                className="flex min-h-11 w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-left text-sm"
              >
                <span className="font-medium text-action">{bill.label}</span>
                <span className="text-ink3">{formatShortDate(bill.issuedAt)}</span>
                <span className="text-ink">Total {formatRupee(bill.total)}</span>
                <span className="text-teal">Received {formatRupee(bill.amountPaid)}</span>
                <span className="font-medium text-ink">
                  Remaining {formatRupee(bill.outstanding)}
                </span>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={`ml-auto text-ink3 transition ${open ? 'rotate-180' : ''}`}
                />
              </button>
              {open && token ? <InvoiceDrop token={token} invoiceId={bill.id} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function InvoiceDrop({
  token,
  invoiceId,
}: {
  token: string;
  invoiceId: string;
}): React.ReactElement {
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadPosReceipt(token, invoiceId)
      .then((next) => {
        if (active) {
          setReceipt(next);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'This invoice could not be loaded');
        }
      });
    return () => {
      active = false;
    };
  }, [invoiceId, token]);

  if (error) {
    return (
      <p role="alert" className="border-t border-line px-3 py-2 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (!receipt) {
    return <div className="mx-3 mb-3 h-24 animate-pulse rounded-lg bg-white" aria-busy="true" />;
  }
  return (
    <div className="grid gap-3 border-t border-line px-3 py-3">
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-canvas">
              {['No.', 'Item', 'Qty', 'Rate', 'Amount'].map((heading) => (
                <th
                  key={heading}
                  className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {receipt.items.map((item, index) => (
              <tr key={item.id} className="border-b border-line">
                <td className="px-3 py-2 text-sm text-ink2">{index + 1}</td>
                <td className="px-3 py-2 text-sm text-ink">
                  {item.productName} {item.priceCode}
                  {item.prescriptionSummary ? (
                    <span className="block text-xs text-ink3">{item.prescriptionSummary}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-sm text-ink">{item.quantity}</td>
                <td className="px-3 py-2 text-sm text-ink">{formatRupee(item.unitPrice)}</td>
                <td className="px-3 py-2 text-sm text-ink">{formatRupee(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="grid max-w-sm gap-1 text-sm">
        <div className="flex justify-between text-ink2">
          <dt>Subtotal</dt>
          <dd>{formatRupee(receipt.subtotal)}</dd>
        </div>
        <div className="flex justify-between text-ink2">
          <dt>Discount</dt>
          <dd>{formatRupee(receipt.discount)}</dd>
        </div>
        {receipt.deliveryAddress ? (
          <div className="flex justify-between text-ink2">
            <dt>Delivery</dt>
            <dd>{formatRupee(receipt.deliveryCharge)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between font-semibold text-ink">
          <dt>Total</dt>
          <dd>{formatRupee(receipt.total)}</dd>
        </div>
        <div className="flex justify-between text-teal">
          <dt>Received</dt>
          <dd>{formatRupee(receipt.amountPaid)}</dd>
        </div>
        <div className="flex justify-between font-semibold text-ink">
          <dt>Remaining</dt>
          <dd>{formatRupee(receipt.outstanding)}</dd>
        </div>
      </dl>
      <RecordTrail activity={receipt.activity} />
    </div>
  );
}
