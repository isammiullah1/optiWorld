'use client';

import type { AgingReport } from '@optiworld/shared';
import { useEffect, useState } from 'react';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatMoney } from './dashboard-format';

const TEAL = 'var(--ow-teal)';
const AMBER = 'var(--ow-amber)';
const RED = 'var(--ow-red)';
const DEEP = '#7A1F1F';

export function AgingChart({ buckets }: { buckets: AgingReport['buckets'] }): React.ReactElement {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);
  const data = [
    {
      name: 'Outstanding',
      current: Number(buckets.current),
      days31: Number(buckets.days31to60),
      days61: Number(buckets.days61to90),
      days90: Number(buckets.days90plus),
    },
  ];
  if (!ready) {
    return <div className="h-[260px] rounded-xl border border-line bg-white" />;
  }
  return (
    <section
      className="rounded-xl border border-line bg-white p-4"
      aria-label="Outstanding balances by age"
    >
      <h2 className="text-md font-semibold text-ink">Outstanding by age</h2>
      <div className="mt-3 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 13, fill: 'var(--ow-ink3)' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis hide />
            <Tooltip
              cursor={{ fill: 'var(--ow-bg)' }}
              formatter={(value, name) => {
                const amount = typeof value === 'number' ? value : Number(value ?? 0);
                return [formatMoney(amount.toFixed(2)), bucketName(String(name))];
              }}
            />
            <Legend formatter={(value) => bucketName(String(value))} />
            <Bar dataKey="current" stackId="age" fill={TEAL} name="current" />
            <Bar dataKey="days31" stackId="age" fill={AMBER} name="days31" />
            <Bar dataKey="days61" stackId="age" fill={RED} name="days61" />
            <Bar dataKey="days90" stackId="age" fill={DEEP} name="days90" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function bucketName(key: string): string {
  if (key === 'current') {
    return 'Current (0-30d)';
  }
  if (key === 'days31') {
    return '31-60d';
  }
  if (key === 'days61') {
    return '61-90d';
  }
  return '90+d';
}
