'use client';

import {
  DEFAULT_REMINDER_NOTE,
  readPaymentReminder,
  type AgingRow,
  type ReminderSendResult,
} from '@optiworld/shared';
import { ChevronDown, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { WhatsAppMark } from '@/components/WhatsAppMark';

import { formatDateTime, formatRupee } from './dashboard-format';
import { ReminderSlip } from './ReminderSlip';

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
  onSend: (customerIds: string[], note: string) => Promise<ReminderSendResult | void>;
}): React.ReactElement {
  const single = initialIds.length === 1;
  const [selected, setSelected] = useState<string[]>(initialIds);
  const [listOpen, setListOpen] = useState(false);
  const [note, setNote] = useState(DEFAULT_REMINDER_NOTE);
  const [prompt, setPrompt] = useState<string | null>(null);
  const preview =
    rows.find((row) => row.customerId === selected[0]) ??
    rows.find((row) => selected.includes(row.customerId));

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="reminder-title"
        className="flex max-h-[92vh] w-full max-w-lg flex-col gap-3 overflow-hidden rounded-t-2xl border-2 border-navy bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-navy)_16%,white)_0%,var(--ow-blue-soft)_46%,white_100%)] p-3 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (selected.length === 0 || sending || prompt) {
            return;
          }
          const closing = note.trim() || DEFAULT_REMINDER_NOTE;
          void onSend(selected, closing).then((result) => {
            if (!result) {
              return;
            }
            const sent = result.results.filter((item) => item.sent);
            if (sent.length === 0) {
              return;
            }
            const failed = result.results.length - sent.length;
            const names = sent.map((item) => item.customerName).join(', ');
            const lead =
              sent.length === 1
                ? `Sent on WhatsApp to ${names}.`
                : `Sent on WhatsApp to ${sent.length} customers.`;
            setPrompt(failed > 0 ? `${lead} ${failed} could not be sent.` : lead);
          });
        }}
      >
        <div className="flex items-center justify-between gap-3 rounded-xl bg-navy px-3 py-3 text-white">
          <div className="flex items-center gap-2">
            <WhatsAppMark size={28} className="shrink-0 overflow-hidden rounded-full" />
            <h2 id="reminder-title" className="text-lg font-semibold">
              {single ? 'Payment reminder' : 'Send payment reminders'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-navy"
            onClick={onClose}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        {prompt ? (
          <div
            role="status"
            className="grid gap-3 rounded-xl border border-teal bg-teal-soft px-4 py-5 text-center"
          >
            <p className="text-lg font-semibold text-ink">Reminder sent</p>
            <p className="text-sm text-ink2">{prompt}</p>
            <button
              type="button"
              className="min-h-[44px] rounded-lg bg-teal px-4 text-sm font-medium text-white"
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {single && preview ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2">
                <p className="text-sm font-medium text-ink">{preview.customerName}</p>
                <p className="text-sm tabular-nums text-ink2">{formatRupee(preview.total)}</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-line bg-white">
                <button
                  type="button"
                  aria-expanded={listOpen}
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 text-sm text-ink"
                  onClick={() => setListOpen((open) => !open)}
                >
                  <span>
                    {selected.length} of {rows.length} customers
                  </span>
                  <ChevronDown
                    size={16}
                    aria-hidden
                    className={listOpen ? 'rotate-180 text-ink2' : 'text-ink2'}
                  />
                </button>
                {listOpen ? (
                  <ul className="grid max-h-52 gap-1 overflow-y-auto border-t border-line px-2 py-2">
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
                ) : null}
              </div>
            )}
            {preview ? (
              <div className="min-h-0 overflow-y-auto">
                <ReminderPreview message={preview.preview} note={note} onNoteChange={setNote} />
              </div>
            ) : (
              <p className="rounded-xl border border-line bg-white px-3 py-3 text-sm text-ink2">
                Select a customer to preview the WhatsApp message.
              </p>
            )}
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={sending || selected.length === 0}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
            >
              <WhatsAppMark size={16} className="shrink-0 overflow-hidden rounded-full" />
              {sending
                ? 'Sending…'
                : selected.length > 1
                  ? `Send ${selected.length} via WhatsApp`
                  : 'Send via WhatsApp'}
            </button>
            {preview ? (
              <p className="text-center text-xs text-ink2">{historyLine(preview)}</p>
            ) : null}
          </>
        )}
      </form>
    </div>
  );
}

function ReminderPreview({
  message,
  note,
  onNoteChange,
}: {
  message: string;
  note: string;
  onNoteChange: (value: string) => void;
}): React.ReactElement {
  const slip = readPaymentReminder(message);
  if (!slip) {
    return (
      <p className="whitespace-pre-line rounded-xl border border-line bg-white p-3 text-sm text-ink2">
        {message}
      </p>
    );
  }
  return <ReminderSlip slip={slip} note={note} onNoteChange={onNoteChange} />;
}

function historyLine(row: AgingRow): string {
  const sent = row.remindersSentAt.map((iso) => formatDateTime(iso));
  const who = row.customerName;
  if (sent.length === 0) {
    return `No reminder has been sent to ${who} yet.`;
  }
  if (sent.length === 1) {
    return `Last reminder sent to ${who} on ${sent[0]}.`;
  }
  return `Reminders sent to ${who} on ${sent.join(' · ')}.`;
}
