'use client';

import type { AdminOrgRow, OrgStatus, OrgType } from '@optiworld/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AdminRequestError, loadOrganisations, updateOrganisation } from './admin-api';
import { formatDay } from './format';
import { ErrorCard, SkeletonRows, StatusBadge, TypeBadge, secondaryButton } from './ui';
import { useAdminToken } from './use-admin-token';

export function OrganisationsTable(): React.ReactElement {
  const { token, ready } = useAdminToken();
  const [rows, setRows] = useState<AdminOrgRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState<OrgType | ''>('');
  const [status, setStatus] = useState<OrgStatus | ''>('');
  const [pending, setPending] = useState<AdminOrgRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    setError(null);
    try {
      setRows(await loadOrganisations(token, { q, type, status }));
    } catch (caught) {
      setError(
        caught instanceof AdminRequestError ? caught.message : 'Something went wrong. Try again.',
      );
    }
  }, [q, status, token, type]);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmStatus(): Promise<void> {
    if (!token || !pending) {
      return;
    }
    setSaving(true);
    try {
      await updateOrganisation(token, pending.id, {
        status: pending.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
      });
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-col gap-1 text-xs text-ink3" htmlFor="org-search">
            Search
            <input
              id="org-search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-purp"
              placeholder="Organisation name"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink3" htmlFor="org-type">
            Type
            <select
              id="org-type"
              value={type}
              onChange={(event) => setType(event.target.value as OrgType | '')}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
            >
              <option value="">All types</option>
              <option value="RETAILER">Retailer</option>
              <option value="WHOLESALER">Wholesaler</option>
              <option value="LABORATORY">Laboratory</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink3" htmlFor="org-status">
            Status
            <select
              id="org-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as OrgStatus | '')}
              className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </label>
        </div>
        <Link
          href="/organisations/new"
          className="min-h-11 rounded-lg bg-purp px-4 py-2 text-md font-medium text-white"
        >
          Add organisation
        </Link>
      </div>
      {pending ? (
        <div className="rounded-xl border border-line bg-white p-4" role="alert">
          <p className="text-sm text-ink">
            {pending.status === 'ACTIVE'
              ? `Deactivate ${pending.name}? People in this organisation will be unable to sign in.`
              : `Activate ${pending.name}?`}
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-lg bg-purp px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              disabled={saving}
              onClick={() => void confirmStatus()}
            >
              {saving ? 'Saving…' : 'Confirm'}
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
          No organisations match these filters.
        </p>
      ) : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                {['Org name', 'Type', 'Status', 'Created', 'Renewal date', 'Actions'].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-canvas">
                  <td className="border-t border-line px-3 py-2 text-sm font-medium text-ink">
                    {row.name}
                  </td>
                  <td className="border-t border-line px-3 py-2">
                    <TypeBadge type={row.type} />
                  </td>
                  <td className="border-t border-line px-3 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="border-t border-line px-3 py-2 text-sm text-ink2">
                    {formatDay(row.createdAt)}
                  </td>
                  <td className="border-t border-line px-3 py-2 text-sm text-ink2">
                    {formatDay(row.renewalDate)}
                  </td>
                  <td className="border-t border-line px-3 py-2">
                    <div className="flex gap-2">
                      <Link href={`/organisations/${row.id}`} className="text-sm text-purp">
                        Manage
                      </Link>
                      <button
                        type="button"
                        className="text-sm text-ink2"
                        onClick={() => setPending(row)}
                      >
                        {row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
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
