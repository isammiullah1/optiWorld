'use client';

import { centsToMoney, moneyToCents } from '@optiworld/shared';
import { ClipboardList, Trash2 } from 'lucide-react';

import { formatRupee } from './dashboard-format';

export type DraftLine = {
  id: string;
  name: string;
  code: string;
  listedPrice: string | null;
  quantity: number;
};

export function OrderBuilder({
  lines,
  pricesVisible,
  notes,
  busy,
  onQuantity,
  onRemove,
  onNotes,
  onSubmit,
}: {
  lines: readonly DraftLine[];
  pricesVisible: boolean;
  notes: string;
  busy: boolean;
  onQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onNotes: (value: string) => void;
  onSubmit: () => void;
}): React.ReactElement {
  const total = pricesVisible ? runningTotal(lines) : null;
  const unpriced = lines.filter((line) => !line.listedPrice).length;
  return (
    <section
      id="order-builder"
      className="grid content-start gap-3 self-start rounded-xl border-2 border-teal bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-teal)_24%,white)_0%,white_46%,var(--ow-teal-soft)_100%)] p-3 lg:sticky lg:top-4"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-teal-soft text-teal">
          <ClipboardList size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-md font-semibold text-ink">Order</h2>
          <p className="text-xs text-ink2">
            {lines.length === 0
              ? 'Products you add appear here.'
              : `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`}
          </p>
        </div>
      </div>
      {lines.length === 0 ? (
        <p className="rounded-lg bg-white/70 px-3 py-3 text-sm text-ink2">
          Search the catalog and add a product. The lines appear here.
        </p>
      ) : (
        <ul className="grid gap-2">
          {lines.map((line, index) => (
            <li key={line.id} className="rounded-lg border border-line bg-white p-3">
              <p className="text-sm text-ink">
                <span className="text-ink3">{index + 1}. </span>
                {line.name} <span className="text-ink2">{line.code}</span>
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                <label className="grid gap-1 text-xs text-ink3">
                  Qty
                  <input
                    aria-label={`Quantity for ${line.name}`}
                    inputMode="numeric"
                    value={String(line.quantity)}
                    onChange={(event) => onQuantity(line.id, readQuantity(event.target.value))}
                    className="w-16 min-h-[44px] rounded-lg border border-line px-2 text-center text-sm text-ink outline-none focus:border-action"
                  />
                </label>
                <div className="grid gap-1">
                  <p className="text-xs text-ink3">Rate</p>
                  {line.listedPrice ? (
                    <p className="text-sm font-medium text-action">
                      {formatRupee(line.listedPrice)}
                    </p>
                  ) : (
                    <span className="inline-flex rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">
                      Price on request
                    </span>
                  )}
                </div>
                <div className="grid gap-1">
                  <p className="text-xs text-ink3">Amount</p>
                  <p className="text-sm font-semibold text-teal">
                    {line.listedPrice
                      ? formatRupee(centsToMoney(moneyToCents(line.listedPrice) * line.quantity))
                      : '—'}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => onRemove(line.id)}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-danger bg-danger-soft px-2 text-xs font-medium text-danger"
                >
                  <Trash2 size={12} aria-hidden="true" />
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {lines.length === 0 ? null : total ? (
        <p className="rounded-lg bg-white/80 px-3 py-2 text-sm font-semibold text-ink">
          Total {formatRupee(total)}
        </p>
      ) : (
        <p className="rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber">
          {pricesVisible
            ? `${unpriced} ${unpriced === 1 ? 'line is' : 'lines are'} price on request, so this order has no total until the wholesaler quotes it.`
            : 'Prices are on request for this wholesaler.'}
        </p>
      )}
      <label className="grid gap-1 text-sm text-ink2">
        Notes
        <textarea
          value={notes}
          onChange={(event) => onNotes(event.target.value)}
          rows={3}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
        />
      </label>
      <button
        type="button"
        disabled={busy || lines.length === 0}
        onClick={onSubmit}
        className="min-h-[44px] rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Submitting…' : 'Submit order'}
      </button>
    </section>
  );
}

function readQuantity(value: string): number {
  const parsed = Number(value.replace(/\D/g, ''));
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }
  return Math.min(parsed, 10_000);
}

function runningTotal(lines: readonly DraftLine[]): string | null {
  if (lines.length === 0 || lines.some((line) => !line.listedPrice)) {
    return null;
  }
  const cents = lines.reduce(
    (sum, line) => sum + moneyToCents(line.listedPrice ?? '0.00') * line.quantity,
    0,
  );
  return centsToMoney(cents);
}
