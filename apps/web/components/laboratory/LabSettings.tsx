'use client';

import type { LabSessionProfile } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { CustomerPhoneField } from '@/components/retailer/CustomerPhoneField';
import { LabTeam } from './LabTeam';
import { loadLabProfile, saveLabAccount, saveLabProfile } from './lab-account-api';

const fieldClass =
  'min-h-11 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-action disabled:bg-canvas';

export function LabSettings(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [profile, setProfile] = useState<LabSessionProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    void loadLabProfile(token)
      .then((next) => {
        if (active) {
          setProfile(next);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Settings could not be loaded');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const isAdmin = profile?.account.role === 'ADMIN';

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-xl font-semibold text-ink">Settings</h2>
        <p className="text-sm text-ink2">Laboratory details, your profile, and staff accounts.</p>
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
          <LaboratoryForm
            profile={profile}
            canEdit={isAdmin}
            onSave={async (input) => {
              const next = await saveLabProfile(token, input);
              setProfile(next);
            }}
          />
          <AccountForm
            profile={profile}
            onSave={async (input) => {
              const next = await saveLabAccount(token, input);
              setProfile(next);
            }}
          />
          {isAdmin ? <LabTeam /> : null}
        </>
      ) : null}
    </section>
  );
}

function LaboratoryForm({
  profile,
  canEdit,
  onSave,
}: {
  profile: LabSessionProfile;
  canEdit: boolean;
  onSave: (input: {
    name: string;
    username: string;
    phone: string;
    city: string;
    address: string;
    whatsappNumber: string;
    about: string;
  }) => Promise<void>;
}): React.ReactElement {
  const lab = profile.laboratory;
  const [name, setName] = useState(lab.name);
  const [username, setUsername] = useState(lab.username ?? '');
  const [phone, setPhone] = useState(lab.phone ?? '');
  const [city, setCity] = useState(lab.city ?? '');
  const [address, setAddress] = useState(lab.address ?? '');
  const [whatsappNumber, setWhatsappNumber] = useState(lab.whatsappNumber ?? '');
  const [about, setAbout] = useState(lab.about ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 rounded-xl border border-line bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canEdit) {
          return;
        }
        setSaving(true);
        setError(null);
        setMessage(null);
        void onSave({ name, username, phone, city, address, whatsappNumber, about })
          .then(() => setMessage('Laboratory profile saved.'))
          .catch((caught: unknown) =>
            setError(
              caught instanceof Error
                ? caught.message
                : 'The laboratory profile could not be saved',
            ),
          )
          .finally(() => setSaving(false));
      }}
    >
      <div>
        <h3 className="text-md font-semibold text-ink">Laboratory profile</h3>
        <p className="text-sm text-ink2">
          Shops use the username when they send a connection request.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Laboratory name" value={name} disabled={!canEdit} onChange={setName} />
        <Field label="Username" value={username} disabled={!canEdit} onChange={setUsername} />
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
      <p className="text-sm text-ink3">About us is shown with your laboratory profile.</p>
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
          {saving ? 'Saving…' : 'Save laboratory'}
        </button>
      ) : (
        <p className="text-sm text-ink3">Only an admin can change the laboratory profile.</p>
      )}
    </form>
  );
}

function AccountForm({
  profile,
  onSave,
}: {
  profile: LabSessionProfile;
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
      className="grid gap-3 rounded-xl border border-line bg-white p-4"
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
      <div>
        <h3 className="text-md font-semibold text-ink">Your profile</h3>
        <p className="text-sm text-ink2">{profile.account.email}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" value={name} onChange={setName} />
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
        Leave the password fields blank to keep the current password.
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
