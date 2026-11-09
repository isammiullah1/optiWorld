'use client';

import type { QuoteRequest, VisibilityMode, WholesalerRetailerConnection } from '@optiworld/shared';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { formatRelativeTime } from '@/components/retailer/dashboard-format';

import {
  declineConnection,
  loadConnections,
  loadQuoteRequests,
  updateVisibility,
} from './wholesaler-api';

export function PriceControl(): React.ReactElement {
  const { data: session, status } = useSession();
  const [retailers, setRetailers] = useState<WholesalerRetailerConnection[]>([]);
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [revoking, setRevoking] = useState<WholesalerRetailerConnection | null>(null);

  const refresh = useCallback((): void => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    void Promise.all([loadConnections(token), loadQuoteRequests(token)])
      .then(([connections, requests]) => {
        setRetailers(connections.connected);
        setQuotes(requests);
        setError('');
        setReady(true);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Could not load price control');
        setReady(true);
      });
  }, [session?.accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (status === 'loading' || !ready) {
    return (
      <div className="h-48 animate-pulse rounded-xl border border-line bg-white" aria-busy="true" />
    );
  }

  return (
    <div className="space-y-4">
      <aside className="rounded-xl border border-action bg-action-soft px-4 py-3 text-sm text-ink">
        Pricing is controlled at the relationship level. Each retailer only sees pricing you
        explicitly share with them. No retailer can compare prices across wholesalers. Enforced at
        the data level.
      </aside>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {retailers.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-6 text-center">
          <p className="text-md font-medium text-ink">No connected retailers</p>
          <p className="mt-1 text-sm text-ink2">Approve a shop before choosing what it can see.</p>
        </div>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {retailers.map((retailer) => (
            <article
              key={retailer.id}
              id={retailer.id}
              className="rounded-xl border border-line bg-white p-4"
            >
              <h2 className="text-md font-semibold text-ink">{retailer.retailerName}</h2>
              <p className="text-xs text-ink3">{retailer.city ?? 'City not set'}</p>
              <div
                className="mt-3 grid grid-cols-2 gap-2"
                role="group"
                aria-label={`Visibility for ${retailer.retailerName}`}
              >
                <ModeButton
                  active={retailer.visibilityMode === 'FULL'}
                  label="Live pricing"
                  onClick={() =>
                    changeMode(session?.accessToken, retailer.id, 'FULL', refresh, setError)
                  }
                />
                <ModeButton
                  active={retailer.visibilityMode === 'PRICES_HIDDEN'}
                  label="Quote on request"
                  onClick={() =>
                    changeMode(
                      session?.accessToken,
                      retailer.id,
                      'PRICES_HIDDEN',
                      refresh,
                      setError,
                    )
                  }
                />
              </div>
              <p className={`mt-3 text-xs font-medium ${modeClass(retailer.visibilityMode)}`}>
                {modeCopy(retailer.visibilityMode)}
              </p>
              <button
                type="button"
                className="mt-3 min-h-11 text-xs text-danger"
                onClick={() => setRevoking(retailer)}
              >
                Revoke access
              </button>
            </article>
          ))}
        </section>
      )}
      <section className="rounded-xl border border-line bg-white">
        <h2 className="border-b border-line px-4 py-3 text-md font-semibold text-ink">
          Quote requests
        </h2>
        {quotes.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink2">
            No pending quotes for price-on-request products.
          </p>
        ) : (
          <ul>
            {quotes.map((quote) => (
              <li
                key={quote.id}
                className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 last:border-0"
              >
                <span className="min-w-[140px] text-sm font-medium text-ink">
                  {quote.retailerName}
                </span>
                <span className="text-sm text-ink2">{quote.productName}</span>
                <span className="text-xs text-ink3">Qty {quote.quantity}</span>
                <span className="text-xs text-ink3">{formatRelativeTime(quote.requestedAt)}</span>
                <Link
                  href={`/wholesaler/orders/${quote.orderId}`}
                  className="ml-auto inline-flex min-h-11 items-center text-sm font-medium text-action"
                >
                  Send quote
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {revoking ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-t-xl border border-line bg-white p-4 sm:rounded-xl">
            <h2 className="text-lg font-semibold text-ink">Revoke access</h2>
            <p className="mt-1 text-sm text-ink2">
              {revoking.retailerName} will no longer see this catalog. The decision stays in the
              declined list for 30 days.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink2"
                onClick={() => setRevoking(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg bg-danger px-4 text-sm font-medium text-white"
                onClick={() => {
                  const token = session?.accessToken;
                  if (!token) {
                    return;
                  }
                  void declineConnection(token, revoking.id)
                    .then(() => {
                      setRevoking(null);
                      refresh();
                    })
                    .catch((caught: unknown) => {
                      setError(
                        caught instanceof Error ? caught.message : 'Could not revoke access',
                      );
                      setRevoking(null);
                    });
                }}
              >
                Revoke access
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModeButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`min-h-11 rounded-lg px-2 text-xs font-medium ${
        active ? 'bg-action text-white' : 'border border-line bg-white text-ink2'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function changeMode(
  token: string | undefined,
  connectionId: string,
  mode: VisibilityMode,
  refresh: () => void,
  setError: (message: string) => void,
): void {
  if (!token) {
    return;
  }
  void updateVisibility(token, connectionId, mode)
    .then(refresh)
    .catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : 'Could not update visibility');
    });
}

function modeCopy(mode: VisibilityMode): string {
  if (mode === 'FULL') {
    return 'Retailer sees all products and prices';
  }
  if (mode === 'PRICES_HIDDEN') {
    return 'Retailer must request quotes before ordering';
  }
  return 'Retailer cannot see this catalog';
}

function modeClass(mode: VisibilityMode): string {
  if (mode === 'FULL') {
    return 'text-teal';
  }
  if (mode === 'PRICES_HIDDEN') {
    return 'text-amber';
  }
  return 'text-ink3';
}
