'use client';

import type { RecordActivity } from '@optiworld/shared';
import { ChevronDown, History } from 'lucide-react';
import { useState } from 'react';

import { formatDateTime } from '@/components/retailer/dashboard-format';

const VERB = {
  PREPARED: 'Prepared',
  UPDATED: 'Updated',
  CANCELLED: 'Cancelled',
  DELETED: 'Deleted',
} as const;

export function RecordTrail({
  activity,
}: {
  activity: readonly RecordActivity[] | undefined;
}): React.ReactElement | null {
  const rows = activity ?? [];
  const [open, setOpen] = useState(false);
  const [openRow, setOpenRow] = useState<number | null>(null);
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setOpenRow(null);
        }}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-action bg-action-soft px-3 py-2 text-left text-sm font-medium text-action"
      >
        <span className="inline-flex items-center gap-2">
          <History size={16} aria-hidden="true" />
          Order history
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <ul className="grid gap-1">
          {rows.map((row, index) => {
            const expanded = openRow === index;
            const details =
              row.details && row.details.length > 0
                ? row.details
                : [{ text: 'No further detail was recorded.' }];
            return (
              <li
                key={`${row.kind}-${row.at}-${index}`}
                className="rounded-lg border border-line bg-white"
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpenRow(expanded ? null : index)}
                  className="flex min-h-11 w-full items-center justify-between gap-2 px-2 text-left text-xs text-ink2"
                >
                  <span>
                    {VERB[row.kind]}
                    {row.userName ? ` by ${row.userName}` : ''} · {formatDateTime(row.at)}
                  </span>
                  <ChevronDown
                    size={14}
                    aria-hidden="true"
                    className={`shrink-0 text-ink3 transition ${expanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {expanded ? (
                  <ul className="grid gap-1 border-t border-line px-2 py-2">
                    {details.map((detail, detailIndex) => (
                      <HistoryDetail key={`${detailIndex}-${detail.text}`} detail={detail} />
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function HistoryDetail({
  detail,
}: {
  detail: NonNullable<RecordActivity['details']>[number];
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const lines = detail.lines ?? [];
  if (lines.length === 0) {
    return <li className="text-xs text-ink">{detail.text}</li>;
  }
  return (
    <li className="rounded-lg border border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-2 text-left text-xs text-ink"
      >
        <span>{detail.text}</span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`shrink-0 text-ink3 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <ul className="grid gap-1 border-t border-line px-2 py-2">
          {lines.map((line) => (
            <li key={line} className="text-xs text-ink2">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function cancellationLine(
  activity: readonly RecordActivity[] | undefined,
  cancelledAt: string | null,
): string | null {
  if (!cancelledAt) {
    return null;
  }
  const row = [...(activity ?? [])].reverse().find((entry) => entry.kind === 'CANCELLED');
  const when = formatDateTime(row?.at ?? cancelledAt);
  return row?.userName ? `Cancelled ${when} by ${row.userName}.` : `Cancelled ${when}.`;
}
