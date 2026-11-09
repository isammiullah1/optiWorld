'use client';

import type { OrderStatus, WholesalerOrderRow } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useState } from 'react';

import { formatRelativeTime } from '@/components/retailer/dashboard-format';

import { WHOLESALER_ORDERS_CHANGED, confirmWholesalerOrder } from './wholesaler-api';

type OrderTableProps = {
  orders: readonly WholesalerOrderRow[];
  onChanged: () => void;
};

export function OrderTable({ orders, onChanged }: OrderTableProps): React.ReactElement {
  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-white p-6 text-center">
        <p className="text-md font-medium text-ink">No orders yet</p>
        <p className="mt-1 text-sm text-ink2">Orders from connected retailers will show up here.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {['Order', 'Retailer', 'Items', 'Status', 'Submitted', 'Action'].map((heading) => (
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
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} onChanged={onChanged} />
          ))}
        </tbody>
      </table>
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
      <td className="px-3 py-2 text-xs font-medium text-ink">
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
      <td className="px-3 py-2 text-xs text-ink">{order.retailerName}</td>
      <td className="px-3 py-2 text-xs text-ink2">{order.itemCount}</td>
      <td className="px-3 py-2">
        <StatusPill status={order.status} />
      </td>
      <td className="px-3 py-2 text-xs text-ink2">{formatRelativeTime(order.createdAt)}</td>
      <td className="px-3 py-2">
        {order.status === 'PENDING' ? (
          <button
            type="button"
            className="min-h-11 rounded-lg bg-action px-3 text-xs font-medium text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? 'Confirming' : 'Confirm'}
          </button>
        ) : (
          <a
            href={`/wholesaler/orders/${order.id}`}
            className="inline-flex min-h-11 items-center text-xs font-medium text-action"
          >
            View
          </a>
        )}
        {order.status === 'PENDING' ? (
          <a
            href={`/wholesaler/orders/${order.id}`}
            className="ml-3 inline-flex min-h-11 items-center text-xs text-ink2"
          >
            View
          </a>
        ) : null}
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
