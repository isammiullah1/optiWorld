'use client';

import type { DashboardStats } from '@optiworld/shared';
import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatMoney } from './dashboard-format';

const CURRENT = 'var(--ow-blue)';
const EARLIER = 'color-mix(in srgb, var(--ow-blue) 42%, white)';

export function MonthlySalesChart({
  months,
}: {
  months: DashboardStats['monthlySales'];
}): React.ReactElement {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  const data = months.map((month) => ({ ...month, amount: Number(month.total) }));

  if (!ready) {
    return <div className="h-[260px] animate-pulse rounded-xl border border-line bg-white" />;
  }

  return (
    <section
      className="rounded-xl border border-line bg-white p-4"
      aria-label="Monthly sales, last 6 months"
    >
      <h2 className="text-md font-semibold text-ink">Monthly sales</h2>
      <div className="mt-3 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 13, fill: 'var(--ow-ink3)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: 'var(--ow-bg)' }}
              formatter={(value) => {
                const amount = typeof value === 'number' ? value : Number(value ?? 0);
                return [formatMoney(amount.toFixed(2)), 'Sales'];
              }}
            />
            <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
              {data.map((month) => (
                <Cell key={month.month} fill={month.isCurrent ? CURRENT : EARLIER} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
