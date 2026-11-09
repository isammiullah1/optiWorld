'use client';

import type { AdminOrgRow, AdminPlatformUser, OrgType } from '@optiworld/shared';
import { useCallback, useEffect, useState } from 'react';

import { AdminRequestError, loadOrganisations, loadUsers, updateUser } from './admin-api';
import { formatWhen, roleLabel } from './format';
import { ErrorCard, SkeletonRows, StatusBadge, TypeBadge, secondaryButton } from './ui';
import { useAdminToken } from './use-admin-token';

export function PlatformUsers(): React.ReactElement {
  const { token, ready } = useAdminToken();
  const [rows, setRows] = useState<AdminPlatformUser[] | null>(null);
  const [orgs, setOrgs] = useState<AdminOrgRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [orgType, setOrgType] = useState<OrgType | ''>('');
  const [orgId, setOrgId] = useState('');
  const [pending, setPending] = useState<AdminPlatformUser | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    setError(null);
    try {
      const [users, organisations] = await Promise.all([
        loadUsers(token, { q, orgType, orgId }),
        loadOrganisations(token, {}),
      ]);
      setRows(users);
      setOrgs(organisations);
    } catch (caught) {
      setError(
        caught instanceof AdminRequestError ? caught.message : 'Something went wrong. Try again.',
      );
    }
  }, [orgId, orgType, q, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm(): Promise<void> {
    if (!token || !pending) {
      return;
    }
    setSaving(true);
    try {
      await updateUser(token, pending.id, !pending.isActive);
      setPending(null);
      await load();
    } catch (caught) {
      setError(
        caught instanceof AdminRequestError ? caught.message : 'Something went wrong. Try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col gap-1 text-xs text-ink3" htmlFor="user-search">
          Search
          <input
            id="user-search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Name or email"
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-purp"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink3" htmlFor="user-type">
          Organisation type
          <select
            id="user-type"
            value={orgType}
            onChange={(event) => setOrgType(event.target.value as OrgType | '')}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
          >
            <option value="">All types</option>
            <option value="RETAILER">Retailer</option>
            <option value="WHOLESALER">Wholesaler</option>
            <option value="LABORATORY">Laboratory</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink3" htmlFor="user-org">
          Organisation
          <select
            id="user-org"
            value={orgId}
            onChange={(event) => setOrgId(event.target.value)}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
          >
            <option value="">All organisations</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
      </div>
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
              Confirm
            </button>
            <button type="button" className={secondaryButton} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {!ready || (!rows && !error) ? <SkeletonRows /> : null}
      {error ? <ErrorCard message={error} onRetry={() => void load()} /> : null}
      {rows && rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink2">
          No users match this search.
        </p>
      ) : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                {['Name', 'Email', 'Organisation', 'Type', 'Role', 'Last login', 'Status', ''].map(
                  (heading) => (
                    <th
                      key={heading || 'actions'}
                      className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={user.id} className="hover:bg-canvas">
                  <td className="border-t border-line px-3 py-2 text-sm text-ink">{user.name}</td>
                  <td className="border-t border-line px-3 py-2 text-sm text-ink2">{user.email}</td>
                  <td className="border-t border-line px-3 py-2 text-sm text-ink">
                    {user.orgName}
                  </td>
                  <td className="border-t border-line px-3 py-2">
                    <TypeBadge type={user.orgType} />
                  </td>
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
                      onClick={() => setPending(user)}
                    >
                      {user.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
