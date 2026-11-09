'use client';

import type { AdminDashboard, OrgType } from '@optiworld/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { AdminRequestError, loadDashboard } from './admin-api';
import { formatDay } from './format';
import { ErrorCard, SkeletonRows, TypeBadge } from './ui';
import { useAdminToken } from './use-admin-token';

export function Dashboard(): React.ReactElement {
  const { token, ready } = useAdminToken();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    setError(null);
    try {
      setData(await loadDashboard(token));
    } catch (caught) {
      setError(
        caught instanceof AdminRequestError ? caught.message : 'Something went wrong. Try again.',
      );
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready || (!data && !error)) {
    return <SkeletonRows />;
  }
  if (error || !data) {
    return (
      <ErrorCard
        message={error ?? 'Something went wrong. Try again.'}
        onRetry={() => void load()}
      />
    );
  }

  const max = Math.max(1, ...data.breakdown.map((row) => row.count));
  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total organisations" value={data.totalOrgs} />
        <Stat label="Active subscriptions" value={data.activeSubscriptions} />
        <Stat label="Trials" value={data.trials} />
        <Stat label="Active users today" value={data.activeUsersToday} />
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-line bg-white p-4">
          <h2 className="text-lg font-semibold text-ink">Organisations</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {data.breakdown.map((row) => (
              <li key={row.type}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-ink2">{chartLabel(row.type)}</span>
                  <span className="font-medium text-ink">{row.count}</span>
                </div>
                <div className="flex gap-0.5" aria-hidden="true">
                  {Array.from({ length: 20 }, (_, index) => (
                    <span
                      key={index}
                      className={`h-2 flex-1 rounded-sm ${index < Math.round((row.count / max) * 20) ? 'bg-purp' : 'bg-canvas'}`}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </article>
        <article
          className={`rounded-xl border p-4 ${data.expiringSoon.length > 0 ? 'border-amber bg-amber-soft' : 'border-line bg-white'}`}
        >
          <h2 className="text-lg font-semibold text-ink">Expiring soon</h2>
          <p className="mt-1 text-sm text-ink2">Renewing within 14 days</p>
          {data.expiringSoon.length === 0 ? (
            <p className="mt-4 text-sm text-ink2">No organisations renew in the next 14 days.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {data.expiringSoon.map((org) => (
                <li key={org.id}>
                  <Link
                    href={`/organisations/${org.id}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="font-medium text-ink">{org.name}</span>
                    <span className="text-ink2">{formatDay(org.renewalDate)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="text-lg font-semibold text-ink">Recent signups</h2>
        {data.recentSignups.length === 0 ? (
          <p className="mt-3 text-sm text-ink2">No organisations yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {data.recentSignups.map((org) => (
              <li key={org.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/organisations/${org.id}`} className="text-sm font-medium text-purp">
                  {org.name}
                </Link>
                <span className="flex items-center gap-2">
                  <TypeBadge type={org.type} />
                  <span className="text-xs text-ink3">{formatDay(org.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <article className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-ink3">{label}</p>
      <p className="mt-2 text-lg font-semibold text-ink">{value}</p>
    </article>
  );
}

function chartLabel(type: OrgType): string {
  if (type === 'RETAILER') {
    return 'Retailers';
  }
  if (type === 'WHOLESALER') {
    return 'Wholesalers';
  }
  return 'Labs';
}
