'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { AgingChart } from './AgingChart';
import { AgingTable } from './AgingTable';
import { CreditReportSection } from './CreditReportSection';
import { loadAgingReport, sendPaymentReminders } from './ledger-api';
import { ReminderDialog } from './ReminderDialog';
import type { AgingReport } from '@optiworld/shared';

export function AgingReportView(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [report, setReport] = useState<AgingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogIds, setDialogIds] = useState<string[] | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setReport(await loadAgingReport(token));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The aging report could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const reload = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    try {
      setReport(await loadAgingReport(token));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The aging report could not be loaded');
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rows = report?.rows ?? [];

  return (
    <section className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Aging report</h1>
        <p className="text-sm text-ink2">Outstanding customer balances by age.</p>
      </div>
      {loading ? (
        <div className="h-40 rounded-xl bg-white" aria-busy="true" />
      ) : error ? (
        <p role="alert" className="rounded-xl border border-line bg-white p-4 text-sm text-danger">
          {error}
        </p>
      ) : report ? (
        <>
          <CreditReportSection />
          <AgingChart buckets={report.buckets} />
          {notice ? <p className="text-sm text-teal">{notice}</p> : null}
          <AgingTable
            rows={rows}
            token={token}
            onRemind={(customerId) => setDialogIds([customerId])}
            onUpdated={() => {
              void reload();
            }}
          />
        </>
      ) : null}
      {dialogIds && report ? (
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
