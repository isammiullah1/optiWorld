'use client';

import type { RetailerInvoiceRow } from '@optiworld/shared';
import { useRouter } from 'next/navigation';

import { formatMoney, formatShortDate, invoiceStatusLabel } from './dashboard-format';

export function RecentInvoices({
  invoices,
  limit,
}: {
  invoices: readonly RetailerInvoiceRow[];
  limit?: number;
}): React.ReactElement {
  const router = useRouter();
  const rows = typeof limit === 'number' ? invoices.slice(0, limit) : invoices;

  return (
    <section className="rounded-xl border border-line bg-white">
      <h2 className="px-4 pt-4 text-md font-semibold text-ink">Recent invoices</h2>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink2">No invoices yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                {['Customer', 'Invoice #', 'Amount', 'Status', 'Date'].map((heading) => (
                  <th
                    key={heading}
                    className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <tr
                  key={invoice.id}
                  tabIndex={0}
                  role="link"
                  aria-label={`Invoice ${invoice.invoiceNumber}, ${invoice.customerName}`}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas"
                  onClick={() => router.push(`/retailer/billing/${invoice.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      router.push(`/retailer/billing/${invoice.id}`);
                    }
                  }}
                >
                  <td className="px-4 py-2 text-sm text-ink">{invoice.customerName}</td>
                  <td className="px-4 py-2 text-sm text-ink2">#{invoice.invoiceNumber}</td>
                  <td className="px-4 py-2 text-sm text-ink">{formatMoney(invoice.amount)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={invoice.status} />
                  </td>
                  <td className="px-4 py-2 text-sm text-ink2">
                    {formatShortDate(invoice.issuedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: RetailerInvoiceRow['status'] }): React.ReactElement {
  const paid = status === 'PAID';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        paid ? 'bg-teal-soft text-teal' : 'bg-amber-soft text-amber'
      }`}
    >
      {invoiceStatusLabel(status)}
    </span>
  );
}
