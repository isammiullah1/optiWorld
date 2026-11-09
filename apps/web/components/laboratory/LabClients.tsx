'use client';

import type {
  LabClientRow,
  LabRequestLists,
  LabRetailerRequest,
  RetailerSearchHit,
} from '@optiworld/shared';
import { Check, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { formatShortDate } from '@/components/retailer/dashboard-format';

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
  acceptLabRequest,
  cancelLabRequest,
  connectLabRetailer,
  declineLabRequest,
  loadLabClients,
  loadLabRequests,
  searchLabRetailers,
} from './lab-api';

export function LabClients(): React.ReactElement {
  const { data: session, status } = useSession();
  const [clients, setClients] = useState<LabClientRow[] | null>(null);
  const [requests, setRequests] = useState<LabRequestLists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<LabClientRow | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [profileClient, setProfileClient] = useState<LabClientRow | null>(null);

  const refresh = useCallback((): void => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    void Promise.all([loadLabClients(token), loadLabRequests(token)])
      .then(([rows, nextRequests]) => {
        setClients(rows);
        setRequests(nextRequests);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Clients could not be loaded');
      });
  }, [session?.accessToken]);

  useEffect(() => {
    if (status === 'loading') {
      return;
    }
    refresh();
  }, [refresh, status]);

  return (
    <section className="grid gap-3">
      <p className="text-sm text-ink2">
        Find a shop by the username they share, or accept a request they send.
      </p>
      <RetailerLookup
        onSearch={async (query) => {
          const token = session?.accessToken;
          if (!token) {
            return [];
          }
          return searchLabRetailers(token, query);
        }}
        onConnect={async (retailerOrgId) => {
          const token = session?.accessToken;
          if (!token) {
            return;
          }
          await connectLabRetailer(token, retailerOrgId);
          refresh();
        }}
      />
      <ConnectionRequests
        requests={requests}
        onAccept={async (requestId) => {
          const token = session?.accessToken;
          if (!token) {
            return;
          }
          try {
            await acceptLabRequest(token, requestId);
            refresh();
          } catch (caught) {
            setError(
              caught instanceof Error ? caught.message : 'The request could not be accepted',
            );
            throw caught;
          }
        }}
        onDecline={async (requestId) => {
          const token = session?.accessToken;
          if (!token) {
            return;
          }
          try {
            await declineLabRequest(token, requestId);
            refresh();
          } catch (caught) {
            setError(
              caught instanceof Error ? caught.message : 'The request could not be declined',
            );
            throw caught;
          }
        }}
        onReconnect={async (retailerOrgId) => {
          const token = session?.accessToken;
          if (!token) {
            return;
          }
          await connectLabRetailer(token, retailerOrgId);
          refresh();
        }}
        onCancel={async (requestId) => {
          const token = session?.accessToken;
          if (!token) {
            return;
          }
          await cancelLabRequest(token, requestId);
          refresh();
        }}
      />
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {clients === null ? (
        <div className="h-40 animate-pulse rounded-xl border border-line bg-white" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase text-ink3">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Total jobs</th>
                <th className="px-3 py-2 font-medium">Last job</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-sm text-ink3">
                    No clients yet.
                  </td>
                </tr>
              ) : null}
              {clients.map((client) => (
                <tr key={client.id} className="border-t border-line text-xs hover:bg-canvas">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="min-h-11 font-medium text-action"
                      onClick={() => setProfileClient(client)}
                    >
                      {client.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-ink2">{client.phone ?? '—'}</td>
                  <td className="px-3 py-2">
                    <TypeBadge type={client.type} />
                  </td>
                  <td className="px-3 py-2">{client.totalJobs}</td>
                  <td className="px-3 py-2 text-ink2">
                    {client.lastJobAt ? formatWhen(client.lastJobAt) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {client.type === 'OPTIWORLD' ? (
                      <DisconnectButton
                        onClick={() => {
                          setDisconnectError(null);
                          setDisconnecting(client);
                        }}
                      />
                    ) : (
                      <span className="text-ink3">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {profileClient ? (
        <ConnectionProfileCard
          profile={{
            name: profileClient.name,
            username: profileClient.username,
            city: profileClient.city,
            phone: profileClient.phone,
            address: profileClient.address,
            about: profileClient.about,
            connectedAt: profileClient.connectedAt,
            status: 'APPROVED',
          }}
          busy={false}
          error={null}
          onClose={() => setProfileClient(null)}
          onSend={null}
          footer={
            <Link
              href={`/laboratory/clients/${profileClient.id}`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-action"
            >
              View jobs
            </Link>
          }
        />
      ) : null}
      {disconnecting ? (
        <DisconnectDialog
          name={disconnecting.name}
          message="This shop can no longer send jobs until you accept a new request. Jobs already on file stay as they are."
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
            void declineLabRequest(token, disconnecting.id)
              .then(() => {
                setDisconnecting(null);
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
    </section>
  );
}

export function TypeBadge({ type }: { type: LabClientRow['type'] }): React.ReactElement {
  const optiworld = type === 'OPTIWORLD';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${optiworld ? 'bg-action-soft text-action' : 'bg-canvas text-ink3'}`}
    >
      {optiworld ? 'OptiWorld' : 'External'}
    </span>
  );
}

function ConnectionRequests({
  requests,
  onAccept,
  onDecline,
  onReconnect,
  onCancel,
}: {
  requests: LabRequestLists | null;
  onAccept: (requestId: string) => Promise<void>;
  onDecline: (requestId: string) => Promise<void>;
  onReconnect: (retailerOrgId: string) => Promise<void>;
  onCancel: (requestId: string) => Promise<void>;
}): React.ReactElement | null {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<LabRetailerRequest | null>(null);
  const [cancelling, setCancelling] = useState<LabRetailerRequest | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState<LabRetailerRequest | null>(null);
  const [reconnectBusy, setReconnectBusy] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const selected = requests?.pending.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, selected]);

  if (
    !requests ||
    (requests.pending.length === 0 &&
      requests.outgoing.length === 0 &&
      requests.declined.length === 0)
  ) {
    return null;
  }

  function decide(kind: 'accept' | 'decline'): void {
    if (!selected || busy) {
      return;
    }
    const requestId = selected.id;
    setBusy(kind);
    setPromptError(null);
    const action = kind === 'accept' ? onAccept(requestId) : onDecline(requestId);
    void action
      .then(() => setSelectedId(null))
      .catch((caught: unknown) => {
        setPromptError(
          caught instanceof Error ? caught.message : 'The request could not be updated',
        );
      })
      .finally(() => setBusy(null));
  }

  return (
    <div className="grid gap-3">
      {requests.pending.length > 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <h2 className="border-b border-line px-3 py-2 text-sm font-medium text-ink">
            Pending requests
          </h2>
          <ul>
            {requests.pending.map((row) => (
              <li key={row.id} className="border-t border-line first:border-t-0">
                <button
                  type="button"
                  className="flex min-h-[60px] w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-canvas"
                  onClick={() => {
                    setPromptError(null);
                    setSelectedId(row.id);
                  }}
                >
                  <span>
                    <span className="block text-sm font-medium text-ink">{row.retailerName}</span>
                    <span className="block text-xs text-ink3">
                      {[row.city, `Requested ${formatShortDate(row.requestedAt)}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <ChevronRight size={16} className="shrink-0 text-ink3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {selected ? (
        <RequestPrompt
          request={selected}
          busy={busy}
          error={promptError}
          onClose={() => {
            if (!busy) {
              setSelectedId(null);
            }
          }}
          onAccept={() => decide('accept')}
          onDecline={() => decide('decline')}
        />
      ) : null}
      {requests.outgoing.length > 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <h2 className="border-b border-line px-3 py-2 text-sm font-medium text-ink">
            Waiting for the shop
          </h2>
          <ul>
            {requests.outgoing.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 first:border-t-0"
              >
                <button
                  type="button"
                  className="flex min-h-11 min-w-0 flex-1 items-center text-left text-sm text-ink2"
                  onClick={() => setViewing(row)}
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
        </div>
      ) : null}
      {requests.declined.length > 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <h2 className="border-b border-line px-3 py-2 text-sm font-medium text-ink">Declined</h2>
          <ul>
            {requests.declined.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 first:border-t-0"
              >
                <button
                  type="button"
                  className="min-h-11 text-left text-sm font-medium text-action"
                  onClick={() => setReconnecting(row)}
                >
                  {row.retailerName}
                  {row.city ? (
                    <span className="block text-xs font-normal text-ink3">{row.city}</span>
                  ) : null}
                </button>
                {row.retailerOrgId ? (
                  <SendRequestButton onClick={() => setReconnecting(row)} />
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {viewing ? (
        <ConnectionProfileCard
          profile={{
            name: viewing.retailerName,
            username: viewing.username,
            city: viewing.city,
            phone: viewing.phone,
            address: viewing.address,
            about: viewing.about,
            connectedAt: null,
            requestedAt: viewing.requestedAt,
            status: viewing.status,
          }}
          statusLabel="Waiting for the shop"
          busy={false}
          error={null}
          onClose={() => setViewing(null)}
          onSend={null}
          footer={
            <CancelRequestButton
              onClick={() => {
                setCancelError(null);
                setCancelling(viewing);
              }}
            />
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
            setCancelBusy(true);
            setCancelError(null);
            void onCancel(cancelling.id)
              .then(() => {
                setCancelling(null);
                setViewing(null);
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
      {reconnecting ? (
        <ConnectionProfileCard
          profile={{
            name: reconnecting.retailerName,
            username: reconnecting.username,
            city: reconnecting.city,
            phone: reconnecting.phone,
            address: reconnecting.address,
            about: reconnecting.about,
            connectedAt: null,
            status: 'REJECTED',
          }}
          busy={reconnectBusy}
          error={reconnectError}
          onClose={() => {
            if (!reconnectBusy) {
              setReconnectError(null);
              setReconnecting(null);
            }
          }}
          onSend={
            reconnecting.retailerOrgId
              ? () => {
                  const retailerOrgId = reconnecting.retailerOrgId;
                  if (!retailerOrgId) {
                    return;
                  }
                  setReconnectBusy(true);
                  setReconnectError(null);
                  void onReconnect(retailerOrgId)
                    .then(() => setReconnecting(null))
                    .catch((caught: unknown) => {
                      setReconnectError(
                        caught instanceof Error ? caught.message : 'The request could not be sent',
                      );
                    })
                    .finally(() => setReconnectBusy(false));
                }
              : null
          }
        />
      ) : null}
    </div>
  );
}

function RequestPrompt({
  request,
  busy,
  error,
  onClose,
  onAccept,
  onDecline,
}: {
  request: LabRetailerRequest;
  busy: 'accept' | 'decline' | null;
  error: string | null;
  onClose: () => void;
  onAccept: () => void;
  onDecline: () => void;
}): React.ReactElement {
  const details = [
    { label: 'City', value: request.city },
    { label: 'Phone', value: request.phone },
    { label: 'Address', value: request.address },
    { label: 'Requested', value: formatShortDate(request.requestedAt) },
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close retailer details"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lab-request-title"
        className="relative grid w-full max-w-md gap-4 rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
      >
        <div className="flex items-start gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-navy text-sm font-semibold text-white"
            aria-hidden="true"
          >
            {initials(request.retailerName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-amber">
              Connection request
            </p>
            <h2 id="lab-request-title" className="truncate text-xl font-semibold text-ink">
              {request.retailerName}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="grid h-11 w-11 place-items-center rounded-lg text-ink3 hover:bg-canvas"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <dl className="grid gap-2 rounded-xl border border-line bg-canvas p-3">
          {details.map((detail) => (
            <div key={detail.label} className="grid grid-cols-[88px_1fr] gap-2">
              <dt className="text-sm text-ink3">{detail.label}</dt>
              <dd className="text-sm text-ink">{detail.value?.trim() ? detail.value : '—'}</dd>
            </div>
          ))}
        </dl>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            autoFocus
            disabled={busy !== null}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-action px-4 text-sm font-semibold text-white disabled:opacity-60"
            onClick={onAccept}
          >
            <Check size={16} aria-hidden="true" />
            {busy === 'accept' ? 'Accepting…' : 'Accept'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-danger bg-danger-soft px-4 text-sm font-semibold text-danger disabled:opacity-60"
            onClick={onDecline}
          >
            <X size={16} aria-hidden="true" />
            {busy === 'decline' ? 'Declining…' : 'Decline'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RetailerLookup({
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

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('');
  return letters.toUpperCase() || 'OW';
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium' }).format(new Date(value));
}
