'use client';

import { centsToMoney, moneyToCents } from '@optiworld/shared';
import { Trash2 } from 'lucide-react';

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
      className="grid gap-3 rounded-xl border border-action-soft bg-white p-3"
    >
      <h2 className="text-md font-semibold text-ink">Order</h2>
      <div className="overflow-x-auto rounded-lg border border-action-soft">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-action-soft bg-action-soft text-left">
              {['No.', 'Item', 'Qty', 'Rate', 'Amount', ''].map((heading) => (
                <th
                  key={heading || 'remove'}
                  className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-sm text-ink2">
                  Search the catalog and add a product. The lines appear here.
                </td>
              </tr>
            ) : (
              lines.map((line, index) => (
                <tr key={line.id} className="border-b border-action-soft align-top">
                  <td className="px-3 py-2 text-sm text-ink2">{index + 1}</td>
                  <td className="px-3 py-2">
                    <p className="text-sm text-ink">
                      {line.name} {line.code}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Quantity for ${line.name}`}
                      inputMode="numeric"
                      value={String(line.quantity)}
                      onChange={(event) => onQuantity(line.id, readQuantity(event.target.value))}
                      className="w-16 min-h-[44px] rounded-lg border border-line px-2 text-center text-sm text-ink outline-none focus:border-action"
                    />
                  </td>
                  <td className="px-3 py-2 text-sm text-ink">
                    {line.listedPrice ? (
                      formatRupee(line.listedPrice)
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">
                        Price on request
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm text-ink">
                    {line.listedPrice
                      ? formatRupee(centsToMoney(moneyToCents(line.listedPrice) * line.quantity))
                      : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      aria-label={`Remove ${line.name}`}
                      onClick={() => onRemove(line.id)}
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-medium text-danger"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {lines.length === 0 ? null : total ? (
        <p className="text-sm font-semibold text-ink">Total {formatRupee(total)}</p>
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
          className="rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-action"
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
