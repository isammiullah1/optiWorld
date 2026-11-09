'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { WhatsAppMark } from '@/components/WhatsAppMark';

import { loadRetailerSettings, saveRetailerSettings } from './inventory-api';
import { ReminderSettings } from './ReminderSettings';
import { SettingsPanel } from './SettingsPanel';

export function ShopSettings(): React.ReactElement {
  const { data: session, status } = useSession();
  const token = session?.accessToken;
  const isOwner = session?.user.role === 'OWNER';
  const sessionReady = status !== 'loading';
  const [threshold, setThreshold] = useState('5');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadRetailerSettings(token)
      .then((settings) => {
        setThreshold(String(settings.defaultLowStockThreshold));
        setUsername(settings.username ?? '');
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Settings could not be loaded');
      })
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <section className="mx-auto grid w-full min-w-0 max-w-6xl gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-ink2">Shop preferences and WhatsApp configuration.</p>
      </div>
      <SettingsPanel
        title="Shop preferences"
        description="The username other businesses use, and the default low-stock alert."
        icon={SlidersHorizontal}
        tone="blue"
        defaultOpen
      >
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!token || !isOwner) {
              return;
            }
            const value = Number(threshold);
            if (!Number.isInteger(value) || value < 0) {
              setError('Enter a threshold of zero or more');
              return;
            }
            setSaving(true);
            setError(null);
            setMessage(null);
            void saveRetailerSettings(token, { defaultLowStockThreshold: value })
              .then((settings) => {
                setThreshold(String(settings.defaultLowStockThreshold));
                setUsername(settings.username ?? '');
                setMessage('Shop settings saved.');
              })
              .catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : 'Settings could not be saved');
              })
              .finally(() => setSaving(false));
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-ink2">
              Username
              <input
                value={loading ? '' : username}
                disabled
                readOnly
                className="min-h-11 rounded-lg border border-line bg-canvas px-3 text-sm text-ink outline-none"
              />
              <span className="text-xs text-ink3">
                Laboratories and wholesalers use this exact username. Only OptiWorld can change it.
              </span>
            </label>
            <label className="grid gap-1 text-sm text-ink2">
              Default low-stock threshold
              <input
                value={loading ? '' : threshold}
                inputMode="numeric"
                disabled={!sessionReady || !isOwner || loading}
                onChange={(event) => setThreshold(event.target.value)}
                className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-action disabled:bg-canvas"
              />
              <span className="text-xs text-ink3">
                Each batch can override this. An alert is created when a batch reaches its
                threshold.
              </span>
            </label>
          </div>
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
              className="min-h-11 w-fit rounded-lg bg-action px-4 text-sm font-medium text-white"
            >
              Save settings
            </button>
          ) : null}
          {sessionReady && !isOwner ? (
            <p className="text-sm text-ink3">Only the owner can change this threshold.</p>
          ) : null}
        </form>
      </SettingsPanel>
      <SettingsPanel
        title="WhatsApp configuration"
        description="The shop number, when payment reminders go out, and the message customers receive."
        icon={WhatsAppMark}
        tone="teal"
        defaultOpen
      >
        <ReminderSettings />
      </SettingsPanel>
    </section>
  );
}
