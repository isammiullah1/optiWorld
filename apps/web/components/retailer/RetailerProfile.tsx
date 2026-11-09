'use client';

import type { RetailerSessionProfile } from '@optiworld/shared';
import { Store, UserRound, Users } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { CustomerPhoneField } from './CustomerPhoneField';
import { RetailerTeam } from './RetailerTeam';
import { SettingsPanel } from './SettingsPanel';
import {
  loadRetailerProfile,
  saveRetailerAccount,
  saveRetailerShopProfile,
} from './retailer-account-api';

const fieldClass =
  'min-h-11 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-action disabled:bg-canvas';

export function RetailerProfile(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [profile, setProfile] = useState<RetailerSessionProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    void loadRetailerProfile(token)
      .then((next) => {
        if (active) {
          setProfile(next);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'The profile could not be loaded');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const isOwner = profile?.account.role === 'OWNER';

  return (
    <section className="mx-auto grid w-full min-w-0 max-w-6xl gap-4">
      <div>
        <h2 className="text-xl font-semibold text-ink">Profile</h2>
        <p className="text-sm text-ink2">Shop details, your account, and the team.</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {profile === null && !error ? (
        <div className="h-40 animate-pulse rounded-xl bg-white" />
      ) : null}
      {profile && token ? (
        <>
          <SettingsPanel
            title="Shop profile"
            description="Laboratories and wholesalers use the username when they send a connection request."
            icon={Store}
            tone="blue"
          >
            <ShopForm
              profile={profile}
              canEdit={isOwner}
              onSave={async (input) => {
                const next = await saveRetailerShopProfile(token, input);
                setProfile(next);
              }}
            />
          </SettingsPanel>
          <SettingsPanel
            title="Your profile"
            description={profile.account.role === 'OWNER' ? 'Owner' : 'Staff'}
            icon={UserRound}
            tone="teal"
          >
            <AccountForm
              profile={profile}
              onSave={async (input) => {
                const next = await saveRetailerAccount(token, input);
                setProfile(next);
              }}
            />
          </SettingsPanel>
          {isOwner ? (
            <SettingsPanel
              title="Team"
              description="Create owner or staff accounts. Staff can be limited to selected sections."
              icon={Users}
              tone="amber"
            >
              <RetailerTeam />
            </SettingsPanel>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function ShopForm({
  profile,
  canEdit,
  onSave,
}: {
  profile: RetailerSessionProfile;
  canEdit: boolean;
  onSave: (input: {
    name: string;
    phone: string;
    city: string;
    address: string;
    whatsappNumber: string;
    about: string;
  }) => Promise<void>;
}): React.ReactElement {
  const shop = profile.shop;
  const [name, setName] = useState(shop.name);
  const [phone, setPhone] = useState(shop.phone ?? '');
  const [city, setCity] = useState(shop.city ?? '');
  const [address, setAddress] = useState(shop.address ?? '');
  const [whatsappNumber, setWhatsappNumber] = useState(shop.whatsappNumber ?? '');
  const [about, setAbout] = useState(shop.about ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canEdit) {
          return;
        }
        setSaving(true);
        setError(null);
        setMessage(null);
        void onSave({ name, phone, city, address, whatsappNumber, about })
          .then(() => setMessage('Shop profile saved.'))
          .catch((caught: unknown) =>
            setError(
              caught instanceof Error ? caught.message : 'The shop profile could not be saved',
            ),
          )
          .finally(() => setSaving(false));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Shop name" value={name} disabled={!canEdit} onChange={setName} />
        <Field label="Username" value={shop.username ?? ''} disabled onChange={() => undefined} />
        <Field label="Phone" value={phone} disabled={!canEdit} onChange={setPhone} />
        <CustomerPhoneField
          label="WhatsApp"
          inputLabel="WhatsApp number"
          icon="message"
          value={whatsappNumber}
          disabled={!canEdit}
          onChange={setWhatsappNumber}
        />
        <Field label="City" value={city} disabled={!canEdit} onChange={setCity} />
        <Field label="Address" value={address} disabled={!canEdit} onChange={setAddress} />
      </div>
      <Field label="About us" value={about} disabled={!canEdit} onChange={setAbout} multiline />
      <p className="text-sm text-ink3">
        About us is shown with your shop profile. The username can only be changed by OptiWorld.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-teal">{message}</p> : null}
      {canEdit ? (
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 w-fit rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save shop'}
        </button>
      ) : (
        <p className="text-sm text-ink3">Only an owner can change the shop profile.</p>
      )}
    </form>
  );
}

function AccountForm({
  profile,
  onSave,
}: {
  profile: RetailerSessionProfile;
  onSave: (input: {
    name: string;
    phone: string;
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
}): React.ReactElement {
  const [name, setName] = useState(profile.account.name);
  const [phone, setPhone] = useState(profile.account.phone ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        setSaving(true);
        setError(null);
        setMessage(null);
        void onSave({ name, phone, currentPassword, newPassword })
          .then(() => {
            setCurrentPassword('');
            setNewPassword('');
            setMessage('Your profile was saved.');
          })
          .catch((caught: unknown) =>
            setError(caught instanceof Error ? caught.message : 'Your profile could not be saved'),
          )
          .finally(() => setSaving(false));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" value={name} onChange={setName} />
        <Field label="Email" value={profile.account.email} disabled onChange={() => undefined} />
        <Field label="Phone" value={phone} onChange={setPhone} />
        <Field
          label="Current password"
          value={currentPassword}
          onChange={setCurrentPassword}
          type="password"
        />
        <Field label="New password" value={newPassword} onChange={setNewPassword} type="password" />
      </div>
      <p className="text-sm text-ink3">
        Email can only be changed by OptiWorld. Leave the password fields blank to keep the current
        password.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-teal">{message}</p> : null}
      <button
        type="submit"
        disabled={saving}
        className="min-h-11 w-fit rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
      >
        {saving ? 'Saving…' : 'Save profile'}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled = false,
  type = 'text',
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: 'text' | 'password';
  multiline?: boolean;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-sm text-ink2">
      {label}
      {multiline ? (
        <textarea
          value={value}
          disabled={disabled}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldClass} py-2`}
        />
      ) : (
        <input
          type={type}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={fieldClass}
        />
      )}
    </label>
  );
}
