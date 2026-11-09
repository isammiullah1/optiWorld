'use client';

import type {
  ConnectionStatus,
  WholesalerConnection,
  WholesalerSearchHit,
} from '@optiworld/shared';
import { ChevronDown, Eye, MapPin, Phone, UserRound, type LucideIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  CancelRequestButton,
  CancelRequestDialog,
  RespondRequestButtons,
  SearchResultList,
  SendRequestButton,
} from '@/components/connections/ConnectionProfileCard';
import { DisconnectButton } from '@/components/connections/DisconnectButton';
import { DisconnectDialog } from '@/components/connections/DisconnectDialog';

import {
  cancelWholesalerConnection,
  disconnectWholesaler,
  loadWholesalerConnections,
  requestWholesalerConnection,
  respondToWholesalerConnection,
  searchWholesalerOrgs,
} from './catalog-api';
import { formatShortDate } from './dashboard-format';
import { resolveBillLogoUrl, ShopMark } from './ShopMark';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  APPROVED: 'Approved',
  PENDING: 'Pending',
  REJECTED: 'Rejected',
};

const STATUS_CLASS: Record<ConnectionStatus, string> = {
  APPROVED: 'bg-teal-soft text-teal',
  PENDING: 'bg-amber-soft text-amber',
  REJECTED: 'bg-canvas text-ink3',
};

const CONNECTED_BOX =
  'rounded-xl border border-teal-soft bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-teal)_14%,white)_0%,white_58%,var(--ow-teal-soft)_100%)] p-3';
const INCOMING_BOX =
  'rounded-xl border border-danger bg-[linear-gradient(105deg,color-mix(in_srgb,var(--ow-red)_22%,white)_0%,var(--ow-red-soft)_48%,white_100%)] p-3';
const OUTGOING_BOX =
  'rounded-xl border border-amber bg-[linear-gradient(105deg,color-mix(in_srgb,var(--ow-amber)_20%,white)_0%,var(--ow-amber-soft)_50%,white_100%)] p-3';
const DECLINED_BOX =
  'rounded-xl border border-line bg-[linear-gradient(165deg,var(--ow-bg)_0%,white_70%)] p-3';

const VISIBILITY_LABEL = {
  FULL: 'Full catalog',
  PRICES_HIDDEN: 'Prices hidden',
  CATALOG_HIDDEN: 'Catalog hidden',
} as const;

export function WholesalerConnections(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [rows, setRows] = useState<WholesalerConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<WholesalerSearchHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lookedUp, setLookedUp] = useState(false);
  const [disconnecting, setDisconnecting] = useState<WholesalerConnection | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<WholesalerConnection | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    try {
      setRows(await loadWholesalerConnections(token));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Connections could not be loaded');
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function toggleRow(id: string): void {
    setOpenIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function answerRequest(row: WholesalerConnection, accept: boolean): void {
    if (!token) {
      return;
    }
    setBusyId(row.id);
    setError(null);
    void respondToWholesalerConnection(token, row.id, accept)
      .then(() => refresh())
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : accept
              ? 'The request could not be accepted'
              : 'The request could not be declined',
        );
      })
      .finally(() => setBusyId(null));
  }

  function lookupWholesaler(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!token) {
      return;
    }
    const term = query.trim();
    if (term.length < 3) {
      setHits([]);
      setLookedUp(false);
      setSearchError('Enter the exact username or ID.');
      return;
    }
    void searchWholesalerOrgs(token, term)
      .then((next) => {
        setHits(next);
        setLookedUp(true);
        setSearchError(null);
      })
      .catch((caught: unknown) => {
        setHits([]);
        setLookedUp(false);
        setSearchError(
          caught instanceof Error ? caught.message : 'The wholesaler could not be found',
        );
      });
  }

  const incoming = rows?.filter((row) => row.status === 'PENDING' && row.incoming) ?? [];
  const waiting = rows?.filter((row) => row.status === 'PENDING' && !row.incoming) ?? [];
  const connected = rows?.filter((row) => row.status === 'APPROVED') ?? [];
  const declined = rows?.filter((row) => row.status === 'REJECTED') ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Wholesalers</h1>
          <p className="text-sm text-ink2">
            A catalog opens only after that wholesaler approves the connection.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSearching((current) => !current)}
          className="min-h-[44px] rounded-lg bg-action px-4 text-sm font-medium text-white"
        >
          Request connection
        </button>
      </div>
      {searching ? (
        <form
          className="grid gap-3 rounded-xl border border-line bg-white p-4"
          onSubmit={lookupWholesaler}
        >
          <label className="grid gap-1 text-sm text-ink2">
            Wholesaler username or ID
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHits([]);
                setLookedUp(false);
                setSearchError(null);
              }}
              placeholder="Exact username or ID"
              className="min-h-[44px] rounded-lg border border-line px-3 text-base text-ink outline-none focus:border-action"
            />
          </label>
          <p className="text-xs text-ink3">
            A wholesaler appears only when this matches the username or ID they shared with you.
          </p>
          <button
            type="submit"
            className="min-h-[44px] justify-self-start rounded-lg bg-action px-4 text-sm font-medium text-white"
          >
            Find wholesaler
          </button>
          {searchError ? (
            <p role="alert" className="text-sm text-danger">
              {searchError}
            </p>
          ) : null}
          <SearchResultList
            hits={hits.map((hit) => ({ ...hit, status: hit.connectionStatus }))}
            emptyLabel={
              lookedUp && hits.length === 0 ? 'No wholesaler matches that username or ID.' : null
            }
            onSend={async (id) => {
              if (!token) {
                return;
              }
              await requestWholesalerConnection(token, id);
              await refresh();
              setHits((current) =>
                current.map((row) =>
                  row.id === id ? { ...row, connectionStatus: 'PENDING', connectedAt: null } : row,
                ),
              );
            }}
          />
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {rows === null ? <div className="h-24 animate-pulse rounded-xl bg-white" /> : null}
      {rows?.length === 0 ? (
        <section className="rounded-xl border border-line bg-white p-6 text-center">
          <h2 className="text-md font-semibold text-ink">No wholesaler connections</h2>
          <p className="text-sm text-ink2">Request a connection to open a supplier catalog.</p>
        </section>
      ) : null}
      {incoming.length > 0 || waiting.length > 0 ? (
        <section
          className={`grid gap-3 ${incoming.length > 0 && waiting.length > 0 ? 'md:grid-cols-2' : ''}`}
        >
          {incoming.length > 0 ? (
            <div className={INCOMING_BOX}>
              <h2 className="text-md font-semibold text-ink">Connection requests</h2>
              <ul className="mt-3 grid gap-2">
                {incoming.map((row) => (
                  <ConnectionRow
                    key={row.id}
                    row={row}
                    statusLabel="Reply"
                    statusClass="bg-danger text-white"
                    rowClass="bg-white/80 hover:bg-white"
                    open={openIds.includes(row.id)}
                    onToggle={() => toggleRow(row.id)}
                  >
                    <p className="text-sm text-ink2">
                      This wholesaler asked to connect with your shop.
                    </p>
                    <ConnectionFacts row={row} />
                    <div className="mt-4">
                      <RespondRequestButtons
                        busy={busyId === row.id}
                        onAccept={() => answerRequest(row, true)}
                        onDecline={() => answerRequest(row, false)}
                      />
                    </div>
                  </ConnectionRow>
                ))}
              </ul>
            </div>
          ) : null}
          {waiting.length > 0 ? (
            <div className={OUTGOING_BOX}>
              <h2 className="text-md font-semibold text-ink">Waiting for a wholesaler</h2>
              <ul className="mt-3 grid gap-2">
                {waiting.map((row) => (
                  <ConnectionRow
                    key={row.id}
                    row={row}
                    statusLabel={STATUS_LABEL.PENDING}
                    statusClass={STATUS_CLASS.PENDING}
                    rowClass="bg-white/80 hover:bg-white"
                    open={openIds.includes(row.id)}
                    onToggle={() => toggleRow(row.id)}
                  >
                    <p className="text-sm text-ink2">
                      Your request stays here until the wholesaler approves it.
                    </p>
                    <ConnectionFacts row={row} />
                    <div className="mt-4">
                      <CancelRequestButton
                        onClick={() => {
                          setCancelError(null);
                          setCancelling(row);
                        }}
                      />
                    </div>
                  </ConnectionRow>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
      {connected.length > 0 ? (
        <section className={CONNECTED_BOX}>
          <h2 className="text-md font-semibold text-ink">Connected wholesalers</h2>
          <ul className="mt-3 grid gap-2">
            {connected.map((row) => (
              <ConnectionRow
                key={row.id}
                row={row}
                statusLabel={STATUS_LABEL.APPROVED}
                statusClass={STATUS_CLASS.APPROVED}
                rowClass="bg-white/75 hover:bg-white"
                open={openIds.includes(row.id)}
                onToggle={() => toggleRow(row.id)}
              >
                <ConnectionFacts row={row} />
                <div className="mt-4 rounded-lg bg-white px-3 py-2">
                  <p className="text-xs font-medium text-ink2">Catalog visibility</p>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {VISIBILITY_LABEL[row.visibilityMode]}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/retailer/wholesalers/${row.wholesalerOrgId}/catalog`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white"
                  >
                    <Eye size={16} aria-hidden="true" />
                    Open catalog
                  </Link>
                  <DisconnectButton
                    onClick={() => {
                      setDisconnectError(null);
                      setDisconnecting(row);
                    }}
                  />
                </div>
              </ConnectionRow>
            ))}
          </ul>
        </section>
      ) : null}
      {declined.length > 0 ? (
        <section className={DECLINED_BOX}>
          <h2 className="text-md font-semibold text-ink">Declined</h2>
          <ul className="mt-3 grid gap-2">
            {declined.map((row) => (
              <ConnectionRow
                key={row.id}
                row={row}
                statusLabel={STATUS_LABEL.REJECTED}
                statusClass={STATUS_CLASS.REJECTED}
                rowClass="bg-white/80 hover:bg-white"
                open={openIds.includes(row.id)}
                onToggle={() => toggleRow(row.id)}
              >
                <p className="text-sm text-ink2">This wholesaler declined the request.</p>
                <ConnectionFacts row={row} />
                <div className="mt-4">
                  <SendRequestButton
                    busy={busyId === row.id}
                    onClick={() => {
                      if (!token) {
                        return;
                      }
                      setBusyId(row.id);
                      setError(null);
                      void requestWholesalerConnection(token, row.wholesalerOrgId)
                        .then(() => refresh())
                        .catch((caught: unknown) => {
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : 'The request could not be sent',
                          );
                        })
                        .finally(() => setBusyId(null));
                    }}
                  />
                </div>
              </ConnectionRow>
            ))}
          </ul>
        </section>
      ) : null}
      {cancelling ? (
        <CancelRequestDialog
          name={cancelling.wholesalerName}
          busy={cancelBusy}
          error={cancelError}
          onClose={() => {
            if (!cancelBusy) {
              setCancelError(null);
              setCancelling(null);
            }
          }}
          onConfirm={() => {
            if (!token) {
              return;
            }
            setCancelBusy(true);
            setCancelError(null);
            void cancelWholesalerConnection(token, cancelling.id)
              .then(() => refresh())
              .then(() => {
                setCancelling(null);
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
          name={disconnecting.wholesalerName}
          message="This catalog closes until the wholesaler accepts a new request. Orders already on file stay as they are."
          busy={disconnectBusy}
          error={disconnectError}
          onClose={() => {
            if (!disconnectBusy) {
              setDisconnecting(null);
            }
          }}
          onConfirm={() => {
            if (!token) {
              return;
            }
            setDisconnectBusy(true);
            setDisconnectError(null);
            void disconnectWholesaler(token, disconnecting.id)
              .then(() => refresh())
              .then(() => setDisconnecting(null))
              .catch((caught: unknown) => {
                setDisconnectError(
                  caught instanceof Error
                    ? caught.message
                    : 'The wholesaler could not be disconnected',
                );
              })
              .finally(() => setDisconnectBusy(false));
          }}
        />
      ) : null}
    </div>
  );
}

function ConnectionRow({
  row,
  statusLabel,
  statusClass,
  rowClass,
  open,
  onToggle,
  children,
}: {
  row: WholesalerConnection;
  statusLabel: string;
  statusClass: string;
  rowClass: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <li className="overflow-hidden rounded-xl border border-white/80">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${rowClass}`}
      >
        <ShopMark name={row.wholesalerName} logoUrl={resolveBillLogoUrl(row.logoUrl)} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">
            {row.wholesalerName}
          </span>
          <span className="block truncate text-sm text-ink2">
            {row.city?.trim() ? row.city : 'City not set'}
          </span>
        </span>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusClass}`}>
          {statusLabel}
        </span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-ink2 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="border-t border-white/80 bg-white/70 px-4 py-4">{children}</div>
      ) : null}
    </li>
  );
}

function ConnectionFacts({ row }: { row: WholesalerConnection }): React.ReactElement {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Fact icon={UserRound} label="Username" value={row.username} />
      <Fact icon={Phone} label="Phone" value={row.phone} />
      <Fact icon={MapPin} label="City" value={row.city} />
      <Fact icon={MapPin} label="Address" value={row.address} />
      <div className="sm:col-span-2">
        <p className="text-xs font-medium text-ink2">About us</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
          {row.about?.trim() ? row.about : '—'}
        </p>
      </div>
      {row.connectedAt ? (
        <div className="sm:col-span-2">
          <p className="text-xs font-medium text-ink2">Connected</p>
          <p className="mt-1 text-sm text-ink">{formatShortDate(row.connectedAt)}</p>
        </div>
      ) : null}
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string | null;
}): React.ReactElement {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-lg bg-white/75 px-3 py-2">
      <Icon size={16} className="mt-0.5 shrink-0 text-ink2" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-medium text-ink2">{label}</p>
        <p className="break-words text-sm text-ink">{value?.trim() ? value : '—'}</p>
      </div>
    </div>
  );
}
