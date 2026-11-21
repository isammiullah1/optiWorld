'use client';

import {
  centsToMoney,
  moneyToCents,
  type LabBill,
  type LabSessionProfile,
} from '@optiworld/shared';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { formatRupee, formatShortDate } from '@/components/retailer/dashboard-format';

import { loadLabProfile } from './lab-account-api';
import { useCloseOnEscape } from './use-close-on-escape';

export function WalkInInvoice({
  token,
  bill,
  onClose,
}: {
  token: string;
  bill: LabBill;
  onClose: () => void;
}): React.ReactElement {
  const [profile, setProfile] = useState<LabSessionProfile | null>(null);
  const received = moneyToCents(bill.amountPaid);
  const total = moneyToCents(bill.total);
  const balance = Math.max(0, total - received);
  const paid = balance === 0;
  useCloseOnEscape(onClose);

  useEffect(() => {
    let active = true;
    void loadLabProfile(token)
      .then((next) => {
        if (active) {
          setProfile(next);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token]);

  const laboratory = profile?.laboratory;
  const contact = [laboratory?.phone, laboratory?.city, laboratory?.address].filter(
    (part): part is string => Boolean(part && part.length > 0),
  );

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-navy/40 p-3"
      role="presentation"
      onClick={onClose}
    >
      <article
        role="dialog"
        aria-modal="true"
        aria-labelledby="walk-in-invoice-title"
        className="ow-print-root grid w-full max-w-xl gap-4 rounded-xl border-2 border-navy bg-action-soft p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 rounded-lg bg-navy px-4 py-3 text-white">
          <div>
            <p id="walk-in-invoice-title" className="text-lg font-semibold">
              {laboratory?.name ?? bill.labName}
            </p>
            {contact.length > 0 ? (
              <p className="text-sm text-white/80">{contact.join(' · ')}</p>
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">Invoice {bill.referenceNumber}</p>
            <p className="text-sm text-white/80">
              {formatShortDate(bill.issuedAt ?? bill.createdAt)}
            </p>
          </div>
        </header>
        <div className="grid gap-1 rounded-lg bg-white px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink3">Customer</p>
          <p className="text-sm text-ink">{bill.patientName}</p>
          <p className="text-xs font-medium uppercase tracking-wide text-ink3">Contact</p>
          <p className="text-sm text-ink2">{bill.patientPhone || '—'}</p>
          <span
            className={`mt-1 w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
              paid ? 'bg-teal-soft text-teal' : 'bg-amber-soft text-amber'
            }`}
          >
            {paid ? 'PAID' : 'BALANCE DUE'}
          </span>
        </div>
        <table className="w-full border-collapse rounded-lg bg-white">
          <thead>
            <tr className="border-b border-line text-left">
              {['Service', 'Qty', 'Price', 'Total'].map((heading) => (
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
            {bill.lines.map((line) => (
              <tr key={line.id} className="border-b border-line">
                <td className="px-3 py-2 text-sm text-ink">{line.serviceName}</td>
                <td className="px-3 py-2 text-sm text-ink2">{line.quantity}</td>
                <td className="px-3 py-2 text-sm text-ink2">{formatRupee(line.unitPrice)}</td>
                <td className="px-3 py-2 text-sm text-ink">{formatRupee(line.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="grid gap-1 rounded-lg bg-white px-4 py-3 text-sm">
          <div className="flex justify-between text-ink2">
            <dt>Discount</dt>
            <dd>{formatRupee(bill.discount)}</dd>
          </div>
          <div className="flex justify-between font-semibold text-ink">
            <dt>Total</dt>
            <dd>{formatRupee(bill.total)}</dd>
          </div>
          <div className="flex justify-between text-ink2">
            <dt>Received</dt>
            <dd>{formatRupee(bill.amountPaid)}</dd>
          </div>
          <div className="flex justify-between font-semibold text-ink">
            <dt>Balance</dt>
            <dd>{formatRupee(centsToMoney(balance))}</dd>
          </div>
        </dl>
        <p className="text-right text-sm text-ink2">Signature</p>
        <div className="flex justify-end gap-2 print:hidden">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-navy bg-white px-4 text-sm font-semibold text-navy"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
            Close
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white"
            onClick={() => window.print()}
          >
            Print
          </button>
        </div>
      </article>
    </div>
  );
}
