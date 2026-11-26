'use client';

import type { PaymentReminderSlip } from '@optiworld/shared';

import { formatRupee } from './dashboard-format';

export function ReminderSlip({
  slip,
  note,
  onNoteChange,
}: {
  slip: PaymentReminderSlip;
  note?: string;
  onNoteChange?: (value: string) => void;
}): React.ReactElement {
  return (
    <article
      aria-label="Payment reminder"
      className="overflow-hidden rounded-lg border border-line bg-white"
    >
      <header className="border-b border-dashed border-line bg-canvas px-3 py-3 text-center">
        <p className="text-md font-semibold text-ink">{slip.businessName}</p>
        <p className="text-xs font-medium uppercase tracking-wide text-ink3">Payment reminder</p>
      </header>
      <div className="grid gap-3 px-3 py-3">
        <p className="text-sm text-ink">Hello {slip.customerName}</p>
        <div className="grid gap-3 border-y border-dashed border-line py-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink3">Outstanding</p>
            <p className="text-lg font-semibold tabular-nums text-amber">
              {rupee(slip.outstanding)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink3">Due on</p>
            <p className="text-sm font-medium text-ink">{slip.dueOn}</p>
          </div>
        </div>
        {slip.bills.length > 0 ? (
          <div className="grid gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink3">Open bills</p>
            <ul className="grid gap-2">
              {slip.bills.map((bill, index) => (
                <li
                  key={`${bill.invoiceNumber}-${index}`}
                  className="rounded-lg border border-line px-3 py-2"
                >
                  <p className="text-sm font-medium text-ink">
                    Invoice {bill.invoiceNumber}
                    {bill.issuedAt ? (
                      <span className="font-normal text-ink2"> · {bill.issuedAt}</span>
                    ) : null}
                  </p>
                  <dl className="mt-1 grid gap-1">
                    <Amount label="Total" value={rupee(bill.total)} />
                    <Amount label="Received" value={rupee(bill.paid)} tone="teal" />
                    <Amount label="Remaining" value={rupee(bill.remaining)} strong />
                  </dl>
                </li>
              ))}
            </ul>
            {slip.extraBills > 0 ? (
              <p className="text-xs text-ink3">
                {slip.extraBills} more open{' '}
                {slip.extraBills === 1 ? 'bill remains' : 'bills remain'}.
              </p>
            ) : null}
          </div>
        ) : null}
        {onNoteChange ? (
          <label className="grid gap-1 border-t border-dashed border-line pt-3">
            <span className="text-center text-xs font-medium uppercase tracking-wide text-ink3">
              Message
            </span>
            <textarea
              value={note ?? slip.note}
              onChange={(event) => onNoteChange(event.target.value)}
              rows={2}
              maxLength={500}
              aria-label="Reminder message"
              className="w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-center text-sm text-ink outline-none focus:border-action"
            />
          </label>
        ) : (
          <p className="border-t border-dashed border-line pt-3 text-center text-sm text-ink2">
            {slip.note}
          </p>
        )}
      </div>
    </article>
  );
}

function Amount({
  label,
  value,
  tone = 'ink2',
  strong = false,
}: {
  label: string;
  value: string;
  tone?: 'ink2' | 'teal';
  strong?: boolean;
}): React.ReactElement {
  const color = tone === 'teal' ? 'text-teal' : 'text-ink2';
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-ink2">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold text-ink' : `font-medium ${color}`}`}>
        {value}
      </dd>
    </div>
  );
}

function rupee(value: string): string {
  return formatRupee(value.replace(/[₨,\s]/g, ''));
}
