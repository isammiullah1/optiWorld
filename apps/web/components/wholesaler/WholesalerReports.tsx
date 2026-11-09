'use client';

import type { WholesalerCatalogActivity, WholesalerOrderActivity } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatShortDate } from '@/components/retailer/dashboard-format';

import { downloadOrderHistory, loadCatalogActivity, loadOrderActivity } from './wholesaler-api';

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

  useEffect(() => {
    setReady(true);
  }, []);

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
                  <tr>
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
                      <th
                        key={heading}
                        className="py-2 pr-3 text-xs font-medium uppercase tracking-wide text-ink3"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.orders.length === 0 ? (
                    <tr>
                      <td className="py-3 text-sm text-ink2" colSpan={8}>
                        No orders were submitted in this range.
                      </td>
                    </tr>
                  ) : (
                    activity.orders.map((order) => (
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
            <ReportFooter />
          </ReportCard>
          <ReportCard title="Order history by retailer">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    <th className="py-2 pr-3 text-xs font-medium uppercase tracking-wide text-ink3">
                      Retailer
                    </th>
                    {activity.months.map((month) => (
                      <th
                        key={month}
                        className="py-2 pr-3 text-xs font-medium uppercase tracking-wide text-ink3"
                      >
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
    <section className="rounded-xl border border-line bg-white p-4">
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
