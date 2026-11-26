'use client';

import type { OrderStatus, WholesalerOrderRow } from '@optiworld/shared';
import { Check, Eye } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { formatRelativeTime } from '@/components/retailer/dashboard-format';

import { WHOLESALER_ORDERS_CHANGED, confirmWholesalerOrder } from './wholesaler-api';
import {
  headCellClass,
  headRowClass,
  ListPager,
  pageWindow,
  type PageSize,
} from './wholesaler-surface';

type OrderTableProps = {
  orders: readonly WholesalerOrderRow[];
  onChanged: () => void;
};

export function OrderTable({ orders, onChanged }: OrderTableProps): React.ReactElement {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const windowed = pageWindow(orders, page, pageSize);

  useEffect(() => {
    setPage(1);
  }, [orders, pageSize]);

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-white p-6 text-center">
        <p className="text-md font-medium text-ink">No orders yet</p>
        <p className="mt-1 text-sm text-ink2">Orders from connected retailers will show up here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-action-soft bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className={headRowClass}>
              {['Order', 'Retailer', 'Items', 'Status', 'Submitted', 'Action'].map((heading) => (
                <th key={heading} className={headCellClass}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {windowed.visible.map((order) => (
              <OrderRow key={order.id} order={order} onChanged={onChanged} />
            ))}
          </tbody>
        </table>
      </div>
      <ListPager
        total={orders.length}
        shown={windowed.visible.length}
        page={windowed.current}
        pageCount={windowed.pageCount}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={setPageSize}
      />
    </div>
  );
}

function OrderRow({
  order,
  onChanged,
}: {
  order: WholesalerOrderRow;
  onChanged: () => void;
}): React.ReactElement {
  const { data: session } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm(): Promise<void> {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await confirmWholesalerOrder(token, order.id);
      window.dispatchEvent(new Event(WHOLESALER_ORDERS_CHANGED));
      onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not confirm this order');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-line last:border-0 hover:bg-canvas">
      <td className="px-3 py-2 text-sm font-medium text-ink">
        <span className="inline-flex items-center gap-2">
          {order.hasUnread ? (
            <span
              className="h-2 w-2 rounded-full bg-action"
              title="Unread chat"
              aria-label="Unread chat"
            />
          ) : null}
          #{order.reference}
          {order.isNew ? (
            <span className="rounded-full bg-action-soft px-1.5 py-0.5 text-xs font-medium text-action">
              NEW
            </span>
          ) : null}
        </span>
        {error ? (
          <span className="mt-1 block text-sm text-danger" role="alert">
            {error}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-sm text-ink">{order.retailerName}</td>
      <td className="px-3 py-2 text-sm text-ink2">{order.itemCount}</td>
      <td className="px-3 py-2">
        <StatusPill status={order.status} />
      </td>
      <td className="px-3 py-2 text-sm text-ink2">{formatRelativeTime(order.createdAt)}</td>
      <td className="px-3 py-2">
        {order.status === 'PENDING' && order.settlement === null ? (
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-action px-2 text-xs font-medium text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void confirm()}
          >
            <Check size={14} aria-hidden="true" />
            {busy ? 'Confirming' : 'Confirm'}
          </button>
        ) : null}
        {order.status === 'PENDING' && order.settlement !== null ? (
          <span className="text-xs text-ink3">Retailer confirms</span>
        ) : null}
        <a
          href={`/wholesaler/orders/${order.id}`}
          className="ml-2 inline-flex h-8 items-center gap-1 rounded-lg px-1 text-xs font-medium text-action"
        >
          <Eye size={14} aria-hidden="true" />
          View
        </a>
      </td>
    </tr>
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
  const labels: Record<OrderStatus, string> = {
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
    DISPATCHED: 'Dispatched',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
