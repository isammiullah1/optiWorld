import type { PosInvoice } from '@optiworld/shared';

const STATUS_LABEL = {
  PENDING: 'Waiting to sync',
  SYNCING: 'Syncing',
  SYNCED: 'Synced',
  CONFLICT: 'Needs attention',
} as const;

export function LocalInvoiceList({
  invoices,
}: {
  invoices: readonly PosInvoice[];
}): React.ReactElement {
  if (invoices.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="text-lg font-semibold text-ink">Sales on this device</h2>
        <p className="mt-2 text-sm text-ink2">No sales have been recorded on this device yet.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <h2 className="text-lg font-semibold text-ink">Sales on this device</h2>
      <ul className="mt-3 grid gap-2">
        {invoices.map((invoice) => (
          <li key={invoice.localId} className="rounded-lg border border-line px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-ink">
                {invoice.invoiceNumber ? `Invoice ${invoice.invoiceNumber}` : 'Not numbered yet'} ·{' '}
                {invoice.total}
              </p>
              <span className={`rounded-full px-2 py-1 text-xs ${pillClass(invoice)}`}>
                {STATUS_LABEL[invoice.syncStatus]}
              </span>
            </div>
            {invoice.needsReview || invoice.reviewReason ? (
              <p className="mt-1 text-xs text-ink2">
                {invoice.reviewReason ?? 'An owner needs to review this sale.'}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function pillClass(invoice: PosInvoice): string {
  if (invoice.syncStatus === 'CONFLICT' || invoice.needsReview) {
    return 'bg-danger-soft text-danger';
  }
  if (invoice.syncStatus === 'SYNCED') {
    return 'bg-teal-soft text-teal';
  }
  return 'bg-amber-soft text-amber';
}
