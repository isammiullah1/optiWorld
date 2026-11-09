'use client';

import {
  centsToMoney,
  moneyToCents,
  type WholesalerOrderDetail as Detail,
} from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import { RecordTrail } from '@/components/RecordTrail';
import { formatRupee, formatShortDate } from '@/components/retailer/dashboard-format';

import { OrderChat } from './OrderChat';
import { OrderStatusDialog } from './OrderStatusDialog';
import { loadWholesalerOrder, updateWholesalerOrderStatus } from './wholesaler-api';

export function WholesalerOrderDetail({ orderId }: { orderId: string }): React.ReactElement {
  const { data: session, status } = useSession();
  const [order, setOrder] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ask, setAsk] = useState<'DISPATCHED' | 'DELIVERED' | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback((): void => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    void loadWholesalerOrder(token, orderId)
      .then((next) => {
        setOrder(next);
        setError('');
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Could not load this order');
      });
  }, [orderId, session?.accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function applyStatus(): Promise<void> {
    const token = session?.accessToken;
    if (!token || !ask) {
      return;
    }
    setBusy(true);
    try {
      const message = await updateWholesalerOrderStatus(token, orderId, ask);
      setNotice(message);
      setAsk(null);
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update this order');
      setAsk(null);
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading' || (status === 'authenticated' && !order && !error)) {
    return (
      <div className="h-64 animate-pulse rounded-xl border border-line bg-white" aria-busy="true" />
    );
  }
  if (!order) {
    return (
      <div className="rounded-xl border border-line bg-white p-6" role="alert">
        <p className="text-md font-medium text-ink">Order unavailable</p>
        <p className="mt-1 text-sm text-ink2">{error}</p>
      </div>
    );
  }

  const rows = slipRows(order);
  const total = slipTotal(rows, order.totalValue);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <OrderChat
          orderId={orderId}
          reference={order.reference}
          retailerName={order.retailer.name}
          retailerCity={order.retailer.city}
          retailerPhone={order.retailer.phone}
          initiallyLocked={Boolean(order.lockedAt) || order.status !== 'PENDING'}
          initialStatus={order.status}
          initialTotal={order.totalValue}
          initialItems={order.items}
          onOrderChanged={refresh}
        />
      </div>
      <aside className="space-y-3 lg:col-span-2">
        <section className="rounded-xl border border-line bg-white p-4">
          <h2 className="text-md font-semibold text-ink">{order.retailer.name}</h2>
          <p className="mt-1 text-sm text-ink2">{order.retailer.city ?? 'City not set'}</p>
          <p className="text-sm text-ink2">{order.retailer.phone ?? 'No phone'}</p>
          <p className="mt-2 text-xs text-ink3">
            Connected since{' '}
            {order.retailer.connectedSince
              ? formatShortDate(order.retailer.connectedSince)
              : 'approval'}
          </p>
        </section>
        <section className="rounded-xl border border-line bg-white p-4">
          <h2 className="text-md font-semibold text-ink">Order #{order.reference}</h2>
          <div className="mt-2">
            <RecordTrail activity={order.activity} />
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  {['Product', 'Qty', 'Agreed price', 'Line total'].map((heading) => (
                    <th
                      key={heading}
                      className="py-1 text-xs font-medium uppercase tracking-wide text-ink3"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className="border-t border-line">
                    <td className="py-2 text-xs text-ink">{item.productName}</td>
                    <td className="py-2 text-xs text-ink2">
                      {item.quantity}
                      {item.was !== null ? (
                        <span className="mt-0.5 block text-amber">was {item.was}</span>
                      ) : null}
                    </td>
                    <td className="py-2 text-xs text-ink">
                      {item.agreedPrice ? formatRupee(item.agreedPrice) : 'On request'}
                    </td>
                    <td className="py-2 text-xs text-ink">
                      {item.lineTotal ? formatRupee(item.lineTotal) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">
            Order total {total ? formatRupee(total) : 'On request'}
          </p>
          {(order.openAmendment ?? []).length > 0 &&
          !order.lockedAt &&
          order.status === 'PENDING' ? (
            <p className="mt-1 text-xs text-amber">Quantities include the open order amendment.</p>
          ) : null}
          {(order.openAmendment ?? []).some((line) => line.fromQuantity === 0) ? (
            <p className="mt-1 text-xs text-amber">
              Proposed addition:{' '}
              {(order.openAmendment ?? [])
                .filter((line) => line.fromQuantity === 0)
                .map((line) => `${line.productName} × ${line.toQuantity}`)
                .join(', ')}
              . The order changes when you accept it.
            </p>
          ) : null}
          <ol className="mt-4 space-y-2">
            {order.stages.map((stage) => (
              <li key={stage.status} className="flex items-center justify-between text-xs">
                <span className={stage.reachedAt ? 'font-medium text-ink' : 'text-ink3'}>
                  {stage.status[0] + stage.status.slice(1).toLowerCase()}
                </span>
                <span className="text-ink3">
                  {stage.reachedAt ? formatShortDate(stage.reachedAt) : 'Not yet'}
                </span>
              </li>
            ))}
          </ol>
          {order.status === 'CONFIRMED' ? (
            <button
              type="button"
              className="mt-4 min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white"
              onClick={() => setAsk('DISPATCHED')}
            >
              Mark as dispatched
            </button>
          ) : null}
          {order.status === 'DISPATCHED' ? (
            <button
              type="button"
              className="mt-4 min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white"
              onClick={() => setAsk('DELIVERED')}
            >
              Mark as delivered
            </button>
          ) : null}
          {notice ? <p className="mt-2 text-sm text-teal">{notice}</p> : null}
          {error ? (
            <p className="mt-2 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-ink3">
            Catalog price at order time. No financial data shared with platform.
          </p>
        </section>
      </aside>
      {ask ? (
        <OrderStatusDialog
          label={ask === 'DISPATCHED' ? 'dispatched' : 'delivered'}
          busy={busy}
          onCancel={() => setAsk(null)}
          onConfirm={() => void applyStatus()}
        />
      ) : null}
    </div>
  );
}

function slipRows(
  order: Detail,
): Array<Detail['items'][number] & { was: number | null; lineTotal: string | null }> {
  const open = !order.lockedAt && order.status === 'PENDING' ? (order.openAmendment ?? []) : [];
  return order.items.map((item) => {
    const line = open.find(
      (entry) =>
        entry.catalogProductId !== null && entry.catalogProductId === item.catalogProductId,
    );
    const quantity = line?.toQuantity ?? item.quantity;
    return {
      ...item,
      quantity,
      was: line && line.fromQuantity !== quantity ? line.fromQuantity : null,
      lineTotal: item.agreedPrice ? centsToMoney(moneyToCents(item.agreedPrice) * quantity) : null,
    };
  });
}

function slipTotal(
  rows: ReadonlyArray<{ agreedPrice: string | null; quantity: number }>,
  stored: string | null,
): string | null {
  if (rows.some((row) => !row.agreedPrice)) {
    return stored;
  }
  const cents = rows.reduce(
    (sum, row) => sum + moneyToCents(row.agreedPrice ?? '0.00') * row.quantity,
    0,
  );
  return centsToMoney(cents);
}
