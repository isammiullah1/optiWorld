'use client';

import type { CreditReport, CreditRisk } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { formatMoney, formatRupee } from './dashboard-format';
import { defaultReportRange, downloadReport, loadCreditReport } from './reports-api';

const RISK_LABEL: Record<CreditRisk, string> = {
  current: 'Current',
  watch: 'Watch',
  overdue: 'Overdue',
  severe: 'Severe',
};

const RISK_CLASS: Record<CreditRisk, string> = {
  current: 'bg-teal-soft text-teal',
  watch: 'bg-amber-soft text-amber',
  overdue: 'bg-danger-soft text-danger',
  severe: 'bg-danger text-white',
};

export function CreditReportSection(): React.ReactElement | null {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const isOwner = session?.user.role === 'OWNER';
  const [report, setReport] = useState<CreditReport | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (!token || !isOwner) {
      return;
    }
    void loadCreditReport(token)
      .then((next) => {
        setReport(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : 'The credit report could not be loaded',
        );
      });
  }, [isOwner, token]);

  if (!isOwner) {
    return null;
  }

  const points =
    report?.months.map((month) => ({ label: month.label, total: Number(month.total) })) ?? [];

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-ink">Outstanding credit</h2>
          <p className="text-sm text-ink2">Month-over-month balance and customer risk.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!token}
            onClick={() => {
              if (!token) {
                return;
              }
              const range = defaultReportRange();
              void downloadReport(token, 'CREDIT', range.from, range.to, 'xlsx').catch(
                (caught: unknown) => {
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : 'The workbook could not be downloaded',
                  );
                },
              );
            }}
            className="min-h-[44px] rounded-lg border border-line bg-white px-4 text-sm text-ink2"
          >
            Export Excel
          </button>
          <button
            type="button"
            disabled={!token}
            onClick={() => {
              if (!token) {
                return;
              }
              const range = defaultReportRange();
              void downloadReport(token, 'CREDIT', range.from, range.to, 'pdf').catch(
                (caught: unknown) => {
                  setError(
                    caught instanceof Error ? caught.message : 'The PDF could not be downloaded',
                  );
                },
              );
            }}
            className="min-h-[44px] rounded-lg border border-line bg-white px-4 text-sm text-ink2"
          >
            Export PDF
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {report && ready ? (
        <div className="rounded-xl border border-line bg-white p-4">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 13, fill: '#8892A4' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip formatter={(value) => formatMoney(String(value ?? 0))} />
                <Bar dataKey="total" fill="#016795" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="h-40 animate-pulse rounded-xl bg-white" />
      )}
      {report ? (
        <ul className="grid gap-2">
          {report.rows.map((row) => (
            <li
              key={row.customerId}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-ink">{row.customerName}</p>
                <p className="text-xs text-ink3">{formatRupee(row.total)}</p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_CLASS[row.risk]}`}
              >
                {RISK_LABEL[row.risk]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
