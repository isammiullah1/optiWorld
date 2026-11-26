'use client';

import type { WholesalerCatalogActivity, WholesalerOrderActivity } from '@optiworld/shared';
import { Calendar, Check, Clock, PackageCheck } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatShortDate } from '@/components/retailer/dashboard-format';

import { downloadOrderHistory, loadCatalogActivity, loadOrderActivity } from './wholesaler-api';
import {
  AMBER_CARD,
  BLUE_CARD,
  headCellClass,
  headRowClass,
  ListPager,
  MetricCard,
  NAVY_CARD,
  pageWindow,
  TEAL_CARD,
  type PageSize,
} from './wholesaler-surface';

const AMBER = '#D97C10';
const BLUE = '#016795';
const TEAL = '#367588';
const MUTED = '#8892A4';
const FOOTER = 'Revenue and financial data is managed outside OptiWorld.';

export function WholesalerReports(): React.ReactElement {
  const { data: session } = useSession();
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [activity, setActivity] = useState<WholesalerOrderActivity | null>(null);
  const [catalog, setCatalog] = useState<WholesalerCatalogActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [from, to, pageSize]);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token || from > to) {
      return;
    }
    setActivity(null);
    setCatalog(null);
    void Promise.all([loadOrderActivity(token, from, to), loadCatalogActivity(token, from, to)])
      .then(([orders, products]) => {
        setActivity(orders);
        setCatalog(products);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'These reports could not be loaded');
      });
  }, [from, session?.accessToken, to]);

  const bars = activity
    ? [
        { name: 'Received', count: activity.counts.received, fill: AMBER },
        { name: 'Confirmed', count: activity.counts.confirmed, fill: BLUE },
        { name: 'Dispatched', count: activity.counts.dispatched, fill: TEAL },
        { name: 'Delivered', count: activity.counts.delivered, fill: MUTED },
      ]
    : [];
  const history = activity ? pageWindow(activity.orders, page, pageSize) : null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-ink3">
          From
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink"
          />
        </label>
        <label className="grid gap-1 text-xs text-ink3">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink"
          />
        </label>
        <button
          type="button"
          disabled={exporting || from > to}
          className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => {
            const token = session?.accessToken;
            if (!token) {
              return;
            }
            setExporting(true);
            void downloadOrderHistory(token, from, to, 'xlsx')
              .catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'The workbook could not be downloaded',
                );
              })
              .finally(() => setExporting(false));
          }}
        >
          {exporting ? 'Exporting…' : 'Export Excel'}
        </button>
        <button
          type="button"
          disabled={exporting || from > to}
          className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink2 disabled:opacity-50"
          onClick={() => {
            const token = session?.accessToken;
            if (!token) {
              return;
            }
            setExporting(true);
            void downloadOrderHistory(token, from, to, 'pdf')
              .catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'The PDF could not be downloaded',
                );
              })
              .finally(() => setExporting(false));
          }}
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {activity === null && !error ? (
        <div
          className="h-40 animate-pulse rounded-xl border border-line bg-white"
          aria-busy="true"
        />
      ) : null}
      {activity ? (
        <>
          <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Received"
              value={String(activity.counts.received)}
              card={AMBER_CARD}
              mark="bg-amber-soft text-amber"
              icon={Clock}
            />
            <MetricCard
              label="Confirmed"
              value={String(activity.counts.confirmed)}
              card={BLUE_CARD}
              mark="bg-action-soft text-action"
              icon={Check}
            />
            <MetricCard
              label="Dispatched"
              value={String(activity.counts.dispatched)}
              card={TEAL_CARD}
              mark="bg-teal-soft text-teal"
              icon={Calendar}
            />
            <MetricCard
              label="Delivered"
              value={String(activity.counts.delivered)}
              card={NAVY_CARD}
              mark="bg-white text-navy"
              icon={PackageCheck}
            />
          </section>
          <ReportCard title="Order activity">
            {ready ? (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bars}>
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 13, fill: MUTED }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 13, fill: MUTED }}
                      axisLine={false}
                      tickLine={false}
                      width={28}
                    />
                    <Tooltip />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {bars.map((bar) => (
                        <Cell key={bar.name} fill={bar.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-56" />
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className={headRowClass}>
                    {[
                      'Order #',
                      'Retailer',
                      'Items',
                      'Status',
                      'Submitted',
                      'Confirmed',
                      'Dispatched',
                      'Delivered',
                    ].map((heading) => (
                      <th key={heading} className={headCellClass}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.orders.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-sm text-ink2" colSpan={8}>
                        No orders were submitted in this range.
                      </td>
                    </tr>
                  ) : (
                    history?.visible.map((order) => (
                      <tr key={order.id} className="border-t border-line">
                        <td className="py-2 pr-3 text-xs text-ink">#{order.reference}</td>
                        <td className="py-2 pr-3 text-xs text-ink">{order.retailerName}</td>
                        <td className="py-2 pr-3 text-xs text-ink2">{order.itemsSummary}</td>
                        <td className="py-2 pr-3 text-xs text-ink2">{order.status}</td>
                        <td className="py-2 pr-3 text-xs text-ink3">
                          {formatShortDate(order.submittedAt)}
                        </td>
                        <td className="py-2 pr-3 text-xs text-ink3">
                          {order.confirmedAt ? formatShortDate(order.confirmedAt) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-xs text-ink3">
                          {order.dispatchedAt ? formatShortDate(order.dispatchedAt) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-xs text-ink3">
                          {order.deliveredAt ? formatShortDate(order.deliveredAt) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {history ? (
              <ListPager
                total={activity.orders.length}
                shown={history.visible.length}
                page={history.current}
                pageCount={history.pageCount}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={setPageSize}
              />
            ) : null}
            <ReportFooter />
          </ReportCard>
          <ReportCard title="Order history by retailer">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className={headRowClass}>
                    <th className={headCellClass}>Retailer</th>
                    {activity.months.map((month) => (
                      <th key={month} className={headCellClass}>
                        {month}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.byRetailer.length === 0 ? (
                    <tr>
                      <td className="py-3 text-sm text-ink2" colSpan={activity.months.length + 1}>
                        No retailer orders in this range.
                      </td>
                    </tr>
                  ) : (
                    activity.byRetailer.map((row) => (
                      <tr key={row.retailerName} className="border-t border-line">
                        <td className="py-2 pr-3 text-xs text-ink">{row.retailerName}</td>
                        {row.counts.map((count, index) => (
                          <td
                            key={`${row.retailerName}-${activity.months[index] ?? index}`}
                            className="py-2 pr-3 text-xs text-ink2"
                          >
                            {count}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <ReportFooter />
          </ReportCard>
          <ReportCard title="Response time">
            <p className="text-2xl font-semibold text-ink">
              {responseLabel(activity.responseTime.averageMinutes)}
            </p>
            <p className="mt-1 text-sm text-ink2">
              Average time from order submission to the wholesaler&apos;s first chat reply.
              {activity.responseTime.sampleSize === 0
                ? ' No replies in this range.'
                : ` Based on ${activity.responseTime.sampleSize} ${activity.responseTime.sampleSize === 1 ? 'order' : 'orders'}.`}
            </p>
            <ReportFooter />
          </ReportCard>
        </>
      ) : null}
      {catalog ? (
        <ReportCard title="Catalog activity">
          {catalog.products.length === 0 ? (
            <p className="text-sm text-ink2">No catalog lines were ordered in this range.</p>
          ) : ready ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={catalog.products} layout="vertical" margin={{ left: 16 }}>
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 13, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="productName"
                    width={120}
                    tick={{ fontSize: 13, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip />
                  <Bar dataKey="orderLines" fill={BLUE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56" />
          )}
          <ReportFooter />
        </ReportCard>
      ) : null}
    </div>
  );
}

function ReportCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section
      className={`rounded-xl border p-4 ${title === 'Order activity' ? BLUE_CARD : title === 'Order history by retailer' ? NAVY_CARD : TEAL_CARD}`}
    >
      <h2 className="text-md font-semibold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ReportFooter(): React.ReactElement {
  return <p className="mt-3 text-xs text-ink3">{FOOTER}</p>;
}

function responseLabel(minutes: number | null): string {
  if (minutes === null) {
    return '—';
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours === 0 ? `${rest} min` : `${hours} h ${rest} min`;
}

function defaultRange(now = new Date()): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${to}T00:00:00.000Z`) - 29 * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to };
}
