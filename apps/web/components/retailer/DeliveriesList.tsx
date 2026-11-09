'use client';

import type { DeliveryRow } from '@optiworld/shared';
import { ChevronDown, CircleCheck, Eye, PackageCheck, Truck } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { Fragment, useEffect, useState } from 'react';

import { formatRupee, formatShortDate } from './dashboard-format';
import { loadDeliveries, markDeliveryDelivered } from './deliveries-api';

const PAGE_SIZES = [10, 20, 30, 40] as const;

type Board = 'READY' | 'DELIVERED';

export function DeliveriesList(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [board, setBoard] = useState<Board>('READY');
  const [pages, setPages] = useState<Record<Board, number>>({ READY: 1, DELIVERED: 1 });
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [ready, setReady] = useState<DeliveryRow[]>([]);
  const [delivered, setDelivered] = useState<DeliveryRow[]>([]);
  const [readyTotal, setReadyTotal] = useState(0);
  const [deliveredTotal, setDeliveredTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    setLoading(true);
    void loadDeliveries(token, {
      readyPage: pages.READY,
      deliveredPage: pages.DELIVERED,
      limit: pageSize,
    })
      .then((data) => {
        if (!active) {
          return;
        }
        setReady(data.ready);
        setDelivered(data.delivered);
        setReadyTotal(data.readyTotal);
        setDeliveredTotal(data.deliveredTotal);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Deliveries could not be loaded.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token, pages, pageSize, revision]);

  const rows = board === 'READY' ? ready : delivered;
  const total = board === 'READY' ? readyTotal : deliveredTotal;
  const page = pages[board];
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  async function deliver(id: string): Promise<void> {
    if (!token) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const result = await markDeliveryDelivered(token, id);
      setConfirmId(null);
      setNotice(result.message);
      setBoard('DELIVERED');
      setRevision((current) => current + 1);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'This order could not be marked delivered.',
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg bg-teal-soft px-3 py-2 text-sm text-teal" role="status">
          {notice}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Delivery boards">
        <BoardTab
          active={board === 'READY'}
          label="Ready for delivery"
          detail="Lab work is done and waiting to go out"
          count={readyTotal}
          tone="border-action bg-action-soft"
          icon={<Truck size={18} aria-hidden="true" />}
          onClick={() => setBoard('READY')}
        />
        <BoardTab
          active={board === 'DELIVERED'}
          label="Delivered orders"
          count={deliveredTotal}
          detail="Handed to the customer"
          tone="border-teal bg-teal-soft"
          icon={<PackageCheck size={18} aria-hidden="true" />}
          onClick={() => setBoard('DELIVERED')}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full min-w-[920px] border-collapse">
          <thead>
            <tr className="bg-navy text-left">
              {[
                'Invoice',
                'Customer',
                'Reference',
                'Address',
                'Charge',
                'Total',
                board === 'READY' ? 'Ready' : 'Delivered',
                'Actions',
              ].map((heading) => (
                <th
                  key={heading}
                  className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-white"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6">
                  <div className="h-16 animate-pulse rounded-lg bg-canvas" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-ink2">
                  <CircleCheck className="mx-auto mb-2 text-teal" size={20} aria-hidden="true" />
                  {board === 'READY'
                    ? 'Nothing is waiting for delivery.'
                    : 'No orders have been delivered yet.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <Fragment key={row.id}>
                  <tr>
                    <td className="px-3 py-2 text-sm text-ink">
                      <Link href={`/retailer/billing/${row.invoiceId}`} className="text-action">
                        #{row.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-sm text-ink">{row.customerName}</td>
                    <td className="px-3 py-2 text-sm text-ink2">{row.references || '—'}</td>
                    <td className="max-w-[220px] px-3 py-2 text-sm text-ink2">{row.address}</td>
                    <td className="px-3 py-2 text-sm text-ink">{formatRupee(row.charge)}</td>
                    <td className="px-3 py-2 text-sm text-ink">{formatRupee(row.total)}</td>
                    <td className="px-3 py-2 text-sm text-ink2">
                      {formatShortDate((board === 'READY' ? row.readyAt : row.deliveredAt) ?? '')}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/retailer/billing/${row.invoiceId}`}
                          className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-action"
                        >
                          <Eye size={16} aria-hidden="true" />
                          View
                        </Link>
                        {board === 'READY' ? (
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => setConfirmId(row.id)}
                            className="min-h-[44px] rounded-lg bg-teal px-3 text-sm font-medium text-white disabled:opacity-60"
                          >
                            {busyId === row.id ? 'Saving…' : 'Mark delivered'}
                          </button>
                        ) : (
                          <span className="text-teal">Delivered</span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {confirmId === row.id ? (
                    <tr>
                      <td colSpan={8} className="bg-amber-soft px-3 py-3 text-sm text-ink">
                        <p>Mark this order delivered? The customer is notified on WhatsApp.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busyId === row.id}
                            onClick={() => {
                              void deliver(row.id);
                            }}
                            className="min-h-[44px] rounded-lg bg-teal px-3 text-sm font-medium text-white disabled:opacity-60"
                          >
                            Mark delivered
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="min-h-[44px] rounded-lg border border-line bg-white px-3 text-sm text-ink2"
                          >
                            Keep ready
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink2">
          Rows
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]);
              setPages({ READY: 1, DELIVERED: 1 });
            }}
            className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPages((current) => ({ ...current, [board]: page - 1 }))}
            className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
          >
            Previous
          </button>
          <span className="text-sm text-ink2">
            {page} / {pageCount}
          </span>
          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setPages((current) => ({ ...current, [board]: page + 1 }))}
            className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function BoardTab({
  active,
  label,
  detail,
  count,
  icon,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  detail: string;
  count: number;
  icon: React.ReactNode;
  tone: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-[88px] items-center gap-3 rounded-xl border-2 p-4 text-left ${active ? tone : 'border-line bg-white'}`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${active ? 'bg-white text-ink' : 'bg-canvas text-ink2'}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-md font-semibold text-ink">
          {label}
          <span className="rounded-full bg-white px-2 text-sm font-medium text-ink2">{count}</span>
        </span>
        <span className="block text-sm text-ink2">{detail}</span>
      </span>
      <ChevronDown
        size={18}
        className={active ? 'shrink-0 text-ink' : 'shrink-0 -rotate-90 text-ink3'}
        aria-hidden="true"
      />
    </button>
  );
}
