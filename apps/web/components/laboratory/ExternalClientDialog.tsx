'use client';

import {
  isShopPhone,
  shopPhoneMessage,
  type LabClientRow,
  type SaveExternalLabClientRequest,
} from '@optiworld/shared';
import { BadgeCheck, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { CustomerPhoneField } from '@/components/retailer/CustomerPhoneField';

export function TypeBadge({ type }: { type: LabClientRow['type'] }): React.ReactElement {
  const optiworld = type === 'OPTIWORLD';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${optiworld ? 'bg-action-soft text-action' : 'bg-canvas text-ink3'}`}
    >
      {optiworld ? <BadgeCheck size={14} className="shrink-0" aria-hidden="true" /> : null}
      {optiworld ? 'OptiWorld' : 'External'}
    </span>
  );
}

const fieldClass =
  'box-border h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action';

export function ExternalClientDialog({
  client,
  busy,
  error,
  onClose,
  onSave,
}: {
  client: LabClientRow | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: SaveExternalLabClientRequest) => Promise<void>;
}): React.ReactElement {
  const titleId = useId();
  const [name, setName] = useState(client?.name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [city, setCity] = useState(client?.city ?? '');
  const [address, setAddress] = useState(client?.address ?? '');
  const [about, setAbout] = useState(client?.about ?? '');

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
    <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-navy/40 p-3">
      <form
        className="grid max-h-[calc(100dvh-1.5rem)] w-full max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border-2 border-navy bg-[color-mix(in_srgb,var(--ow-navy)_14%,white)]"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedPhone = phone.trim();
          if (trimmedPhone.length > 0 && !isShopPhone(trimmedPhone)) {
            setPhoneError(shopPhoneMessage(trimmedPhone));
            return;
          }
          setPhoneError(null);
          if (name.trim().length === 0) {
            return;
          }
          void onSave({
            name: name.trim(),
            phone: trimmedPhone,
            city: city.trim(),
            address: address.trim(),
            about: about.trim(),
          });
        }}
      >
        <div className="flex items-start justify-between gap-3 bg-navy p-4 text-white">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {client ? client.name : 'Add external retailer'}
            </h2>
            <p className="mt-1 text-sm text-white/80">
              A shop that is not on OptiWorld. Bills follow the same path as a connected retailer.
            </p>
            <div className="mt-2">
              <TypeBadge type="EXTERNAL" />
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-white/15"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="grid content-start gap-3 overflow-y-auto p-4">
          <label className="grid gap-1 text-xs text-ink2">
            Retailer name
            <input
              value={name}
              required
              autoFocus
              onChange={(event) => setName(event.target.value)}
              className={fieldClass}
            />
          </label>
          <CustomerPhoneField
            label="Phone"
            inputLabel="Retailer phone"
            value={phone}
            error={phoneError ?? undefined}
            onChange={(next) => {
              setPhone(next);
              setPhoneError(null);
            }}
          />
          <label className="grid gap-1 text-xs text-ink2">
            City
            <input
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-xs text-ink2">
            Address
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-1 text-xs text-ink2">
            About us
            <textarea
              value={about}
              rows={3}
              onChange={(event) => setAbout(event.target.value)}
              className="min-h-24 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
            />
          </label>
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-navy/20 p-4">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="min-h-11 rounded-lg border border-navy bg-white px-4 text-sm font-semibold text-navy"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 rounded-lg bg-action px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
