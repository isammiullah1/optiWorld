'use client';

import type { AgingRow } from '@optiworld/shared';
import { useState } from 'react';

import { formatRupee } from './dashboard-format';

export function ReminderDialog({
  rows,
  initialIds,
  sending,
  error,
  onClose,
  onSend,
}: {
  rows: AgingRow[];
  initialIds: string[];
  sending: boolean;
  error: string | null;
  onClose: () => void;
  onSend: (customerIds: string[]) => Promise<void>;
}): React.ReactElement {
  const [selected, setSelected] = useState<string[]>(initialIds);
  const preview =
    rows.find((row) => row.customerId === selected[0]) ??
    rows.find((row) => selected.includes(row.customerId));

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-title"
        className="grid max-h-[92vh] w-full max-w-lg gap-3 overflow-y-auto rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (selected.length === 0) {
            return;
          }
          void onSend(selected);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id="reminder-title" className="text-lg font-semibold text-ink">
            Send payment reminders
          </h2>
          <button type="button" className="min-h-[44px] px-2 text-sm text-ink2" onClick={onClose}>
            Close
          </button>
        </div>
        <ul className="grid max-h-52 gap-1 overflow-y-auto">
          {rows.map((row) => {
            const checked = selected.includes(row.customerId);
            return (
              <li key={row.customerId}>
                <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      setSelected((current) =>
                        current.includes(row.customerId)
                          ? current.filter((id) => id !== row.customerId)
                          : [...current, row.customerId],
                      );
                    }}
                  />
                  <span className="flex-1">{row.customerName}</span>
                  <span className="text-ink2">{formatRupee(row.total)}</span>
                </label>
              </li>
            );
          })}
        </ul>
        {preview ? (
          <p className="rounded-lg border border-line bg-canvas p-3 text-sm text-ink2">
            {preview.preview}
          </p>
        ) : (
          <p className="text-sm text-ink2">Select a customer to preview the WhatsApp message.</p>
        )}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={sending || selected.length === 0}
          className="min-h-[44px] rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {selected.length > 1 ? `Send ${selected.length} reminders` : 'Send reminder'}
        </button>
      </form>
    </div>
  );
}
