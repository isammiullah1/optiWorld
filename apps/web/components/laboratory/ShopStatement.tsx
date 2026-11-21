'use client';

import { centsToMoney, moneyToCents, type LabBill } from '@optiworld/shared';
import { X } from 'lucide-react';

import { formatRupee, formatShortDate } from '@/components/retailer/dashboard-format';

import { useCloseOnEscape } from './use-close-on-escape';

export function ShopStatement({
  shopName,
  title = 'Joint bill',
  from,
  to,
  rows,
  onClose,
  onWhatsapp,
  whatsappBusy = false,
  whatsappNote = null,
}: {
  shopName: string;
  title?: string;
  from: string;
  to: string;
  rows: readonly LabBill[];
  onClose: () => void;
  onWhatsapp?: () => void;
  whatsappBusy?: boolean;
  whatsappNote?: string | null;
}): React.ReactElement {
  const total = rows.reduce((sum, row) => sum + moneyToCents(row.total), 0);
  const pending = title === 'Pending bills';
  useCloseOnEscape(onClose, !whatsappBusy);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-navy/40 p-3"
      role="presentation"
      onClick={onClose}
    >
      <article
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-statement-title"
        className="ow-print-root grid w-full max-w-3xl gap-4 rounded-xl border-2 border-navy bg-action-soft p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="rounded-lg bg-navy px-4 py-3 text-white">
          <h2 id="shop-statement-title" className="text-lg font-semibold">
            {shopName}
          </h2>
          <p className="text-sm text-white/80">
            {title} · {formatShortDate(`${from}T00:00:00.000Z`)} to{' '}
            {formatShortDate(`${to}T00:00:00.000Z`)}
          </p>
        </header>
        <div className="overflow-auto rounded-lg bg-white">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-navy text-left text-white">
                {['Job', 'Patient', 'Services', 'Status', 'Total'].map((heading) => (
                  <th
                    key={heading}
                    className="px-3 py-2 text-xs font-medium uppercase tracking-wide"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-sm text-ink2">
                    No orders for this retailer in this period.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-3 py-2 text-sm font-medium text-ink">
                      {row.referenceNumber}
                    </td>
                    <td className="px-3 py-2 text-sm text-ink">{row.patientName}</td>
                    <td className="px-3 py-2 text-sm text-ink2">
                      {row.lines.map((line) => line.serviceName).join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-ink2">{statementStatus(row.status)}</td>
                    <td className="px-3 py-2 text-sm font-semibold text-ink">
                      {formatRupee(row.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 rounded-lg border-2 border-navy bg-white px-4 py-3 sm:grid-cols-2">
          <p>
            <span className="block text-xs font-medium uppercase tracking-wide text-navy">
              {pending ? 'Pending bills' : 'Bills'}
            </span>
            <span className="text-lg font-semibold text-ink">{rows.length}</span>
          </p>
          <p className="sm:text-right">
            <span className="block text-xs font-medium uppercase tracking-wide text-navy">
              {pending ? 'Pending charges' : 'Charges'}
            </span>
            <span className="text-lg font-semibold text-ink">
              {formatRupee(centsToMoney(total))}
            </span>
          </p>
        </div>
        {whatsappNote ? (
          <p role="status" className="rounded-lg bg-white px-4 py-3 text-sm text-ink print:hidden">
            {whatsappNote}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 print:hidden">
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border-2 border-navy bg-white px-4 text-sm font-semibold text-navy"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
            Close
          </button>
          {onWhatsapp ? (
            <button
              type="button"
              disabled={whatsappBusy || rows.length === 0}
              className="min-h-11 rounded-lg border-2 border-teal bg-teal px-4 text-sm font-semibold text-white disabled:opacity-50"
              onClick={onWhatsapp}
            >
              {whatsappBusy ? 'Sending…' : 'Send to WhatsApp'}
            </button>
          ) : null}
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

function statementStatus(status: LabBill['status']): string {
  if (status === 'CLEARED') {
    return 'Paid';
  }
  if (status === 'ISSUED') {
    return 'Issued';
  }
  if (status === 'OPEN') {
    return 'Open';
  }
  return 'Rejected';
}
