'use client';

import type { JobStatus, LabJobActivity, LabJobHistory, LabTurnaround } from '@optiworld/shared';
import { JOB_STATUSES } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { jobStatusLabel } from '@/components/retailer/LabJobStatus';

import {
  downloadLabJobHistory,
  loadLabJobActivity,
  loadLabJobHistory,
  loadLabTurnaround,
} from './lab-api';

const AMBER = '#D97C10';
const TEAL = '#367588';
const MUTED = '#8892A4';

export function LabReports(): React.ReactElement {
  const { data: session } = useSession();
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<JobStatus | ''>('');
  const [activity, setActivity] = useState<LabJobActivity | null>(null);
  const [turnaround, setTurnaround] = useState<LabTurnaround | null>(null);
  const [history, setHistory] = useState<LabJobHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token || from > to) {
      return;
    }
    setActivity(null);
    setTurnaround(null);
    setHistory(null);
    void Promise.all([
      loadLabJobActivity(token, from, to),
      loadLabTurnaround(token, from, to),
      loadLabJobHistory(token, { q: query.trim() || undefined, status, from, to }),
    ])
      .then(([days, stages, jobs]) => {
        setActivity(days);
        setTurnaround(stages);
        setHistory(jobs);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'These reports could not be loaded');
      });
  }, [from, query, session?.accessToken, status, to]);

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
        <label className="grid gap-1 text-xs text-ink3">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Patient, reference, client"
            className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink"
          />
        </label>
        <label className="grid gap-1 text-xs text-ink3">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as JobStatus | '')}
            className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink"
          >
            <option value="">All stages</option>
            {JOB_STATUSES.filter((stage) => stage !== 'FITTING' && stage !== 'QC').map((stage) => (
              <option key={stage} value={stage}>
                {jobStatusLabel(stage)}
              </option>
            ))}
          </select>
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
            void downloadLabJobHistory(token, {
              q: query.trim() || undefined,
              status,
              from,
              to,
              format: 'xlsx',
            })
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error ? caught.message : 'The workbook could not be downloaded',
                ),
              )
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
            void downloadLabJobHistory(token, {
              q: query.trim() || undefined,
              status,
              from,
              to,
              format: 'pdf',
            })
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error ? caught.message : 'The PDF could not be downloaded',
                ),
              )
              .finally(() => setExporting(false));
          }}
        >
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {activity === null && !error ? (
        <div className="h-40 animate-pulse rounded-xl border border-line bg-white" />
      ) : null}
      {activity ? (
        <ReportCard title="Job activity">
          {activity.days.every((day) => day.received === 0 && day.completed === 0) ? (
            <p className="text-sm text-ink2">No jobs were received or completed in this range.</p>
          ) : ready ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activity.days.map((day) => ({ ...day, label: day.date.slice(5) }))}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 13, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 13, fill: MUTED }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="received" name="Received" fill={AMBER} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="Completed" fill={TEAL} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56" />
          )}
        </ReportCard>
      ) : null}
      {turnaround ? (
        <ReportCard title="Turnaround time">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase text-ink3">
                <th className="py-2 font-medium">Stage</th>
                <th className="py-2 font-medium">Average hours</th>
              </tr>
            </thead>
            <tbody>
              {turnaround.stages.map((stage) => (
                <tr key={stage.status} className="border-t border-line text-xs">
                  <td className="py-2">{jobStatusLabel(stage.status)}</td>
                  <td className="py-2">{stage.averageHours === null ? '—' : stage.averageHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="mt-4 w-full border-collapse text-left">
            <thead>
              <tr className="text-xs uppercase text-ink3">
                <th className="py-2 font-medium">Job</th>
                <th className="py-2 font-medium">Client</th>
                <th className="py-2 font-medium">Hours</th>
              </tr>
            </thead>
            <tbody>
              {turnaround.jobs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-3 text-sm text-ink3">
                    No jobs in this range.
                  </td>
                </tr>
              ) : null}
              {turnaround.jobs.map((job) => (
                <tr
                  key={job.id}
                  className={`border-t border-line text-xs ${job.slow ? 'bg-amber-soft' : ''}`}
                >
                  <td className="py-2">
                    <span className="font-medium text-action">{job.referenceNumber}</span>
                    <span className="ml-2 text-ink2">{job.patientName}</span>
                    {job.slow ? (
                      <span className="ml-2 rounded-full bg-amber px-2 py-0.5 text-xs font-medium text-white">
                        Slowest
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-ink2">{job.clientName ?? 'Walk-in'}</td>
                  <td className="py-2">{job.hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReportCard>
      ) : null}
      {history ? (
        <ReportCard title="Job history">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="text-xs uppercase text-ink3">
                  <th className="py-2 font-medium">Reference</th>
                  <th className="py-2 font-medium">Patient</th>
                  <th className="py-2 font-medium">Client</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Received</th>
                  <th className="py-2 font-medium">Completed</th>
                </tr>
              </thead>
              <tbody>
                {history.jobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-3 text-sm text-ink3">
                      No jobs match these filters.
                    </td>
                  </tr>
                ) : null}
                {history.jobs.map((job) => (
                  <tr key={job.id} className="border-t border-line text-xs">
                    <td className="py-2 font-medium text-action">{job.referenceNumber}</td>
                    <td className="py-2">{job.patientName}</td>
                    <td className="py-2 text-ink2">{job.clientName ?? 'Walk-in'}</td>
                    <td className="py-2">{jobStatusLabel(job.status)}</td>
                    <td className="py-2 text-ink2">{job.createdAt.slice(0, 10)}</td>
                    <td className="py-2 text-ink2">
                      {job.completedAt ? job.completedAt.slice(0, 10) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

function defaultRange(now = new Date()): { from: string; to: string } {
  const end = now.toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${end}T00:00:00.000Z`) - 29 * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to: end };
}
