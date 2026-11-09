'use client';

import type { RetailerSettings } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import {
  loadRetailerSettings,
  removeBillLogo,
  saveRetailerSettings,
  uploadBillLogo,
} from './inventory-api';
import { resolveBillLogoUrl, ShopMark } from './ShopMark';
import { BillLogoField } from './BillLogoField';

const EMPTY: PadDraft = {
  billHeading: '',
  billTagline: '',
  billTerms: '',
  billLogoUrl: null,
  phone: '',
  city: '',
  address: '',
  businessName: '',
};

type PadDraft = {
  billHeading: string;
  billTagline: string;
  billTerms: string;
  billLogoUrl: string | null;
  phone: string;
  city: string;
  address: string;
  businessName: string;
};

export function BillPadSettings(): React.ReactElement {
  const { data: session, status } = useSession();
  const token = session?.accessToken;
  const isOwner = session?.user.role === 'OWNER';
  const sessionReady = status !== 'loading';
  const [draft, setDraft] = useState<PadDraft>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadRetailerSettings(token)
      .then((settings) => setDraft(fromSettings(settings)))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'The bill pad could not be loaded');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const heading = draft.billHeading.trim() || draft.businessName || 'Shop';
  const contact = [draft.phone, draft.address, draft.city]
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const logoUrl = resolveBillLogoUrl(draft.billLogoUrl);
  const editable = canEdit(sessionReady, isOwner, loading);

  return (
    <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <form
        className="grid gap-3 rounded-xl border border-line bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!token || !isOwner) {
            return;
          }
          setSaving(true);
          setError(null);
          setMessage(null);
          void saveRetailerSettings(token, {
            billHeading: draft.billHeading,
            billTagline: draft.billTagline,
            billTerms: draft.billTerms,
            phone: draft.phone,
            city: draft.city,
            address: draft.address,
          })
            .then((settings) => {
              setDraft(fromSettings(settings));
              setMessage(
                'Bill pad saved. New bills, printed receipts, and WhatsApp receipts use this.',
              );
            })
            .catch((caught: unknown) => {
              setError(
                caught instanceof Error ? caught.message : 'The bill pad could not be saved',
              );
            })
            .finally(() => setSaving(false));
        }}
      >
        <div>
          <h1 className="text-xl font-semibold text-ink">Bill pad</h1>
          <p className="text-sm text-ink2">
            Header, logo, contact lines, and the terms printed on every bill.
          </p>
        </div>
        <BillLogoField
          logoUrl={logoUrl}
          disabled={!editable}
          busy={logoBusy}
          onUpload={async (image) => {
            if (!token) {
              return;
            }
            setLogoBusy(true);
            setError(null);
            try {
              const settings = await uploadBillLogo(token, image);
              setDraft(fromSettings(settings));
              setMessage('Logo saved. It appears on the bill and on printed receipts.');
            } finally {
              setLogoBusy(false);
            }
          }}
          onRemove={async () => {
            if (!token) {
              return;
            }
            setLogoBusy(true);
            setError(null);
            try {
              const settings = await removeBillLogo(token);
              setDraft(fromSettings(settings));
              setMessage('Logo removed. The bill shows the shop initials again.');
            } finally {
              setLogoBusy(false);
            }
          }}
        />
        <Field
          label="Header name"
          value={draft.billHeading}
          disabled={!editable}
          onChange={(billHeading) => setDraft({ ...draft, billHeading })}
          placeholder={draft.businessName || 'Shop name'}
        />
        <Field
          label="Tagline"
          value={draft.billTagline}
          disabled={!editable}
          onChange={(billTagline) => setDraft({ ...draft, billTagline })}
          placeholder="Your text here"
        />
        <Field
          label="Phone"
          value={draft.phone}
          disabled={!editable}
          onChange={(phone) => setDraft({ ...draft, phone })}
        />
        <Field
          label="Address"
          value={draft.address}
          disabled={!editable}
          onChange={(address) => setDraft({ ...draft, address })}
        />
        <Field
          label="City"
          value={draft.city}
          disabled={!editable}
          onChange={(city) => setDraft({ ...draft, city })}
        />
        <label className="grid gap-1 text-sm text-ink2">
          Terms & conditions
          <textarea
            aria-label="Terms and conditions"
            value={loading ? '' : draft.billTerms}
            disabled={!editable}
            rows={6}
            maxLength={2000}
            onChange={(event) => setDraft({ ...draft, billTerms: event.target.value })}
            placeholder="Goods once sold are not returnable. Lenses are cut to the prescription on this bill."
            className="rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action disabled:bg-canvas"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {message ? <p className="text-sm text-teal">{message}</p> : null}
        {sessionReady && isOwner ? (
          <button
            type="submit"
            disabled={saving || loading}
            className="min-h-[44px] rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save bill pad'}
          </button>
        ) : null}
        {sessionReady && !isOwner ? (
          <p className="text-sm text-ink3">Only the owner can change the bill pad.</p>
        ) : null}
      </form>
      <aside className="rounded-xl border border-line bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink3">Preview</p>
        <div className="mt-3 flex items-center gap-3 border-b border-line pb-3">
          <ShopMark name={heading} logoUrl={logoUrl} />
          <div>
            <p className="text-lg font-semibold text-ink">{heading}</p>
            <p className="text-sm italic text-ink2">{draft.billTagline.trim() || 'Optical bill'}</p>
            {contact.length > 0 ? <p className="text-xs text-ink3">{contact.join(' · ')}</p> : null}
          </div>
        </div>
        <h2 className="mt-3 text-sm italic text-ink">Terms & Conditions</h2>
        <p className="mt-1 whitespace-pre-wrap text-xs text-ink2">
          {draft.billTerms.trim() || 'Terms appear here after you write them.'}
        </p>
      </aside>
    </section>
  );
}

function Field({
  label,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-sm text-ink2">
      {label}
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[44px] rounded-lg border border-line px-3 text-base text-ink outline-none focus:border-action disabled:bg-canvas"
      />
    </label>
  );
}

function fromSettings(settings: RetailerSettings): PadDraft {
  return {
    businessName: settings.businessName,
    billHeading: settings.billHeading,
    billTagline: settings.billTagline,
    billTerms: settings.billTerms,
    billLogoUrl: settings.billLogoUrl,
    phone: settings.phone ?? '',
    city: settings.city ?? '',
    address: settings.address ?? '',
  };
}

function canEdit(sessionReady: boolean, isOwner: boolean, loading: boolean): boolean {
  return sessionReady && isOwner && !loading;
}
