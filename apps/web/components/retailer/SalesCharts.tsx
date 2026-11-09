'use client';

import type { SalesReport } from '@optiworld/shared';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatMoney } from './dashboard-format';

const TEAL = '#367588';
const AMBER = '#D97C10';
const BLUE = '#016795';

export function SalesCharts({ report }: { report: SalesReport }): React.ReactElement {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  const daily = report.daily.map((point) => ({
    label: point.date.slice(5),
    total: Number(point.total),
  }));
  const payments = [
    { name: 'Cash', value: Number(report.cashTotal) },
    { name: 'Credit', value: Number(report.creditTotal) },
  ];
  const products = report.topProducts.map((product) => ({
    name: product.productName,
    total: Number(product.total),
  }));
  if (!ready) {
    return <div className="h-64 rounded-xl border border-line bg-white" />;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-line bg-white p-4 lg:col-span-2">
        <h2 className="text-md font-semibold text-ink">Daily revenue</h2>
        <div className="mt-3 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 13, fill: '#8892A4' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip formatter={(value) => formatMoney(String(value ?? 0))} />
              <Bar dataKey="total" fill={BLUE} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="text-md font-semibold text-ink">Cash vs credit</h2>
        <div className="mt-3 h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={payments} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72}>
                <Cell fill={TEAL} />
                <Cell fill={AMBER} />
              </Pie>
              <Tooltip formatter={(value) => formatMoney(String(value ?? 0))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="text-md font-semibold text-ink">Top products</h2>
        {products.length === 0 ? (
          <p className="mt-4 text-sm text-ink2">No products sold in this range.</p>
        ) : (
          <div className="mt-3 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={products} layout="vertical" margin={{ left: 24 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 13, fill: '#8892A4' }}
                />
                <Tooltip formatter={(value) => formatMoney(String(value ?? 0))} />
                <Bar dataKey="total" fill={TEAL} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}
