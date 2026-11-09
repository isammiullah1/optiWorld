'use client';

import type { LedgerSummary } from '@optiworld/shared';
import {
  AlarmClock,
  Bell,
  CircleCheck,
  Clock,
  Download,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { AgingTable } from './AgingTable';
import { formatRupee } from './dashboard-format';
import {
  downloadAgingPdf,
  downloadAgingWorkbook,
  loadLedgerSummary,
  sendPaymentReminders,
} from './ledger-api';
import { ReminderDialog } from './ReminderDialog';

export function LedgerOverview(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogIds, setDialogIds] = useState<string[] | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [focus, setFocus] = useState<'ALL' | 'DUES' | 'OVER_30' | 'OVER_60'>('ALL');

  const refresh = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSummary(await loadLedgerSummary(token));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The ledger could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const reload = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    try {
      setSummary(await loadLedgerSummary(token));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The ledger could not be loaded');
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = summary?.rows ?? [];
  const visibleRows = rows.filter((row) => {
    if (focus === 'OVER_60') {
      return row.status === 'OVERDUE';
    }
    if (focus === 'OVER_30') {
      return row.status !== 'CURRENT';
    }
    return true;
  });
  const clearBooks = summary?.totalOutstanding === '0.00';

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Ledger</h1>
          <p className="text-sm text-ink2">Customer balances and payments for this shop.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink2 hover:border-action hover:text-action"
            onClick={() => {
              if (!token) {
                return;
              }
              void downloadAgingWorkbook(token).catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'The export could not be downloaded',
                );
              });
            }}
          >
            <Download size={16} aria-hidden="true" />
            Export Excel
          </button>
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink2 hover:border-action hover:text-action"
            onClick={() => {
              if (!token) {
                return;
              }
              void downloadAgingPdf(token).catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'The PDF could not be downloaded',
                );
              });
            }}
          >
            <Download size={16} aria-hidden="true" />
            Export PDF
          </button>
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-action px-4 text-sm font-medium text-white"
            onClick={() => {
              setSendError(null);
              setDialogIds(rows.map((row) => row.customerId));
            }}
          >
            <Bell size={16} aria-hidden="true" />
            Send all reminders
          </button>
        </div>
      </div>
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          <div className="h-14 animate-pulse rounded-xl border border-line bg-white" />
          <div className="h-14 animate-pulse rounded-xl border border-line bg-white" />
          <div className="h-14 animate-pulse rounded-xl border border-line bg-white" />
          <div className="h-14 animate-pulse rounded-xl border border-line bg-white" />
        </div>
      ) : error ? (
        <p role="alert" className="rounded-xl border border-line bg-white p-4 text-sm text-danger">
          {error}
        </p>
      ) : summary ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Total outstanding"
              value={formatRupee(summary.totalOutstanding)}
              hint={
                clearBooks ? (
                  'Nothing owed'
                ) : (
                  <>
                    <span className="block">Credit bills {formatRupee(summary.creditBilled)}</span>
                    <span className="block">Received {formatRupee(summary.creditReceived)}</span>
                  </>
                )
              }
              icon={Wallet}
              card={clearBooks ? TEAL_CARD : NAVY_CARD}
              mark={clearBooks ? 'bg-teal-soft text-teal' : 'bg-white text-navy'}
              selected={focus === 'ALL'}
              onClick={() => setFocus('ALL')}
            />
            <StatCard
              label="Customers with dues"
              value={String(summary.customersWithDues)}
              hint="Tap to show every balance"
              icon={Users}
              card={BLUE_CARD}
              mark="bg-action-soft text-action"
              selected={focus === 'DUES'}
              onClick={() => setFocus('DUES')}
            />
            <StatCard
              label="Overdue 30+"
              value={String(summary.overdue30Plus)}
              hint="Past the first month"
              icon={Clock}
              card={AMBER_CARD}
              mark="bg-amber-soft text-amber"
              selected={focus === 'OVER_30'}
              onClick={() => setFocus((current) => (current === 'OVER_30' ? 'ALL' : 'OVER_30'))}
            />
            <StatCard
              label="Overdue 60+"
              value={String(summary.overdue60Plus)}
              hint="Needs a reminder"
              icon={AlarmClock}
              card={RED_CARD}
              mark="bg-danger-soft text-danger"
              selected={focus === 'OVER_60'}
              onClick={() => setFocus((current) => (current === 'OVER_60' ? 'ALL' : 'OVER_60'))}
            />
          </div>
          {notice ? (
            <p className="inline-flex items-center gap-2 rounded-xl border border-teal-soft bg-teal-soft px-3 py-2 text-sm font-medium text-teal">
              <CircleCheck size={16} aria-hidden="true" />
              {notice}
            </p>
          ) : null}
          {rows.length === 0 ? (
            <EmptyLedger />
          ) : visibleRows.length === 0 ? (
            <div className="rounded-xl border border-line bg-white p-6 text-center">
              <h2 className="text-md font-semibold text-ink">No customers in this group</h2>
              <p className="text-sm text-ink2">
                Choose another summary card to see those balances.
              </p>
            </div>
          ) : (
            <AgingTable
              rows={visibleRows}
              token={token}
              onRemind={(customerId) => setDialogIds([customerId])}
              onUpdated={() => {
                void reload();
              }}
            />
          )}
        </>
      ) : null}
      {dialogIds && summary ? (
        <ReminderDialog
          rows={rows}
          initialIds={dialogIds}
          sending={sending}
          error={sendError}
          onClose={() => setDialogIds(null)}
          onSend={async (customerIds) => {
            if (!token) {
              return;
            }
            setSending(true);
            setSendError(null);
            try {
              const result = await sendPaymentReminders(token, customerIds);
              const sent = result.results.filter((item) => item.sent).length;
              setNotice(
                sent > 0
                  ? `${sent} reminder${sent === 1 ? '' : 's'} sent.`
                  : (result.results[0]?.message ?? 'No reminders were sent.'),
              );
              setDialogIds(null);
            } catch (caught) {
              setSendError(
                caught instanceof Error ? caught.message : 'The reminders could not be sent',
              );
            } finally {
              setSending(false);
            }
          }}
        />
      ) : null}
    </section>
  );
}

const TEAL_CARD =
  'border-teal bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-teal)_18%,white)_0%,white_52%,var(--ow-teal-soft)_100%)]';
const NAVY_CARD =
  'border-navy bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-navy)_10%,white)_0%,white_55%,var(--ow-bg)_100%)]';
const BLUE_CARD =
  'border-action bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-blue)_22%,white)_0%,white_50%,var(--ow-blue-soft)_100%)]';
const AMBER_CARD =
  'border-amber bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-amber)_22%,white)_0%,white_50%,var(--ow-amber-soft)_100%)]';
const RED_CARD =
  'border-danger bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-red)_16%,white)_0%,white_54%,var(--ow-red-soft)_100%)]';

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  card,
  mark,
  selected,
  onClick,
}: {
  label: string;
  value: string;
  hint: React.ReactNode;
  icon: LucideIcon;
  card: string;
  mark: string;
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition hover:brightness-[0.98] ${card} ${selected ? 'ring-2 ring-navy' : ''}`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${mark}`}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium uppercase tracking-wide text-ink3">{label}</span>
        <span className="block text-md font-semibold leading-tight text-ink">{value}</span>
        <span className="block text-xs leading-tight text-ink2">{hint}</span>
      </span>
    </button>
  );
}

function EmptyLedger(): React.ReactElement {
  return (
    <div className="grid justify-items-center gap-2 rounded-xl border border-teal-soft bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-teal)_14%,white)_0%,white_58%,var(--ow-teal-soft)_100%)] p-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-teal text-white">
        <CircleCheck size={22} aria-hidden="true" />
      </span>
      <h2 className="text-md font-semibold text-ink">No outstanding dues</h2>
      <p className="max-w-md text-sm text-ink2">Credit invoices with a balance will appear here.</p>
    </div>
  );
}
