'use client';

import type {
  OrderStatus,
  WholesalerOrderRow,
  WholesalerRetailerConnection,
} from '@optiworld/shared';
import {
  Ban,
  Check,
  Clock,
  Eye,
  LayoutGrid,
  PackageCheck,
  Plus,
  Search,
  Truck,
} from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { formatRelativeTime, formatRupee } from '@/components/retailer/dashboard-format';

import { OrderStatusDialog } from './OrderStatusDialog';
import { NewWholesalerOrderDialog } from './NewWholesalerOrderDialog';
import {
  WHOLESALER_ORDERS_CHANGED,
  loadConnections,
  loadWholesalerOrders,
  updateWholesalerOrderStatus,
} from './wholesaler-api';
import {
  fieldClass,
  headCellClass,
  headRowClass,
  ListPager,
  pageWindow,
  type PageSize,
} from './wholesaler-surface';

const STATUS_FILTERS: ReadonlyArray<{
  id: 'ALL' | OrderStatus;
  label: string;
  icon: typeof LayoutGrid;
  idle: string;
  active: string;
}> = [
  {
    id: 'ALL',
    label: 'All',
    icon: LayoutGrid,
    idle: 'border border-ink3 bg-[color-mix(in_srgb,var(--ow-ink3)_18%,white)] text-ink2',
    active: 'border border-ink2 bg-ink2 text-white',
  },
  {
    id: 'PENDING',
    label: 'Pending',
    icon: Clock,
    idle: 'border border-amber bg-amber-soft text-amber',
    active: 'border border-amber bg-amber text-white',
  },
  {
    id: 'CONFIRMED',
    label: 'Confirmed',
    icon: Check,
    idle: 'border border-action bg-action-soft text-action',
    active: 'border border-action bg-action text-white',
  },
  {
    id: 'DISPATCHED',
    label: 'Dispatched',
    icon: Truck,
    idle: 'border border-teal bg-teal-soft text-teal',
    active: 'border border-teal bg-teal text-white',
  },
  {
    id: 'DELIVERED',
    label: 'Delivered',
    icon: PackageCheck,
    idle: 'border border-line bg-canvas text-ink2',
    active: 'border border-navy bg-navy text-white',
  },
  {
    id: 'CANCELLED',
    label: 'Cancelled',
    icon: Ban,
    idle: 'border border-danger bg-danger-soft text-danger',
    active: 'border border-danger bg-danger text-white',
  },
];

const actionButtonClass =
  'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-xs font-medium leading-none';

type WholesalerOrdersProps = {
  initialStatus?: string;
};

export function WholesalerOrders({ initialStatus }: WholesalerOrdersProps): React.ReactElement {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [filter, setFilter] = useState<OrderStatus | ''>(
    isStatus(initialStatus) ? initialStatus : '',
  );
  const [retailerOrgId, setRetailerOrgId] = useState('');
  const [query, setQuery] = useState('');
  const [orders, setOrders] = useState<WholesalerOrderRow[]>([]);
  const [retailers, setRetailers] = useState<WholesalerRetailerConnection[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [pendingStatus, setPendingStatus] = useState<{
    id: string;
    status: 'DISPATCHED' | 'DELIVERED';
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [creating, setCreating] = useState(false);

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

  useEffect(() => {
    setPage(1);
  }, [filter, query, retailerOrgId, pageSize]);

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

  useEffect(() => {
    setFilter(isStatus(initialStatus) ? initialStatus : '');
  }, [initialStatus]);

  const windowed = pageWindow(orders, page, pageSize);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink2">
          Orders from connected retailers, and orders you open for them.
        </p>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white"
          onClick={() => setCreating(true)}
        >
          <Plus size={16} aria-hidden="true" />
          New order
        </button>
      </div>
      <section className="overflow-hidden rounded-xl border border-action-soft bg-white">
        <form
          className="grid gap-2 border-b border-action-soft bg-canvas px-3 py-2"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-[180px] flex-1 gap-1 text-xs text-ink2">
              Search orders
              <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3">
                <Search size={16} className="text-action" aria-hidden="true" />
                <input
                  aria-label="Search orders"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Order number or retailer"
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
                />
              </span>
            </label>
            <label className="grid gap-1 text-xs text-ink2">
              Retailer
              <select
                aria-label="Retailer"
                value={retailerOrgId}
                onChange={(event) => setRetailerOrgId(event.target.value)}
                className={`${fieldClass} min-w-[12rem]`}
              >
                <option value="">All</option>
                {retailers.map((retailer) => (
                  <option key={retailer.retailerOrgId} value={retailer.retailerOrgId}>
                    {retailer.retailerName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Order status">
            {STATUS_FILTERS.map((option) => {
              const Icon = option.icon;
              const selected = option.id === 'ALL' ? filter === '' : filter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    const next = option.id === 'ALL' ? '' : option.id;
                    setFilter(next);
                    router.replace(
                      next ? `/wholesaler/orders?status=${next}` : '/wholesaler/orders',
                    );
                  }}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ${selected ? option.active : option.idle}`}
                >
                  <Icon size={14} aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </form>
        {notice ? <p className="px-3 pt-2 text-sm text-teal">{notice}</p> : null}
        {error ? (
          <p className="px-3 pt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {loading || status === 'loading' ? (
          <div className="h-48 animate-pulse bg-white" aria-busy="true" />
        ) : orders.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-md font-medium text-ink">No orders match</p>
            <p className="mt-1 text-sm text-ink2">Try another retailer, status, or order number.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead>
                <tr className={headRowClass}>
                  {[
                    'Order',
                    'Retailer',
                    'Items',
                    'Value',
                    'Settlement',
                    'Submitted',
                    'Status',
                    'Action',
                  ].map((heading) => (
                    <th key={heading} className={headCellClass}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {windowed.visible.map((order) => (
                  <tr key={order.id} className="border-b border-line last:border-0 hover:bg-canvas">
                    <td className="px-3 py-2 text-sm font-medium text-ink">
                      <span className="inline-flex items-center gap-2">
                        {order.hasUnread ? (
                          <span
                            className="h-2 w-2 rounded-full bg-action"
                            aria-label="Unread chat"
                          />
                        ) : null}
                        #{order.reference}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-ink">{order.retailerName}</td>
                    <td className="px-3 py-2 text-sm text-ink2">{order.itemsSummary}</td>
                    <td className="px-3 py-2 text-sm text-ink">
                      {order.totalValue ? (
                        <span className="font-medium text-teal">
                          {formatRupee(order.totalValue)}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">
                          On request
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm text-ink2">
                      {order.settlement === 'CASH'
                        ? 'Cash'
                        : order.settlement === 'CREDIT'
                          ? 'Credit'
                          : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-ink2">
                      {formatRelativeTime(order.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <StatusPill status={order.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex flex-nowrap items-center gap-2">
                        {order.status === 'PENDING' ? (
                          <Link
                            href={`/wholesaler/orders/${order.id}`}
                            className={`${actionButtonClass} bg-action text-white`}
                          >
                            <Eye size={14} aria-hidden="true" />
                            Open chat
                          </Link>
                        ) : null}
                        {order.status === 'CONFIRMED' ? (
                          <button
                            type="button"
                            className={`${actionButtonClass} bg-action text-white`}
                            onClick={() => setPendingStatus({ id: order.id, status: 'DISPATCHED' })}
                          >
                            <Truck size={14} aria-hidden="true" />
                            Mark dispatched
                          </button>
                        ) : null}
                        {order.status === 'DISPATCHED' ? (
                          <button
                            type="button"
                            className={`${actionButtonClass} bg-teal text-white`}
                            onClick={() => setPendingStatus({ id: order.id, status: 'DELIVERED' })}
                          >
                            <PackageCheck size={14} aria-hidden="true" />
                            Mark delivered
                          </button>
                        ) : null}
                        {order.status !== 'PENDING' ? (
                          <Link
                            href={`/wholesaler/orders/${order.id}`}
                            className={`${actionButtonClass} text-action`}
                          >
                            <Eye size={14} aria-hidden="true" />
                            View
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPager
          total={orders.length}
          shown={windowed.visible.length}
          page={windowed.current}
          pageCount={windowed.pageCount}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      </section>
      {pendingStatus ? (
        <OrderStatusDialog
          label={pendingStatus.status === 'DISPATCHED' ? 'dispatched' : 'delivered'}
          busy={busy}
          onCancel={() => setPendingStatus(null)}
          onConfirm={() => void applyStatus()}
        />
      ) : null}
      {creating && session?.accessToken ? (
        <NewWholesalerOrderDialog
          token={session.accessToken}
          retailers={retailers}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setNotice('Order opened for the retailer.');
            window.dispatchEvent(new Event(WHOLESALER_ORDERS_CHANGED));
            refresh();
          }}
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
    value === 'PENDING' ||
    value === 'CONFIRMED' ||
    value === 'DISPATCHED' ||
    value === 'DELIVERED' ||
    value === 'CANCELLED'
  );
}
