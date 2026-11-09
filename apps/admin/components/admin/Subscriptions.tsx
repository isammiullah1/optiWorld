'use client';

import type { AdminSubscriptionRow } from '@optiworld/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AdminRequestError, extendExpiringWeek, loadSubscriptions } from './admin-api';
import { formatDay, planLabel } from './format';
import {
  ErrorCard,
  SkeletonRows,
  StatusBadge,
  TypeBadge,
  primaryButton,
  secondaryButton,
} from './ui';
import { useAdminToken } from './use-admin-token';

const FILTERS = [
  { id: 'WEEK', label: 'Expiring this week' },
  { id: 'MONTH', label: 'Expiring this month' },
  { id: 'EXPIRED', label: 'Expired' },
  { id: 'ALL', label: 'All' },
] as const;

type Filter = (typeof FILTERS)[number]['id'];

export function Subscriptions(): React.ReactElement {
  const { token, ready } = useAdminToken();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [rows, setRows] = useState<AdminSubscriptionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    setError(null);
    try {
      setRows(await loadSubscriptions(token, filter));
    } catch (caught) {
      setError(
        caught instanceof AdminRequestError ? caught.message : 'Something went wrong. Try again.',
      );
    }
  }, [filter, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function extend(): Promise<void> {
    if (!token) {
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const result = await extendExpiringWeek(token);
      setConfirming(false);
      setNotice(
        result.extended === 0
          ? 'No subscriptions expire this week.'
          : `Extended ${result.extended} subscriptions by 30 days.`,
      );
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Subscription filter">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              className={`min-h-11 rounded-lg px-3 py-2 text-sm ${filter === item.id ? 'bg-purp text-white' : 'border border-line bg-white text-ink2'}`}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className={primaryButton} onClick={() => setConfirming(true)}>
          Extend expiring this week by 30 days
        </button>
      </div>
      {confirming ? (
        <div className="rounded-xl border border-line bg-white p-4" role="alert">
          <p className="text-sm text-ink">
            Extend every subscription that renews in the next 7 days by 30 days.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={saving}
              onClick={() => void extend()}
            >
              {saving ? 'Extending…' : 'Extend'}
            </button>
            <button type="button" className={secondaryButton} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {notice ? <p className="text-sm text-ink2">{notice}</p> : null}
      {!ready || (!rows && !error) ? <SkeletonRows /> : null}
      {error ? <ErrorCard message={error} onRetry={() => void load()} /> : null}
      {rows && rows.length === 0 ? (
        <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink2">
          No subscriptions match this filter.
        </p>
      ) : null}
      {rows && rows.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr>
                {['Organisation', 'Type', 'Plan', 'Status', 'Renewal'].map((heading) => (
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
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-canvas">
                  <td className="border-t border-line px-3 py-2 text-sm">
                    <Link href={`/organisations/${row.orgId}`} className="font-medium text-purp">
                      {row.orgName}
                    </Link>
                  </td>
                  <td className="border-t border-line px-3 py-2">
                    <TypeBadge type={row.orgType} />
                  </td>
                  <td className="border-t border-line px-3 py-2 text-sm text-ink2">
                    {planLabel(row.planType)}
                  </td>
                  <td className="border-t border-line px-3 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="border-t border-line px-3 py-2 text-sm text-ink2">
                    {formatDay(row.renewalDate)}
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
