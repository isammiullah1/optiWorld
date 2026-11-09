'use client';

import type {
  RetailerSearchHit,
  VisibilityMode,
  WholesalerConnectionLists,
  WholesalerRetailerConnection,
} from '@optiworld/shared';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { formatRelativeTime, formatShortDate } from '@/components/retailer/dashboard-format';

import {
  CancelRequestButton,
  CancelRequestDialog,
  ConnectionProfileCard,
  SearchResultList,
  SendRequestButton,
} from '@/components/connections/ConnectionProfileCard';
import { DisconnectButton } from '@/components/connections/DisconnectButton';
import { DisconnectDialog } from '@/components/connections/DisconnectDialog';

import {
  approveConnection,
  cancelConnection,
  connectRetailerShop,
  declineConnection,
  loadConnections,
  searchRetailerShops,
  updateVisibility,
} from './wholesaler-api';

const TABS = ['Connected', 'Pending', 'Declined'] as const;
type Tab = (typeof TABS)[number];

const VISIBILITY_OPTIONS: readonly { value: VisibilityMode; label: string }[] = [
  { value: 'FULL', label: 'Full catalog' },
  { value: 'PRICES_HIDDEN', label: 'Prices hidden' },
  { value: 'CATALOG_HIDDEN', label: 'Catalog hidden' },
];

export function RetailerConnections(): React.ReactElement {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<Tab>('Connected');
  const [lists, setLists] = useState<WholesalerConnectionLists | null>(null);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState<WholesalerRetailerConnection | null>(null);
  const [disconnecting, setDisconnecting] = useState<WholesalerRetailerConnection | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [profile, setProfile] = useState<WholesalerRetailerConnection | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<WholesalerRetailerConnection | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const refresh = useCallback((): void => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    void loadConnections(token)
      .then((data) => {
        setLists(data);
        setError('');
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Could not load retailers');
      });
  }, [session?.accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (status === 'loading' || (status === 'authenticated' && !lists && !error)) {
    return (
      <div className="h-48 animate-pulse rounded-xl border border-line bg-white" aria-busy="true" />
    );
  }
  if (!lists) {
    return (
      <div className="rounded-xl border border-line bg-white p-6" role="alert">
        <p className="text-md font-medium text-ink">Retailers unavailable</p>
        <p className="mt-1 text-sm text-ink2">{error}</p>
        <button
          type="button"
          className="mt-3 min-h-11 text-sm font-medium text-action"
          onClick={refresh}
        >
          Try again
        </button>
      </div>
    );
  }

  const rows =
    tab === 'Connected' ? lists.connected : tab === 'Pending' ? lists.pending : lists.declined;

  return (
    <div className="space-y-3">
      <ShopLookup
        onSearch={async (query) => {
          const token = session?.accessToken;
          if (!token) {
            return [];
          }
          return searchRetailerShops(token, query);
        }}
        onConnect={async (retailerOrgId) => {
          const token = session?.accessToken;
          if (!token) {
            return;
          }
          await connectRetailerShop(token, retailerOrgId);
          refresh();
        }}
      />
      {lists.outgoing.length > 0 ? (
        <section className="rounded-xl border border-line bg-white p-4">
          <h2 className="text-sm font-medium text-ink">Waiting for the shop</h2>
          <ul className="mt-2 grid gap-2">
            {lists.outgoing.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 border-t border-line py-2 first:border-t-0"
              >
                <button
                  type="button"
                  className="flex min-h-11 min-w-0 flex-1 items-center text-left text-sm text-ink2"
                  onClick={() => setProfile(row)}
                >
                  <span className="font-medium text-action">{row.retailerName}</span>
                  {row.city ? <span className="text-ink3">{` · ${row.city}`}</span> : null}
                </button>
                <CancelRequestButton
                  onClick={() => {
                    setCancelError(null);
                    setCancelling(row);
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Retailer connections">
        {TABS.map((item) => {
          const count =
            item === 'Connected'
              ? lists.connected.length
              : item === 'Pending'
                ? lists.pending.length
                : lists.declined.length;
          return (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={`min-h-11 rounded-full px-3 text-xs font-medium ${
                tab === item ? 'bg-action text-white' : 'border border-line bg-white text-ink2'
              }`}
              onClick={() => setTab(item)}
            >
              {item} {count}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-6 text-center">
          <p className="text-md font-medium text-ink">{emptyTitle(tab)}</p>
          <p className="mt-1 text-sm text-ink2">{emptyBody(tab)}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {(tab === 'Connected'
                  ? ['Retailer', 'City', 'Visibility', 'Orders', 'Last order', 'Actions']
                  : tab === 'Pending'
                    ? ['Retailer', 'City', 'Requested', 'Actions']
                    : ['Retailer', 'City', 'Declined', 'Actions']
                ).map((heading) => (
                  <th
                    key={heading}
                    className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-3 py-2 text-xs font-medium text-ink">
                    <button
                      type="button"
                      className="min-h-11 text-left font-medium text-action"
                      onClick={() => setProfile(row)}
                    >
                      {row.retailerName}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs text-ink2">{row.city ?? '—'}</td>
                  {tab === 'Connected' ? (
                    <>
                      <td className="px-3 py-2">
                        <VisibilityBadge mode={row.visibilityMode} />
                      </td>
                      <td className="px-3 py-2 text-xs text-ink">{row.orderCount}</td>
                      <td className="px-3 py-2 text-xs text-ink2">
                        {row.lastOrderAt ? formatRelativeTime(row.lastOrderAt) : 'No orders yet'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="sr-only" htmlFor={`visibility-${row.id}`}>
                            Visibility for {row.retailerName}
                          </label>
                          <select
                            id={`visibility-${row.id}`}
                            className="min-h-11 rounded-lg border border-line bg-white px-2 text-xs text-ink"
                            value={row.visibilityMode}
                            onChange={(event) => {
                              const token = session?.accessToken;
                              const mode = event.target.value as VisibilityMode;
                              if (!token) {
                                return;
                              }
                              void updateVisibility(token, row.id, mode)
                                .then(refresh)
                                .catch((caught: unknown) => {
                                  setError(
                                    caught instanceof Error
                                      ? caught.message
                                      : 'Could not update visibility',
                                  );
                                });
                            }}
                          >
                            {VISIBILITY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <Link
                            href="/wholesaler/price-control"
                            className="inline-flex min-h-11 items-center text-xs font-medium text-action"
                          >
                            Manage
                          </Link>
                          <DisconnectButton
                            onClick={() => {
                              setDisconnectError(null);
                              setDisconnecting(row);
                            }}
                          />
                        </div>
                      </td>
                    </>
                  ) : null}
                  {tab === 'Pending' ? (
                    <>
                      <td className="px-3 py-2 text-xs text-ink2">
                        {formatShortDate(row.requestedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="min-h-11 rounded-lg bg-action px-3 text-xs font-medium text-white"
                          onClick={() => setApproving(row)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="ml-2 min-h-11 rounded-lg border border-line px-3 text-xs text-danger"
                          onClick={() => {
                            const token = session?.accessToken;
                            if (!token) {
                              return;
                            }
                            void declineConnection(token, row.id)
                              .then(() => {
                                setTab('Declined');
                                refresh();
                              })
                              .catch((caught: unknown) => {
                                setError(
                                  caught instanceof Error
                                    ? caught.message
                                    : 'Could not decline this request',
                                );
                              });
                          }}
                        >
                          Decline
                        </button>
                      </td>
                    </>
                  ) : null}
                  {tab === 'Declined' ? (
                    <>
                      <td className="px-3 py-2 text-xs text-ink2">
                        {formatShortDate(row.updatedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <SendRequestButton onClick={() => setProfile(row)} />
                      </td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {profile ? (
        <ConnectionProfileCard
          profile={{
            name: profile.retailerName,
            username: profile.username,
            city: profile.city,
            phone: profile.phone,
            address: profile.address,
            about: profile.about,
            connectedAt: profile.status === 'APPROVED' ? profile.approvedAt : null,
            requestedAt: profile.status === 'PENDING' ? profile.requestedAt : null,
            status: profile.status,
          }}
          statusLabel={
            profile.status === 'PENDING' && lists.outgoing.some((row) => row.id === profile.id)
              ? 'Waiting for the shop'
              : undefined
          }
          footer={
            profile.status === 'PENDING' && lists.outgoing.some((row) => row.id === profile.id) ? (
              <CancelRequestButton
                onClick={() => {
                  setCancelError(null);
                  setCancelling(profile);
                }}
              />
            ) : null
          }
          busy={profileBusy}
          error={profileError}
          onClose={() => {
            if (!profileBusy) {
              setProfileError(null);
              setProfile(null);
            }
          }}
          onSend={
            profile.status === 'REJECTED'
              ? () => {
                  const token = session?.accessToken;
                  if (!token) {
                    return;
                  }
                  setProfileBusy(true);
                  setProfileError(null);
                  void connectRetailerShop(token, profile.retailerOrgId)
                    .then(() => {
                      setProfile(null);
                      refresh();
                    })
                    .catch((caught: unknown) => {
                      setProfileError(
                        caught instanceof Error ? caught.message : 'The request could not be sent',
                      );
                    })
                    .finally(() => setProfileBusy(false));
                }
              : null
          }
        />
      ) : null}
      {cancelling ? (
        <CancelRequestDialog
          name={cancelling.retailerName}
          busy={cancelBusy}
          error={cancelError}
          onClose={() => {
            if (!cancelBusy) {
              setCancelError(null);
              setCancelling(null);
            }
          }}
          onConfirm={() => {
            const token = session?.accessToken;
            if (!token) {
              return;
            }
            setCancelBusy(true);
            setCancelError(null);
            void cancelConnection(token, cancelling.id)
              .then(() => {
                setCancelling(null);
                setProfile(null);
                refresh();
              })
              .catch((caught: unknown) => {
                setCancelError(
                  caught instanceof Error ? caught.message : 'The request could not be cancelled',
                );
              })
              .finally(() => setCancelBusy(false));
          }}
        />
      ) : null}
      {disconnecting ? (
        <DisconnectDialog
          name={disconnecting.retailerName}
          message="This shop will lose catalog access until you accept a new request. Orders already on file stay as they are."
          busy={disconnectBusy}
          error={disconnectError}
          onClose={() => {
            if (!disconnectBusy) {
              setDisconnecting(null);
            }
          }}
          onConfirm={() => {
            const token = session?.accessToken;
            if (!token) {
              return;
            }
            setDisconnectBusy(true);
            setDisconnectError(null);
            void declineConnection(token, disconnecting.id)
              .then(() => {
                setDisconnecting(null);
                setTab('Declined');
                refresh();
              })
              .catch((caught: unknown) => {
                setDisconnectError(
                  caught instanceof Error ? caught.message : 'This shop could not be disconnected',
                );
              })
              .finally(() => setDisconnectBusy(false));
          }}
        />
      ) : null}
      {approving ? (
        <ApproveDialog
          retailerName={approving.retailerName}
          onClose={() => setApproving(null)}
          onApprove={(mode) => {
            const token = session?.accessToken;
            if (!token) {
              return;
            }
            void approveConnection(token, approving.id, mode)
              .then(() => {
                setApproving(null);
                setTab('Connected');
                refresh();
              })
              .catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'Could not approve this request',
                );
                setApproving(null);
              });
          }}
        />
      ) : null}
    </div>
  );
}

function ApproveDialog({
  retailerName,
  onClose,
  onApprove,
}: {
  retailerName: string;
  onClose: () => void;
  onApprove: (mode: VisibilityMode) => void;
}): React.ReactElement {
  const [mode, setMode] = useState<VisibilityMode>('FULL');
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="approve-title"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close approval"
        onClick={onClose}
      />
      <form
        className="relative w-full max-w-md rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
        onSubmit={(event) => {
          event.preventDefault();
          onApprove(mode);
        }}
      >
        <h2 id="approve-title" className="text-lg font-semibold text-ink">
          How much of your catalog should this retailer see?
        </h2>
        <p className="mt-1 text-sm text-ink2">{retailerName}</p>
        <fieldset className="mt-3 space-y-2">
          <legend className="sr-only">Catalog visibility</legend>
          {VISIBILITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm text-ink"
            >
              <input
                type="radio"
                name="visibilityMode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink2"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white"
          >
            Approve
          </button>
        </div>
      </form>
    </div>
  );
}

export function VisibilityBadge({ mode }: { mode: VisibilityMode }): React.ReactElement {
  const styles: Record<VisibilityMode, string> = {
    FULL: 'bg-teal-soft text-teal',
    PRICES_HIDDEN: 'bg-amber-soft text-amber',
    CATALOG_HIDDEN: 'bg-canvas text-ink3',
  };
  const labels: Record<VisibilityMode, string> = {
    FULL: 'Full catalog',
    PRICES_HIDDEN: 'Prices hidden',
    CATALOG_HIDDEN: 'Catalog hidden',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[mode]}`}>
      {labels[mode]}
    </span>
  );
}

function ShopLookup({
  onSearch,
  onConnect,
}: {
  onSearch: (query: string) => Promise<RetailerSearchHit[]>;
  onConnect: (retailerOrgId: string) => Promise<void>;
}): React.ReactElement {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RetailerSearchHit[]>([]);
  const [lookedUp, setLookedUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 rounded-xl border border-line bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const term = query.trim();
        if (term.length < 3) {
          setHits([]);
          setLookedUp(false);
          setError('Enter the exact username or ID.');
          return;
        }
        void onSearch(term)
          .then((next) => {
            setHits(next);
            setLookedUp(true);
            setError(null);
          })
          .catch((caught: unknown) => {
            setHits([]);
            setLookedUp(false);
            setError(caught instanceof Error ? caught.message : 'The shop could not be found');
          });
      }}
    >
      <label className="grid gap-1 text-sm text-ink2">
        Retailer username or ID
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHits([]);
            setLookedUp(false);
            setError(null);
          }}
          placeholder="Exact username or ID"
          className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-action"
        />
      </label>
      <p className="text-xs text-ink3">
        A shop appears only when this matches the username or ID they shared with you.
      </p>
      <button
        type="submit"
        className="min-h-11 justify-self-start rounded-lg bg-action px-4 text-sm font-medium text-white"
      >
        Find retailer
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <SearchResultList
        hits={hits.map((hit) => ({ ...hit, status: hit.connectionStatus }))}
        emptyLabel={lookedUp && hits.length === 0 ? 'No shop matches that username or ID.' : null}
        onSend={async (id) => {
          await onConnect(id);
          setHits((current) =>
            current.map((row) =>
              row.id === id ? { ...row, connectionStatus: 'PENDING', connectedAt: null } : row,
            ),
          );
        }}
      />
    </form>
  );
}

function emptyTitle(tab: Tab): string {
  if (tab === 'Pending') {
    return 'No pending requests';
  }
  if (tab === 'Declined') {
    return 'No declined requests';
  }
  return 'No connected retailers';
}

function emptyBody(tab: Tab): string {
  if (tab === 'Pending') {
    return 'New requests from shops will appear here.';
  }
  if (tab === 'Declined') {
    return 'Declined requests stay here for 30 days.';
  }
  return 'Approve a request to share your catalog.';
}
