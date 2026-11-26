'use client';

import type { WholesalerDashboard as DashboardData } from '@optiworld/shared';
import { Calendar, Check, Clock, PackageCheck, Tags, Truck, Users } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { firstName, greeting } from '@/components/retailer/dashboard-format';
import { PosBilling } from '@/components/retailer/PosBilling';

import { OrderTable } from './OrderTable';
import { loadWholesalerDashboard } from './wholesaler-api';
import { AMBER_CARD, BLUE_CARD, MetricCard, NAVY_CARD, TEAL_CARD } from './wholesaler-surface';

const PIPELINE = [
  {
    status: 'PENDING',
    label: 'Pending',
    icon: Clock,
    card: AMBER_CARD,
    mark: 'bg-amber-soft text-amber',
  },
  {
    status: 'CONFIRMED',
    label: 'Confirmed',
    icon: Check,
    card: BLUE_CARD,
    mark: 'bg-action-soft text-action',
  },
  {
    status: 'DISPATCHED',
    label: 'Dispatched',
    icon: Truck,
    card: TEAL_CARD,
    mark: 'bg-teal-soft text-teal',
  },
  {
    status: 'DELIVERED',
    label: 'Delivered',
    icon: PackageCheck,
    card: NAVY_CARD,
    mark: 'bg-white text-navy',
  },
] as const;

export function WholesalerDashboard(): React.ReactElement {
  const router = useRouter();
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

  const userName = session?.user.name ?? '';

  return (
    <div className="space-y-4">
      <section>
        <p className="text-sm text-ink2">
          {userName ? `${greeting(new Date())}, ${firstName(userName)}` : greeting(new Date())}
        </p>
        <h2 className="text-lg font-semibold text-ink">New bill</h2>
        <p className="text-sm text-ink2">
          Search a product, choose the customer, and complete the sale.
        </p>
      </section>
      <Suspense
        fallback={
          <div
            className="h-96 animate-pulse rounded-2xl border border-line bg-white"
            aria-busy="true"
          />
        }
      >
        <PosBilling />
      </Suspense>
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Active retailer connections"
          value={String(data.activeConnections)}
          card={BLUE_CARD}
          mark="bg-action-soft text-action"
          icon={Users}
          onClick={() => router.push('/wholesaler/retailers')}
        />
        <MetricCard
          label="Catalog products"
          value={String(data.catalogProducts)}
          hint={`${data.outOfStockProducts} out of stock`}
          card={TEAL_CARD}
          mark="bg-teal-soft text-teal"
          icon={Tags}
          onClick={() => router.push('/wholesaler/catalog')}
        />
        <MetricCard
          label="Orders today"
          value={String(data.ordersToday)}
          card={NAVY_CARD}
          mark="bg-white text-navy"
          icon={Calendar}
          onClick={() => router.push('/wholesaler/orders')}
        />
      </section>
      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Order pipeline">
        {PIPELINE.map((stage) => (
          <MetricCard
            key={stage.status}
            label={stage.label}
            value={String(data.pipeline[stage.status])}
            card={stage.card}
            mark={stage.mark}
            icon={stage.icon}
            onClick={() => router.push(`/wholesaler/orders?status=${stage.status}`)}
          />
        ))}
      </section>
      <section>
        <h2 className="mb-2 text-md font-semibold text-ink">Recent orders</h2>
        <OrderTable orders={data.recentOrders} onChanged={refresh} />
      </section>
    </div>
  );
}

function DashboardSkeleton(): React.ReactElement {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-xl border border-line bg-white" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-line bg-white" />
    </div>
  );
}
