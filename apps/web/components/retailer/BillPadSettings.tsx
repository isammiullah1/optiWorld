'use client';

import type { RetailerSettings } from '@optiworld/shared';
import {
  Building2,
  Image,
  MapPin,
  Phone,
  Quote,
  Receipt,
  Save,
  ScrollText,
  Store,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { isShopOwnerRole } from '@/lib/shop-scope';

import { BillLogoField } from './BillLogoField';
import {
  loadRetailerSettings,
  removeBillLogo,
  saveRetailerSettings,
  uploadBillLogo,
} from './inventory-api';
import { SettingsPanel } from './SettingsPanel';
import { resolveBillLogoUrl, ShopMark } from './ShopMark';

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
  const isOwner = isShopOwnerRole(session?.user.role);
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
  const logoUrl = resolveBillLogoUrl(draft.billLogoUrl);
  const editable = canEdit(sessionReady, isOwner, loading);

  return (
    <section className="mx-auto grid w-full min-w-0 max-w-6xl gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Bill pad</h1>
        <p className="text-sm text-ink2">
          Header, logo, contact lines, and the terms printed on every bill.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-teal">{message}</p> : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="grid gap-4">
          <SettingsPanel
            title="Logo"
            description="PNG, JPG, or WebP, under 1 MB. It replaces the initials on the bill."
            icon={Image}
            tone="blue"
            defaultOpen
          >
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
          </SettingsPanel>
          <form
            className="grid gap-4"
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
            <SettingsPanel
              title="Header and contact"
              description="The name, tagline, and contact lines at the top of every bill."
              icon={Store}
              tone="teal"
              defaultOpen
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Header name"
                  icon={Type}
                  value={draft.billHeading}
                  disabled={!editable}
                  onChange={(billHeading) => setDraft({ ...draft, billHeading })}
                  placeholder={draft.businessName || 'Shop name'}
                />
                <Field
                  label="Tagline"
                  icon={Quote}
                  value={draft.billTagline}
                  disabled={!editable}
                  onChange={(billTagline) => setDraft({ ...draft, billTagline })}
                  placeholder="Your text here"
                />
                <Field
                  label="Phone"
                  icon={Phone}
                  value={draft.phone}
                  disabled={!editable}
                  onChange={(phone) => setDraft({ ...draft, phone })}
                />
                <Field
                  label="City"
                  icon={Building2}
                  value={draft.city}
                  disabled={!editable}
                  onChange={(city) => setDraft({ ...draft, city })}
                />
                <div className="sm:col-span-2">
                  <Field
                    label="Address"
                    icon={MapPin}
                    value={draft.address}
                    disabled={!editable}
                    onChange={(address) => setDraft({ ...draft, address })}
                  />
                </div>
              </div>
            </SettingsPanel>
            <SettingsPanel
              title="Terms and conditions"
              description="Printed under the items on every bill and receipt."
              icon={ScrollText}
              tone="amber"
              defaultOpen
            >
              <label className="grid gap-1 text-sm text-ink2">
                <span className="inline-flex items-center gap-1.5">
                  <ScrollText size={14} className="text-amber" aria-hidden="true" />
                  Terms
                </span>
                <textarea
                  aria-label="Terms and conditions"
                  value={loading ? '' : draft.billTerms}
                  disabled={!editable}
                  rows={6}
                  maxLength={2000}
                  onChange={(event) => setDraft({ ...draft, billTerms: event.target.value })}
                  placeholder="Goods once sold are not returnable. Lenses are cut to the prescription on this bill."
                  className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action disabled:bg-canvas"
                />
              </label>
            </SettingsPanel>
            {sessionReady && isOwner ? (
              <button
                type="submit"
                disabled={saving || loading}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                <Save size={16} aria-hidden="true" />
                {saving ? 'Saving…' : 'Save bill pad'}
              </button>
            ) : null}
            {sessionReady && !isOwner ? (
              <p className="text-sm text-ink3">Only the owner can change the bill pad.</p>
            ) : null}
          </form>
        </div>
        <aside className="grid gap-3 rounded-xl border-2 border-navy bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-navy)_10%,white)_0%,white_55%,var(--ow-bg)_100%)] p-4">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-navy">
              <Receipt size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Bill preview</p>
              <p className="text-xs text-ink3">How the header and terms print</p>
            </div>
          </div>
          <article className="overflow-hidden rounded-xl border border-action-soft bg-white">
            <div className="flex items-center gap-3 border-b border-action-soft bg-action-soft px-4 py-4">
              <ShopMark name={heading} logoUrl={logoUrl} />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-ink">{heading}</p>
                <p className="truncate text-sm italic text-ink2">
                  {draft.billTagline.trim() || 'Optical bill'}
                </p>
              </div>
            </div>
            <div className="grid gap-2 px-4 py-3">
              <PreviewLine icon={Phone} text={draft.phone.trim()} empty="Phone" />
              <PreviewLine icon={MapPin} text={draft.address.trim()} empty="Address" />
              <PreviewLine icon={Building2} text={draft.city.trim()} empty="City" />
            </div>
            <div className="border-t border-action-soft px-4 py-3">
              <h2 className="inline-flex items-center gap-1.5 text-sm italic text-ink">
                <ScrollText size={14} className="text-amber" aria-hidden="true" />
                Terms & Conditions
              </h2>
              <p className="mt-1 whitespace-pre-wrap text-xs text-ink2">
                {draft.billTerms.trim() || 'Terms appear here after you write them.'}
              </p>
            </div>
          </article>
        </aside>
      </div>
    </section>
  );
}

function Field({
  label,
  icon: Icon,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  placeholder?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-sm text-ink2">
      <span className="inline-flex items-center gap-1.5">
        <Icon size={14} className="text-teal" aria-hidden="true" />
        {label}
      </span>
      <input
        aria-label={label}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action disabled:bg-canvas"
      />
    </label>
  );
}

function PreviewLine({
  icon: Icon,
  text,
  empty,
}: {
  icon: LucideIcon;
  text: string;
  empty: string;
}): React.ReactElement {
  const filled = text.length > 0;
  return (
    <p className={`flex items-start gap-2 text-sm ${filled ? 'text-ink' : 'text-ink3'}`}>
      <Icon size={14} className="mt-0.5 shrink-0 text-action" aria-hidden="true" />
      <span className="min-w-0">{filled ? text : empty}</span>
    </p>
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
