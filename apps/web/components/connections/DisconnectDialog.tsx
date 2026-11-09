'use client';

import { Unlink } from 'lucide-react';
import { useEffect } from 'react';

type DisconnectDialogProps = {
  name: string;
  message: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function DisconnectDialog({
  name,
  message,
  busy,
  error,
  onClose,
  onConfirm,
}: DisconnectDialogProps): React.ReactElement {
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close disconnect prompt"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="disconnect-title"
        className="relative grid w-full max-w-md gap-4 rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-danger">Disconnect</p>
          <h2 id="disconnect-title" className="mt-1 text-lg font-semibold text-ink">
            {name}
          </h2>
          <p className="mt-2 text-sm text-ink2">{message}</p>
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
            Keep connected
          </button>
          <button
            type="button"
            autoFocus
            disabled={busy}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60"
            onClick={onConfirm}
          >
            <Unlink size={16} aria-hidden="true" />
            {busy ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </div>
      </div>
    </div>
  );
}
