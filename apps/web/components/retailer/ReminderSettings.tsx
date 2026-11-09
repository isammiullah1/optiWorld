'use client';

import {
  paymentReminderMessage,
  type RetailerSessionProfile,
  type RetailerSettings,
} from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { CustomerPhoneField } from '@/components/retailer/CustomerPhoneField';
import { loadRetailerProfile, saveRetailerShopProfile } from './retailer-account-api';

export function ReminderSettings(): React.ReactElement {
  const { data: session, status } = useSession();
  const token = session?.accessToken;
  const isOwner = session?.user.role === 'OWNER';
  const sessionReady = status !== 'loading';
  const [settings, setSettings] = useState<RetailerSettings | null>(null);
  const [profile, setProfile] = useState<RetailerSessionProfile | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingNumber, setSavingNumber] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadRetailerSettings(token)
      .then(setSettings)
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : 'Reminder settings could not be loaded',
        );
      });
    void loadRetailerProfile(token)
      .then((next) => {
        setProfile(next);
        setWhatsappNumber(next.shop.whatsappNumber ?? '');
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : 'The shop WhatsApp number could not be loaded',
        );
      });
  }, [token]);

  const preview = paymentReminderMessage({
    customerName: 'Ayesha Khan',
    businessName: settings?.businessName ?? 'Your shop',
    outstanding: '3,900.00',
    dueOn: '12 Oct 2026',
  });

  const locked = !sessionReady || !isOwner;
  const fieldClass =
    'min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action disabled:bg-canvas';

  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!token || !isOwner || !profile) {
            return;
          }
          setSavingNumber(true);
          setError(null);
          setMessage(null);
          void saveRetailerShopProfile(token, {
            name: profile.shop.name,
            phone: profile.shop.phone ?? '',
            city: profile.shop.city ?? '',
            address: profile.shop.address ?? '',
            about: profile.shop.about ?? '',
            whatsappNumber,
          })
            .then((next) => {
              setProfile(next);
              setWhatsappNumber(next.shop.whatsappNumber ?? '');
              setMessage('WhatsApp number saved.');
            })
            .catch((caught: unknown) => {
              setError(
                caught instanceof Error ? caught.message : 'The WhatsApp number could not be saved',
              );
            })
            .finally(() => setSavingNumber(false));
        }}
      >
        <CustomerPhoneField
          label="Shop WhatsApp number"
          inputLabel="Shop WhatsApp number"
          icon="message"
          value={profile ? whatsappNumber : ''}
          disabled={locked || !profile}
          onChange={setWhatsappNumber}
        />
        <p className="text-xs text-ink3">
          Receipts and payment reminders use this number as the shop contact.
        </p>
        {isOwner ? (
          <button
            type="submit"
            disabled={savingNumber || !profile}
            className="min-h-11 w-fit rounded-lg bg-teal px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            {savingNumber ? 'Saving…' : 'Save number'}
          </button>
        ) : null}
      </form>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!token || !isOwner || !settings) {
            return;
          }
          setSaving(true);
          setError(null);
          setMessage(null);
          void saveRetailerSettings(token, {
            paymentTermDays: settings.paymentTermDays,
            reminderBeforeEnabled: settings.reminderBeforeEnabled,
            reminderBeforeDays: settings.reminderBeforeDays,
            reminderOnDueEnabled: settings.reminderOnDueEnabled,
            reminderAfterEnabled: settings.reminderAfterEnabled,
            reminderAfterDays: settings.reminderAfterDays,
          })
            .then(setSettings)
            .then(() => setMessage('Payment reminders saved.'))
            .catch((caught: unknown) => {
              setError(caught instanceof Error ? caught.message : 'Reminders could not be saved');
            })
            .finally(() => setSaving(false));
        }}
      >
        <h3 className="text-sm font-semibold text-ink">Payment reminders</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm text-ink2">
            Invoices are due this many days after the sale
            <input
              inputMode="numeric"
              disabled={locked || !settings}
              value={settings ? String(settings.paymentTermDays) : ''}
              onChange={(event) => updateNumber(setSettings, 'paymentTermDays', event.target.value)}
              className={fieldClass}
            />
          </label>
          <ReminderToggle
            label="Reminder 1: days before the due date"
            enabled={settings?.reminderBeforeEnabled ?? false}
            days={settings?.reminderBeforeDays ?? 3}
            disabled={locked || !settings}
            onEnabled={(value) =>
              setSettings((current) =>
                current ? { ...current, reminderBeforeEnabled: value } : current,
              )
            }
            onDays={(value) => updateNumber(setSettings, 'reminderBeforeDays', value)}
          />
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-ink">
            <input
              type="checkbox"
              checked={settings?.reminderOnDueEnabled ?? false}
              disabled={locked || !settings}
              onChange={(event) =>
                setSettings((current) =>
                  current ? { ...current, reminderOnDueEnabled: event.target.checked } : current,
                )
              }
            />
            Reminder 2: on the due date
          </label>
          <ReminderToggle
            label="Reminder 3: days after the due date"
            enabled={settings?.reminderAfterEnabled ?? false}
            days={settings?.reminderAfterDays ?? 7}
            disabled={locked || !settings}
            onEnabled={(value) =>
              setSettings((current) =>
                current ? { ...current, reminderAfterEnabled: value } : current,
              )
            }
            onDays={(value) => updateNumber(setSettings, 'reminderAfterDays', value)}
          />
        </div>
        <div>
          <p className="text-sm font-medium text-ink">WhatsApp message</p>
          <p className="mt-1 rounded-lg border border-teal bg-teal-soft p-3 text-sm text-ink2">
            {preview}
          </p>
        </div>
        {sessionReady && isOwner ? (
          <button
            type="submit"
            disabled={saving || !settings}
            className="min-h-11 w-fit rounded-lg bg-teal px-4 text-sm font-medium text-white disabled:opacity-60"
          >
            Save reminders
          </button>
        ) : null}
      </form>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-teal">{message}</p> : null}
      {sessionReady && !isOwner ? (
        <p className="text-sm text-ink3">Only the owner can change WhatsApp configuration.</p>
      ) : null}
    </div>
  );
}

function ReminderToggle({
  label,
  enabled,
  days,
  disabled,
  onEnabled,
  onDays,
}: {
  label: string;
  enabled: boolean;
  days: number;
  disabled: boolean;
  onEnabled: (value: boolean) => void;
  onDays: (value: string) => void;
}): React.ReactElement {
  return (
    <div className="grid gap-2 rounded-lg border border-line bg-white p-3">
      <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(event) => onEnabled(event.target.checked)}
        />
        {label}
      </label>
      <input
        inputMode="numeric"
        aria-label={label}
        disabled={disabled || !enabled}
        value={String(days)}
        onChange={(event) => onDays(event.target.value)}
        className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-action disabled:bg-canvas"
      />
    </div>
  );
}

function updateNumber(
  setSettings: React.Dispatch<React.SetStateAction<RetailerSettings | null>>,
  key: 'paymentTermDays' | 'reminderBeforeDays' | 'reminderAfterDays',
  value: string,
): void {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return;
  }
  setSettings((current) => (current ? { ...current, [key]: parsed } : current));
}
