'use client';

import type { WholesalerLedger as LedgerData } from '@optiworld/shared';
import { Banknote, BookOpen, Wallet } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { formatRupee } from '@/components/retailer/dashboard-format';

import { loadWholesalerLedger, receiveRetailerCredit } from './wholesaler-api';
import {
  AMBER_CARD,
  fieldClass,
  headCellClass,
  headRowClass,
  MetricCard,
  TEAL_CARD,
} from './wholesaler-surface';

export function WholesalerLedger(): React.ReactElement {
  const { data: session, status } = useSession();
  const [ledger, setLedger] = useState<LedgerData | null>(null);
  const [error, setError] = useState('');
  const [focus, setFocus] = useState<'ALL' | 'CREDIT'>('ALL');
  const [paying, setPaying] = useState<LedgerData['rows'][number] | null>(null);

  const refresh = useCallback((): void => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    void loadWholesalerLedger(token)
      .then((next) => {
        setLedger(next);
        setError('');
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'The ledger could not be loaded');
      });
  }, [session?.accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (status === 'loading' || (status === 'authenticated' && !ledger && !error)) {
    return (
      <div className="h-40 animate-pulse rounded-xl border border-line bg-white" aria-busy="true" />
    );
  }
  if (error || !ledger) {
    return (
      <div className="rounded-xl border border-line bg-white p-6" role="alert">
        <p className="text-md font-medium text-ink">Ledger unavailable</p>
        <p className="mt-1 text-sm text-ink2">{error || 'Try again in a moment.'}</p>
      </div>
    );
  }

  const rows =
    focus === 'CREDIT'
      ? ledger.rows.filter((row) => Number(row.creditOutstanding) > 0)
      : ledger.rows;

  return (
    <div className="grid gap-4">
      <p className="text-sm text-ink2">
        Cash already taken, and credit still outstanding, for each connected retailer.
      </p>
      <section className="grid gap-2 sm:grid-cols-2">
        <MetricCard
          label="Cash received"
          value={formatRupee(ledger.cashReceived)}
          card={TEAL_CARD}
          mark="bg-teal-soft text-teal"
          icon={Banknote}
          pressed={focus === 'ALL'}
          onClick={() => setFocus('ALL')}
        />
        <MetricCard
          label="Credit outstanding"
          value={formatRupee(ledger.creditOutstanding)}
          hint={`${ledger.retailersWithDues} retailers with dues`}
          card={AMBER_CARD}
          mark="bg-amber-soft text-amber"
          icon={Wallet}
          pressed={focus === 'CREDIT'}
          onClick={() => setFocus('CREDIT')}
        />
      </section>
      <section className="overflow-hidden rounded-xl border border-action-soft bg-white">
        {rows.length === 0 ? (
          <div className="p-6 text-center">
            <BookOpen className="mx-auto text-action" size={20} aria-hidden="true" />
            <p className="mt-2 text-md font-medium text-ink">No retailers in this view</p>
            <p className="mt-1 text-sm text-ink2">
              Approved connections appear here. Credit shows after you open a credit order.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className={headRowClass}>
                  {['Retailer', 'Cash', 'Credit outstanding', 'Open credit orders', 'Action'].map(
                    (heading) => (
                      <th key={heading} className={headCellClass}>
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.retailerOrgId} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-sm text-ink">
                      <span className="block font-medium">{row.retailerName}</span>
                      <span className="text-ink2">
                        {[row.city, row.phone].filter(Boolean).join(' · ')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm font-medium text-teal">
                      {formatRupee(row.cashReceived)}
                    </td>
                    <td className="px-3 py-2 text-sm font-medium text-amber">
                      {formatRupee(row.creditOutstanding)}
                    </td>
                    <td className="px-3 py-2 text-sm text-ink2">{row.openCreditOrders}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={Number(row.creditOutstanding) <= 0}
                        className="inline-flex h-8 items-center rounded-lg bg-action px-2 text-xs font-medium text-white disabled:opacity-40"
                        onClick={() => setPaying(row)}
                      >
                        Receive
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {paying && session?.accessToken ? (
        <ReceiveDialog
          token={session.accessToken}
          retailerName={paying.retailerName}
          retailerOrgId={paying.retailerOrgId}
          outstanding={paying.creditOutstanding}
          onClose={() => setPaying(null)}
          onSaved={(next) => {
            setLedger(next);
            setPaying(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ReceiveDialog({
  token,
  retailerName,
  retailerOrgId,
  outstanding,
  onClose,
  onSaved,
}: {
  token: string;
  retailerName: string;
  retailerOrgId: string;
  outstanding: string;
  onClose: () => void;
  onSaved: (ledger: LedgerData) => void;
}): React.ReactElement {
  const [amount, setAmount] = useState(outstanding);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const next = await receiveRetailerCredit(token, {
        retailerOrgId,
        amount,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      onSaved(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The payment could not be recorded');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-navy/40 p-3" onClick={onClose}>
      <form
        role="dialog"
        aria-labelledby="receive-title"
        className="grid w-full max-w-md gap-3 rounded-xl border border-line bg-white p-4"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 id="receive-title" className="text-lg font-semibold text-ink">
          Receive from {retailerName}
        </h2>
        <p className="text-sm text-ink2">
          Outstanding {formatRupee(outstanding)}. This reduces the credit.
        </p>
        <label className="grid gap-1 text-xs text-ink2">
          Amount
          <input
            aria-label="Amount received"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-xs text-ink2">
          Notes
          <input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={fieldClass}
          />
        </label>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line px-4 text-sm"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-lg bg-action px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Record payment'}
          </button>
        </div>
      </form>
    </div>
  );
}
