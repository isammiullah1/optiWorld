'use client';

import {
  RETAILER_FEATURES,
  RETAILER_FEATURE_LABELS,
  type RetailerFeature,
  type RetailerStaffMember,
} from '@optiworld/shared';
import { Trash2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import {
  createRetailerStaffAccount,
  deleteRetailerStaffAccount,
  loadRetailerStaff,
  saveRetailerStaffAccount,
} from './retailer-account-api';

const fieldClass =
  'min-h-11 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-action disabled:bg-white';

type Draft = {
  id: string | null;
  name: string;
  email: string;
  phone: string;
  password: string;
  role: 'OWNER' | 'STAFF';
  isActive: boolean;
  features: RetailerFeature[];
};

const EMPTY: Draft = {
  id: null,
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'STAFF',
  isActive: true,
  features: [...RETAILER_FEATURES],
};

export function RetailerTeam(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [staff, setStaff] = useState<RetailerStaffMember[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<RetailerStaffMember | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const currentUserId = session?.user.userId;

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadRetailerStaff(token)
      .then((rows) => {
        setStaff(rows);
        setError(null);
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Accounts could not be loaded'),
      );
  }, [token]);

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white"
          onClick={() => setDraft(EMPTY)}
        >
          Add account
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {staff === null && !error ? (
        <div className="h-16 animate-pulse rounded-lg bg-canvas" />
      ) : null}
      <ul className="grid gap-2">
        {staff?.map((member) => (
          <li
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {member.name}{' '}
                <span className="text-xs font-normal text-ink3">
                  {member.role === 'OWNER' ? 'Owner' : 'Staff'}
                </span>
              </p>
              <p className="truncate text-xs text-ink2">{member.email}</p>
              <p className="text-xs text-ink3">
                {member.isActive ? 'Active' : 'Inactive'}
                {member.role === 'STAFF'
                  ? ` · ${member.features.map((feature) => RETAILER_FEATURE_LABELS[feature]).join(', ') || 'No sections'}`
                  : ' · Full access'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink2"
                onClick={() =>
                  setDraft({
                    id: member.id,
                    name: member.name,
                    email: member.email,
                    phone: member.phone ?? '',
                    password: '',
                    role: member.role,
                    isActive: member.isActive,
                    features: member.features,
                  })
                }
              >
                Edit
              </button>
              {member.id === currentUserId ? null : (
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-danger bg-danger-soft px-3 text-xs font-semibold text-danger hover:bg-danger hover:text-white"
                  onClick={() => {
                    setRemoveError(null);
                    setRemoving(member);
                  }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {draft ? (
        <StaffForm
          draft={draft}
          saving={saving}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSubmit={() => {
            if (!token) {
              return;
            }
            setSaving(true);
            setError(null);
            const request = draft.id
              ? saveRetailerStaffAccount(token, draft.id, {
                  name: draft.name,
                  phone: draft.phone,
                  password: draft.password,
                  role: draft.role,
                  isActive: draft.isActive,
                  features: draft.features,
                })
              : createRetailerStaffAccount(token, {
                  name: draft.name,
                  email: draft.email,
                  phone: draft.phone,
                  password: draft.password,
                  role: draft.role,
                  features: draft.features,
                });
            void request
              .then(() => loadRetailerStaff(token))
              .then((rows) => {
                setStaff(rows);
                setDraft(null);
              })
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error ? caught.message : 'The account could not be saved',
                ),
              )
              .finally(() => setSaving(false));
          }}
        />
      ) : null}
      {removing ? (
        <DeleteAccountDialog
          name={removing.name}
          busy={saving}
          error={removeError}
          onClose={() => {
            if (!saving) {
              setRemoving(null);
            }
          }}
          onConfirm={() => {
            if (!token) {
              return;
            }
            setSaving(true);
            setRemoveError(null);
            void deleteRetailerStaffAccount(token, removing.id)
              .then(() => loadRetailerStaff(token))
              .then((rows) => {
                setStaff(rows);
                setRemoving(null);
                if (draft?.id === removing.id) {
                  setDraft(null);
                }
              })
              .catch((caught: unknown) => {
                setRemoveError(
                  caught instanceof Error ? caught.message : 'This account could not be deleted',
                );
              })
              .finally(() => setSaving(false));
          }}
        />
      ) : null}
    </div>
  );
}

function StaffForm({
  draft,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  draft: Draft;
  saving: boolean;
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSubmit: () => void;
}): React.ReactElement {
  return (
    <form
      className="grid gap-3 rounded-lg border border-line bg-canvas p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h4 className="text-sm font-semibold text-ink">
        {draft.id ? 'Edit account' : 'New account'}
      </h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-ink2">
          Name
          <input
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-xs text-ink2">
          Email
          <input
            type="email"
            value={draft.email}
            disabled={draft.id !== null}
            onChange={(event) => onChange({ ...draft, email: event.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-xs text-ink2">
          Phone
          <input
            value={draft.phone}
            onChange={(event) => onChange({ ...draft, phone: event.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-xs text-ink2">
          {draft.id ? 'New password' : 'Password'}
          <input
            type="password"
            value={draft.password}
            onChange={(event) => onChange({ ...draft, password: event.target.value })}
            className={fieldClass}
          />
        </label>
        <label className="grid gap-1 text-xs text-ink2">
          Role
          <select
            value={draft.role}
            onChange={(event) =>
              onChange({ ...draft, role: event.target.value === 'OWNER' ? 'OWNER' : 'STAFF' })
            }
            className={fieldClass}
          >
            <option value="STAFF">Staff</option>
            <option value="OWNER">Owner</option>
          </select>
        </label>
        {draft.id ? (
          <label className="flex min-h-11 items-center gap-2 self-end text-sm text-ink">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => onChange({ ...draft, isActive: event.target.checked })}
            />
            Account is active
          </label>
        ) : null}
      </div>
      <p className="text-xs text-ink3">
        Email is set when the account is created. Only OptiWorld can change it later.
      </p>
      {draft.role === 'STAFF' ? (
        <fieldset className="grid gap-2">
          <legend className="text-xs text-ink2">Sections this staff account can use</legend>
          <div className="flex flex-wrap gap-2">
            {RETAILER_FEATURES.map((feature) => {
              const checked = draft.features.includes(feature);
              return (
                <label
                  key={feature}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onChange({
                        ...draft,
                        features: checked
                          ? draft.features.filter((item) => item !== feature)
                          : [...draft.features, feature],
                      })
                    }
                  />
                  {RETAILER_FEATURE_LABELS[feature]}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-ink2">
          Owners can use every section and manage accounts. Ledger stays with owners.
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save account'}
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm text-ink2"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteAccountDialog({
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close delete prompt"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="relative grid w-full max-w-md gap-4 rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-danger">Delete account</p>
          <h2 id="delete-account-title" className="mt-1 text-lg font-semibold text-ink">
            {name}
          </h2>
          <p className="mt-2 text-sm text-ink2">This account is removed and cannot sign in.</p>
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
            Keep account
          </button>
          <button
            type="button"
            autoFocus
            disabled={busy}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-danger px-4 text-sm font-semibold text-white disabled:opacity-60"
            onClick={onConfirm}
          >
            <Trash2 size={16} aria-hidden="true" />
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
