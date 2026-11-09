'use client';

import type { AdminOrgDetail } from '@optiworld/shared';
import { useState } from 'react';

import { AdminRequestError, updateUser } from './admin-api';
import { formatWhen, roleLabel } from './format';
import { StatusBadge, secondaryButton } from './ui';

export function OrgUsersPanel({
  token,
  org,
  onChanged,
}: {
  token: string;
  org: AdminOrgDetail;
  onChanged: () => void;
}): React.ReactElement {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = org.users.find((user) => user.id === pendingId) ?? null;

  async function confirm(): Promise<void> {
    if (!pending) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateUser(token, pending.id, !pending.isActive);
      setPendingId(null);
      onChanged();
    } catch (caught) {
      setError(
        caught instanceof AdminRequestError ? caught.message : 'Something went wrong. Try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (org.users.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink2">
        No users in this organisation yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {pending ? (
        <div className="rounded-xl border border-line bg-white p-4" role="alert">
          <p className="text-sm text-ink">
            {pending.isActive ? `Deactivate ${pending.name}?` : `Reactivate ${pending.name}?`}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg bg-purp px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={saving}
              onClick={() => void confirm()}
            >
              {saving ? 'Saving…' : 'Confirm'}
            </button>
            <button type="button" className={secondaryButton} onClick={() => setPendingId(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              {['Name', 'Email', 'Role', 'Last login', 'Status', 'Actions'].map((heading) => (
                <th
                  key={heading}
                  className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {org.users.map((user) => (
              <tr key={user.id}>
                <td className="border-t border-line px-3 py-2 text-sm text-ink">{user.name}</td>
                <td className="border-t border-line px-3 py-2 text-sm text-ink2">{user.email}</td>
                <td className="border-t border-line px-3 py-2 text-sm text-ink2">
                  {roleLabel(user.role)}
                </td>
                <td className="border-t border-line px-3 py-2 text-sm text-ink2">
                  {formatWhen(user.lastLoginAt)}
                </td>
                <td className="border-t border-line px-3 py-2">
                  <StatusBadge status={user.isActive ? 'ACTIVE' : 'INACTIVE'} />
                </td>
                <td className="border-t border-line px-3 py-2">
                  <button
                    type="button"
                    className="text-sm text-purp"
                    onClick={() => setPendingId(user.id)}
                  >
                    {user.isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
