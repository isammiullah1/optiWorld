'use client';

import type { ConnectionStatus, LabConnection, LabSearchHit } from '@optiworld/shared';
import { ChevronDown, Eye, MapPin, Phone, UserRound, type LucideIcon } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { formatShortDate } from './dashboard-format';

import {
  CancelRequestButton,
  CancelRequestDialog,
  RespondRequestButtons,
  SearchResultList,
  SendRequestButton,
} from '@/components/connections/ConnectionProfileCard';
import { ALERTS_CHANGED_EVENT } from '@/components/retailer/alerts-api';
import { DisconnectButton } from '@/components/connections/DisconnectButton';
import { DisconnectDialog } from '@/components/connections/DisconnectDialog';

import {
  cancelLabConnection,
  connectLab,
  disconnectLab,
  loadLabConnections,
  respondToLabConnection,
  searchLabs,
} from './lab-api';
import { resolveBillLogoUrl, ShopMark } from './ShopMark';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  APPROVED: 'Accepted',
  PENDING: 'Pending',
  REJECTED: 'Declined',
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

export function LabConnections(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [labs, setLabs] = useState<LabConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<LabSearchHit[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lookedUp, setLookedUp] = useState(false);
  const [disconnecting, setDisconnecting] = useState<LabConnection | null>(null);
  const [disconnectBusy, setDisconnectBusy] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [busyLabId, setBusyLabId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<LabConnection | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    try {
      setLabs(await loadLabConnections(token));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Laboratories could not be loaded');
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function toggleLab(id: string): void {
    setOpenIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function answerRequest(lab: LabConnection, accept: boolean): void {
    if (!token) {
      return;
    }
    setBusyLabId(lab.id);
    setError(null);
    void respondToLabConnection(token, lab.id, accept)
      .then(() => refresh())
      .then(() => {
        window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : accept
              ? 'The request could not be accepted'
              : 'The request could not be declined',
        );
      })
      .finally(() => setBusyLabId(null));
  }

  function lookupLab(event: React.FormEvent<HTMLFormElement>): void {
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
    void searchLabs(token, term)
      .then((next) => {
        setHits(next);
        setLookedUp(true);
        setSearchError(null);
      })
      .catch((caught: unknown) => {
        setHits([]);
        setLookedUp(false);
        setSearchError(
          caught instanceof Error ? caught.message : 'The laboratory could not be found',
        );
      });
  }

  const incoming = labs?.filter((lab) => lab.status === 'PENDING' && lab.incoming) ?? [];
  const waiting = labs?.filter((lab) => lab.status === 'PENDING' && !lab.incoming) ?? [];
  const connected = labs?.filter((lab) => lab.status === 'APPROVED') ?? [];
  const declined = labs?.filter((lab) => lab.status === 'REJECTED') ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Laboratories</h1>
          <p className="text-sm text-ink2">
            A laboratory receives jobs only after it accepts the request.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRequesting((open) => !open)}
          className="min-h-[44px] rounded-lg bg-action px-4 text-sm font-medium text-white"
        >
          Request connection
        </button>
      </div>
      {requesting ? (
        <form
          className="grid gap-3 rounded-xl border border-line bg-white p-4"
          onSubmit={lookupLab}
        >
          <label className="grid gap-1 text-sm text-ink2">
            Laboratory username or ID
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
            A laboratory appears only when this matches the username or ID they shared with you.
          </p>
          <button
            type="submit"
            className="min-h-[44px] justify-self-start rounded-lg bg-action px-4 text-sm font-medium text-white"
          >
            Find laboratory
          </button>
          {searchError ? (
            <p role="alert" className="text-sm text-danger">
              {searchError}
            </p>
          ) : null}
          <SearchResultList
            hits={hits.map((hit) => ({ ...hit, status: hit.connectionStatus }))}
            emptyLabel={
              lookedUp && hits.length === 0 ? 'No laboratory matches that username or ID.' : null
            }
            onSend={async (id) => {
              if (!token) {
                return;
              }
              await connectLab(token, id);
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
      {labs === null && !error ? <div className="h-24 animate-pulse rounded-xl bg-white" /> : null}
      {labs?.length === 0 ? (
        <section className="rounded-xl border border-line bg-white p-6 text-center">
          <h2 className="text-md font-semibold text-ink">No laboratories yet</h2>
          <p className="text-sm text-ink2">
            Request a connection before sending prescriptions from billing.
          </p>
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
                {incoming.map((lab) => (
                  <LabRow
                    key={lab.id}
                    lab={lab}
                    statusLabel="Reply"
                    statusClass="bg-danger text-white"
                    rowClass="bg-white/80 hover:bg-white"
                    open={openIds.includes(lab.id)}
                    onToggle={() => toggleLab(lab.id)}
                  >
                    <p className="text-sm text-ink2">
                      This laboratory asked to connect with your shop.
                    </p>
                    <LabFacts lab={lab} />
                    <div className="mt-4">
                      <RespondRequestButtons
                        busy={busyLabId === lab.id}
                        onAccept={() => answerRequest(lab, true)}
                        onDecline={() => answerRequest(lab, false)}
                      />
                    </div>
                  </LabRow>
                ))}
              </ul>
            </div>
          ) : null}
          {waiting.length > 0 ? (
            <div className={OUTGOING_BOX}>
              <h2 className="text-md font-semibold text-ink">Waiting for a laboratory</h2>
              <ul className="mt-3 grid gap-2">
                {waiting.map((lab) => (
                  <LabRow
                    key={lab.id}
                    lab={lab}
                    statusLabel={STATUS_LABEL.PENDING}
                    statusClass={STATUS_CLASS.PENDING}
                    rowClass="bg-white/80 hover:bg-white"
                    open={openIds.includes(lab.id)}
                    onToggle={() => toggleLab(lab.id)}
                  >
                    <p className="text-sm text-ink2">
                      Your request stays here until the laboratory accepts it.
                    </p>
                    <LabFacts lab={lab} />
                    <div className="mt-4">
                      <CancelRequestButton
                        onClick={() => {
                          setCancelError(null);
                          setCancelling(lab);
                        }}
                      />
                    </div>
                  </LabRow>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
      {connected.length > 0 ? (
        <section className={CONNECTED_BOX}>
          <h2 className="text-md font-semibold text-ink">Connected laboratories</h2>
          <ul className="mt-3 grid gap-2">
            {connected.map((lab) => (
              <LabRow
                key={lab.id}
                lab={lab}
                statusLabel={STATUS_LABEL.APPROVED}
                statusClass={STATUS_CLASS.APPROVED}
                rowClass="bg-white/75 hover:bg-white"
                open={openIds.includes(lab.id)}
                onToggle={() => toggleLab(lab.id)}
              >
                <LabFacts lab={lab} />
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-white px-3 py-2">
                    <dt className="text-xs font-medium text-ink2">Active jobs</dt>
                    <dd className="text-lg font-semibold text-ink">{lab.activeJobs}</dd>
                  </div>
                  <div className="rounded-lg bg-white px-3 py-2">
                    <dt className="text-xs font-medium text-ink2">Average turnaround</dt>
                    <dd className="text-lg font-semibold text-ink">
                      {lab.averageTurnaroundDays === null
                        ? '—'
                        : `${lab.averageTurnaroundDays} days`}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/retailer/lab-jobs?lab=${lab.id}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white"
                  >
                    <Eye size={16} aria-hidden="true" />
                    View jobs
                  </Link>
                  <DisconnectButton
                    onClick={() => {
                      setDisconnectError(null);
                      setDisconnecting(lab);
                    }}
                  />
                </div>
              </LabRow>
            ))}
          </ul>
        </section>
      ) : null}
      {declined.length > 0 ? (
        <section className={DECLINED_BOX}>
          <h2 className="text-md font-semibold text-ink">Declined</h2>
          <ul className="mt-3 grid gap-2">
            {declined.map((lab) => (
              <LabRow
                key={lab.id}
                lab={lab}
                statusLabel={STATUS_LABEL.REJECTED}
                statusClass={STATUS_CLASS.REJECTED}
                rowClass="bg-white/80 hover:bg-white"
                open={openIds.includes(lab.id)}
                onToggle={() => toggleLab(lab.id)}
              >
                <p className="text-sm text-ink2">This laboratory declined the request.</p>
                <LabFacts lab={lab} />
                <div className="mt-4">
                  <SendRequestButton
                    busy={busyLabId === lab.id}
                    onClick={() => {
                      if (!token) {
                        return;
                      }
                      setBusyLabId(lab.id);
                      setError(null);
                      void connectLab(token, lab.id)
                        .then(() => refresh())
                        .catch((caught: unknown) => {
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : 'The request could not be sent',
                          );
                        })
                        .finally(() => setBusyLabId(null));
                    }}
                  />
                </div>
              </LabRow>
            ))}
          </ul>
        </section>
      ) : null}
      {cancelling ? (
        <CancelRequestDialog
          name={cancelling.name}
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
            void cancelLabConnection(token, cancelling.id)
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
          name={disconnecting.name}
          message="This laboratory will no longer receive jobs until it accepts a new request. Jobs already on file stay as they are."
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
            void disconnectLab(token, disconnecting.id)
              .then(() => refresh())
              .then(() => setDisconnecting(null))
              .catch((caught: unknown) => {
                setDisconnectError(
                  caught instanceof Error
                    ? caught.message
                    : 'The laboratory could not be disconnected',
                );
              })
              .finally(() => setDisconnectBusy(false));
          }}
        />
      ) : null}
    </div>
  );
}

function LabRow({
  lab,
  statusLabel,
  statusClass,
  rowClass,
  open,
  onToggle,
  children,
}: {
  lab: LabConnection;
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
        <ShopMark name={lab.name} logoUrl={resolveBillLogoUrl(lab.logoUrl)} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{lab.name}</span>
          <span className="block truncate text-sm text-ink2">
            {lab.city?.trim() ? lab.city : 'City not set'}
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

function LabFacts({ lab }: { lab: LabConnection }): React.ReactElement {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Fact icon={UserRound} label="Username" value={lab.username} />
      <Fact icon={Phone} label="Phone" value={lab.phone} />
      <Fact icon={MapPin} label="City" value={lab.city} />
      <Fact icon={MapPin} label="Address" value={lab.address} />
      <div className="sm:col-span-2">
        <p className="text-xs font-medium text-ink2">About us</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
          {lab.about?.trim() ? lab.about : '—'}
        </p>
      </div>
      {lab.connectedAt ? (
        <div className="sm:col-span-2">
          <p className="text-xs font-medium text-ink2">Connected</p>
          <p className="mt-1 text-sm text-ink">{formatShortDate(lab.connectedAt)}</p>
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
