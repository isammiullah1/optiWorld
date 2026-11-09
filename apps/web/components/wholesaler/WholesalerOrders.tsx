'use client';

import type {
  OrderStatus,
  WholesalerOrderRow,
  WholesalerRetailerConnection,
} from '@optiworld/shared';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { formatRelativeTime, formatRupee } from '@/components/retailer/dashboard-format';

import { OrderStatusDialog } from './OrderStatusDialog';
import {
  WHOLESALER_ORDERS_CHANGED,
  loadConnections,
  loadWholesalerOrders,
  updateWholesalerOrderStatus,
} from './wholesaler-api';

const STAGES = ['PENDING', 'CONFIRMED', 'DISPATCHED', 'DELIVERED'] as const;

type WholesalerOrdersProps = {
  initialStatus?: string;
};

export function WholesalerOrders({ initialStatus }: WholesalerOrdersProps): React.ReactElement {
  const { data: session, status } = useSession();
  const [filter, setFilter] = useState<OrderStatus | ''>(
    isStatus(initialStatus) ? initialStatus : '',
  );
  const [retailerOrgId, setRetailerOrgId] = useState('');
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<WholesalerOrderRow[]>([]);
  const [pipeline, setPipeline] = useState({
    PENDING: 0,
    CONFIRMED: 0,
    DISPATCHED: 0,
    DELIVERED: 0,
  });
  const [retailers, setRetailers] = useState<WholesalerRetailerConnection[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingStatus, setPendingStatus] = useState<{
    id: string;
    status: 'DISPATCHED' | 'DELIVERED';
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback((): void => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    setLoading(true);
    void Promise.all([
      loadWholesalerOrders(token, {
        status: filter || undefined,
        retailerOrgId: retailerOrgId || undefined,
        q: query.trim() || undefined,
      }),
      loadConnections(token),
    ])
      .then(([result, connections]) => {
        setOrders(result.orders);
        setPipeline(result.pipeline);
        setRetailers(connections.connected);
        setError('');
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Could not load orders');
      })
      .finally(() => setLoading(false));
  }, [filter, query, retailerOrgId, session?.accessToken]);

  useEffect(() => {
    const handle = window.setTimeout(refresh, 200);
    return () => window.clearTimeout(handle);
  }, [refresh]);

  async function applyStatus(): Promise<void> {
    const token = session?.accessToken;
    if (!token || !pendingStatus) {
      return;
    }
    setBusy(true);
    try {
      const message = await updateWholesalerOrderStatus(
        token,
        pendingStatus.id,
        pendingStatus.status,
      );
      setNotice(message);
      setPendingStatus(null);
      window.dispatchEvent(new Event(WHOLESALER_ORDERS_CHANGED));
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this order');
      setPendingStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <section className="grid gap-2 sm:grid-cols-4" aria-label="Order pipeline">
        {STAGES.map((stage) => (
          <button
            key={stage}
            type="button"
            className={`min-h-11 rounded-xl border px-4 py-3 text-left ${
              filter === stage ? 'border-action bg-action-soft' : 'border-line bg-white'
            }`}
            onClick={() => setFilter((current) => (current === stage ? '' : stage))}
          >
            <span className="block text-xs font-medium uppercase tracking-wide text-ink3">
              {stageLabel(stage)}
            </span>
            <span className="text-2xl font-semibold text-ink">{pipeline[stage]}</span>
          </button>
        ))}
      </section>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[180px] flex-1 text-xs text-ink2">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Order # or retailer"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-ink2">
          Retailer
          <select
            value={retailerOrgId}
            onChange={(event) => setRetailerOrgId(event.target.value)}
            className="mt-1 block min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink"
          >
            <option value="">All retailers</option>
            {retailers.map((retailer) => (
              <option key={retailer.retailerOrgId} value={retailer.retailerOrgId}>
                {retailer.retailerName}
              </option>
            ))}
          </select>
        </label>
      </div>
      {notice ? <p className="text-sm text-teal">{notice}</p> : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {loading || status === 'loading' ? (
        <div
          className="h-48 animate-pulse rounded-xl border border-line bg-white"
          aria-busy="true"
        />
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-6 text-center">
          <p className="text-md font-medium text-ink">No orders match</p>
          <p className="mt-1 text-sm text-ink2">Try another retailer, status, or order number.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[860px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {['Order', 'Retailer', 'Items', 'Value', 'Submitted', 'Status', 'Action'].map(
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
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-3 py-2 text-xs font-medium text-ink">
                    <span className="inline-flex items-center gap-2">
                      {order.hasUnread ? (
                        <span className="h-2 w-2 rounded-full bg-action" aria-label="Unread chat" />
                      ) : null}
                      #{order.reference}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-ink">{order.retailerName}</td>
                  <td className="px-3 py-2 text-xs text-ink2">{order.itemsSummary}</td>
                  <td className="px-3 py-2 text-xs text-ink">
                    {order.totalValue ? formatRupee(order.totalValue) : 'On request'}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink2">
                    {formatRelativeTime(order.createdAt)}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={order.status} />
                  </td>
                  <td className="px-3 py-2">
                    {order.status === 'PENDING' ? (
                      <Link
                        href={`/wholesaler/orders/${order.id}`}
                        className="inline-flex min-h-11 items-center rounded-lg bg-action px-3 text-xs font-medium text-white"
                      >
                        Open chat
                      </Link>
                    ) : null}
                    {order.status === 'CONFIRMED' ? (
                      <button
                        type="button"
                        className="min-h-11 rounded-lg bg-action px-3 text-xs font-medium text-white"
                        onClick={() => setPendingStatus({ id: order.id, status: 'DISPATCHED' })}
                      >
                        Mark dispatched
                      </button>
                    ) : null}
                    {order.status === 'DISPATCHED' ? (
                      <button
                        type="button"
                        className="min-h-11 rounded-lg bg-action px-3 text-xs font-medium text-white"
                        onClick={() => setPendingStatus({ id: order.id, status: 'DELIVERED' })}
                      >
                        Mark delivered
                      </button>
                    ) : null}
                    {order.status === 'DELIVERED' ? (
                      <Link
                        href={`/wholesaler/orders/${order.id}`}
                        className="inline-flex min-h-11 items-center text-xs font-medium text-action"
                      >
                        View
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pendingStatus ? (
        <OrderStatusDialog
          label={pendingStatus.status === 'DISPATCHED' ? 'dispatched' : 'delivered'}
          busy={busy}
          onCancel={() => setPendingStatus(null)}
          onConfirm={() => void applyStatus()}
        />
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: OrderStatus }): React.ReactElement {
  const styles: Record<OrderStatus, string> = {
    PENDING: 'bg-amber-soft text-amber',
    CONFIRMED: 'bg-action-soft text-action',
    DISPATCHED: 'bg-teal-soft text-teal',
    DELIVERED: 'bg-canvas text-ink3',
    CANCELLED: 'bg-danger-soft text-danger',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {stageLabel(status)}
    </span>
  );
}

function stageLabel(status: OrderStatus): string {
  if (status === 'PENDING') {
    return 'Pending';
  }
  if (status === 'CONFIRMED') {
    return 'Confirmed';
  }
  if (status === 'DISPATCHED') {
    return 'Dispatched';
  }
  if (status === 'CANCELLED') {
    return 'Cancelled';
  }
  return 'Delivered';
}

function isStatus(value: string | undefined): value is OrderStatus {
  return (
    value === 'PENDING' || value === 'CONFIRMED' || value === 'DISPATCHED' || value === 'DELIVERED'
  );
}
