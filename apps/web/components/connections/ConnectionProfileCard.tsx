'use client';

import type { ConnectionStatus } from '@optiworld/shared';
import { format } from 'date-fns';
import { Check, Send, X, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

export type ConnectionProfile = {
  name: string;
  username: string | null;
  city: string | null;
  phone: string | null;
  address: string | null;
  about: string | null;
  connectedAt: string | null;
  requestedAt?: string | null;
  status: ConnectionStatus | null;
};

export type SearchProfileHit = ConnectionProfile & { id: string };

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  APPROVED: 'Connected',
  PENDING: 'Request pending',
  REJECTED: 'Disconnected',
};

const STATUS_CLASS: Record<ConnectionStatus, string> = {
  APPROVED: 'bg-teal-soft text-teal',
  PENDING: 'bg-amber-soft text-amber',
  REJECTED: 'bg-canvas text-ink3',
};

export function canSendRequest(status: ConnectionStatus | null): boolean {
  return status === null || status === 'REJECTED';
}

export function ConnectionProfileCard({
  profile,
  busy,
  error,
  onClose,
  onSend,
  footer,
  statusLabel,
}: {
  profile: ConnectionProfile;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSend: (() => void) | null;
  footer?: React.ReactNode;
  statusLabel?: string;
}): React.ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const details = [
    { label: 'Username', value: profile.username },
    { label: 'City', value: profile.city },
    { label: 'Phone', value: profile.phone },
    { label: 'Address', value: profile.address },
    { label: 'About us', value: profile.about },
    ...(profile.requestedAt
      ? [{ label: 'Requested', value: formatConnected(profile.requestedAt) }]
      : []),
    ...(profile.connectedAt
      ? [{ label: 'Connected', value: formatConnected(profile.connectedAt) }]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close profile"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connection-profile-title"
        className="relative grid w-full max-w-md gap-4 rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
      >
        <div className="flex items-start gap-3">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-navy text-sm font-semibold text-white"
            aria-hidden="true"
          >
            {initials(profile.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="connection-profile-title" className="truncate text-xl font-semibold text-ink">
              {profile.name}
            </h2>
            {profile.status ? (
              <span
                className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[profile.status]}`}
              >
                {statusLabel ?? STATUS_LABEL[profile.status]}
              </span>
            ) : (
              <p className="mt-1 text-xs text-ink3">Not connected</p>
            )}
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
              <dd className="whitespace-pre-wrap text-sm text-ink">
                {detail.value?.trim() ? detail.value : '—'}
              </dd>
            </div>
          ))}
        </dl>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {onSend ? <SendRequestButton busy={busy} onClick={onSend} /> : null}
        {footer}
      </div>
    </div>
  );
}

export function RespondRequestButtons({
  busy,
  onAccept,
  onDecline,
}: {
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={onAccept}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        <Check size={16} aria-hidden="true" />
        Accept
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onDecline}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60"
      >
        <X size={16} aria-hidden="true" />
        Decline
      </button>
    </div>
  );
}

export function CancelRequestButton({
  busy,
  onClick,
}: {
  busy?: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-danger bg-white px-4 text-sm font-semibold text-danger disabled:opacity-60"
    >
      <XCircle size={16} aria-hidden="true" />
      {busy ? 'Cancelling…' : 'Cancel request'}
    </button>
  );
}

export function CancelRequestDialog({
  name,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close cancel prompt"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-request-title"
        className="relative grid w-full max-w-md gap-4 rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-danger">Cancel request</p>
          <h2 id="cancel-request-title" className="mt-1 text-lg font-semibold text-ink">
            {name}
          </h2>
          <p className="mt-2 text-sm text-ink2">
            This request is withdrawn. The other account will no longer see it, and either side can
            send a new one.
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            className="min-h-12 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink2 disabled:opacity-60"
            onClick={onClose}
          >
            Keep request
          </button>
          <button
            type="button"
            autoFocus
            disabled={busy}
            className="min-h-12 rounded-xl bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60"
            onClick={onConfirm}
          >
            {busy ? 'Cancelling…' : 'Cancel request'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SendRequestButton({
  busy,
  onClick,
}: {
  busy?: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white disabled:opacity-60"
    >
      <Send size={16} aria-hidden="true" />
      {busy ? 'Sending…' : 'Send request'}
    </button>
  );
}

export function SearchResultList({
  hits,
  emptyLabel,
  onSend,
}: {
  hits: SearchProfileHit[];
  emptyLabel: string | null;
  onSend: (id: string) => Promise<void>;
}): React.ReactElement {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = hits.find((hit) => hit.id === selectedId) ?? null;

  function send(id: string): void {
    setBusy(true);
    setError(null);
    void onSend(id)
      .then(() => setSelectedId(null))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'The request could not be sent');
      })
      .finally(() => setBusy(false));
  }

  return (
    <>
      <ul className="grid gap-2">
        {hits.map((hit) => (
          <li
            key={hit.id}
            className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
            onClick={() => setSelectedId(hit.id)}
          >
            <button
              type="button"
              className="min-w-0 flex-1 py-1 text-left"
              onClick={() => setSelectedId(hit.id)}
            >
              <p className="text-sm font-medium text-ink">{hit.name}</p>
              <p className="text-xs text-ink3">
                {[hit.city, hit.phone].filter(Boolean).join(' · ') || 'No contact on file'}
              </p>
            </button>
            {canSendRequest(hit.status) ? (
              <SendRequestButton onClick={() => setSelectedId(hit.id)} />
            ) : hit.status ? (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[hit.status]}`}
              >
                {STATUS_LABEL[hit.status]}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {emptyLabel ? <p className="text-sm text-ink2">{emptyLabel}</p> : null}
      {selected ? (
        <ConnectionProfileCard
          profile={selected}
          busy={busy}
          error={error}
          onClose={() => {
            if (!busy) {
              setError(null);
              setSelectedId(null);
            }
          }}
          onSend={canSendRequest(selected.status) ? () => send(selected.id) : null}
        />
      ) : null}
    </>
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

function formatConnected(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return format(parsed, 'd MMM yyyy');
}
