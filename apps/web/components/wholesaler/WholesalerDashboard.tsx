'use client';

import type { WholesalerDashboard as DashboardData } from '@optiworld/shared';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { loadWholesalerDashboard } from './wholesaler-api';
import { OrderTable } from './OrderTable';

const PIPELINE: readonly {
  status: 'PENDING' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED';
  label: string;
}[] = [
  { status: 'PENDING', label: 'Pending' },
  { status: 'CONFIRMED', label: 'Confirmed' },
  { status: 'DISPATCHED', label: 'Dispatched' },
  { status: 'DELIVERED', label: 'Delivered' },
];

export function WholesalerDashboard(): React.ReactElement {
  const { data: session, status } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback((): void => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    void loadWholesalerDashboard(token)
      .then((dashboard) => {
        setData(dashboard);
        setError('');
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Could not load the dashboard');
      });
  }, [session?.accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (status === 'loading' || (status === 'authenticated' && !data && !error)) {
    return <DashboardSkeleton />;
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-line bg-white p-6" role="alert">
        <p className="text-md font-medium text-ink">Dashboard unavailable</p>
        <p className="mt-1 text-sm text-ink2">{error || 'Try again in a moment.'}</p>
        <button
          type="button"
          className="mt-3 min-h-11 text-sm font-medium text-action"
          onClick={refresh}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pending orders" value={String(data.pendingOrders)} />
        <Stat label="Active retailer connections" value={String(data.activeConnections)} />
        <Stat
          label="Catalog products"
          value={String(data.catalogProducts)}
          hint={`${data.outOfStockProducts} out of stock`}
        />
        <Stat label="Orders today" value={String(data.ordersToday)} />
      </section>
      <section className="grid gap-2 sm:grid-cols-4" aria-label="Order pipeline">
        {PIPELINE.map((stage, index) => (
          <Link
            key={stage.status}
            href={`/wholesaler/orders?status=${stage.status}`}
            className="flex min-h-11 items-center justify-between rounded-xl border border-line bg-white px-4 py-3"
          >
            <span>
              <span className="block text-xs font-medium uppercase tracking-wide text-ink3">
                {index > 0 ? `→ ${stage.label}` : stage.label}
              </span>
              <span className="text-2xl font-semibold text-ink">{data.pipeline[stage.status]}</span>
            </span>
          </Link>
        ))}
      </section>
      <section>
        <h2 className="mb-2 text-md font-semibold text-ink">Recent orders</h2>
        <OrderTable orders={data.recentOrders} onChanged={refresh} />
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): React.ReactElement {
  return (
    <article className="rounded-xl border border-line bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink3">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink2">{hint}</p> : null}
    </article>
  );
}

function DashboardSkeleton(): React.ReactElement {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl border border-line bg-white" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-line bg-white" />
    </div>
  );
}
