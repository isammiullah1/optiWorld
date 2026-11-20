'use client';

import type { JobStatus, LabJobActivity, LabJobHistory, LabTurnaround } from '@optiworld/shared';
import { JOB_STATUSES } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { jobStatusLabel } from '@/components/retailer/LabJobStatus';
import {
  ReportSection,
  ReportTable,
  type ReportCell,
  type ReportTone,
} from '@/components/retailer/ReportTable';

import {
  downloadLabJobHistory,
  loadLabJobActivity,
  loadLabJobHistory,
  loadLabTurnaround,
} from './lab-api';

const AMBER = '#D97C10';
const TEAL = '#367588';
const MUTED = '#8892A4';
const PAGE_CHOICES = [10, 20, 30, 40] as const;
const MAX_ROWS = 100;

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
      <div className="flex flex-wrap items-end gap-3 rounded-xl border-2 border-action bg-action-soft p-4">
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
      {activity ? <ActivitySection activity={activity} ready={ready} /> : null}
      {turnaround ? (
        <TurnaroundSections turnaround={turnaround} resetKey={`${from}|${to}`} />
      ) : null}
      {history ? (
        <PagedSection
          title="Job history"
          note="Jobs that match the search, the stage, and the dates above."
          tone="navy"
          columns={['Reference', 'Patient', 'Client', 'Status', 'Received', 'Completed']}
          empty="No jobs match these filters."
          resetKey={`${from}|${to}|${query}|${status}|${history.jobs.length}`}
          rows={history.jobs.map((job) => [
            { text: job.referenceNumber, className: 'font-medium text-action' },
            { text: job.patientName },
            { text: job.clientName ?? 'Walk-in', className: 'text-ink2' },
            { text: jobStatusLabel(job.status) },
            { text: job.createdAt.slice(0, 10), className: 'text-ink2' },
            { text: job.completedAt ? job.completedAt.slice(0, 10) : '—', className: 'text-ink2' },
          ])}
        />
      ) : null}
    </div>
  );
}

function ActivitySection({
  activity,
  ready,
}: {
  activity: LabJobActivity;
  ready: boolean;
}): React.ReactElement {
  const empty = activity.days.every((day) => day.received === 0 && day.completed === 0);
  return (
    <ReportSection
      title="Job activity"
      tone="blue"
      note="Jobs received and jobs finished on each day in this range."
    >
      {empty ? (
        <p className="px-4 py-6 text-sm text-ink2">
          No jobs were received or completed in this range.
        </p>
      ) : ready ? (
        <div className="h-56 bg-white px-2 py-3">
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
    </ReportSection>
  );
}

function TurnaroundSections({
  turnaround,
  resetKey,
}: {
  turnaround: LabTurnaround;
  resetKey: string;
}): React.ReactElement {
  return (
    <>
      <ReportSection
        title="Stage averages"
        tone="teal"
        note="Average hours a job spends in each stage."
      >
        <ReportTable
          tone="teal"
          columns={['Stage', 'Average hours']}
          empty="No stage times in this range."
          rows={turnaround.stages.map((stage) => [
            { text: jobStatusLabel(stage.status), className: 'font-medium text-ink' },
            {
              text: stage.averageHours === null ? '—' : String(stage.averageHours),
              className: stage.averageHours === null ? 'text-ink3' : 'text-ink',
            },
          ])}
        />
      </ReportSection>
      <PagedSection
        title="Hours per job"
        note="Hours from when the job opened until it finished, or until now if it is still open. A job above the average is marked slow."
        tone="amber"
        columns={['Job', 'Patient', 'Client', 'Hours']}
        empty="No jobs in this range."
        resetKey={`${resetKey}|${turnaround.jobs.length}`}
        rows={turnaround.jobs.map((job) => [
          {
            text: job.referenceNumber,
            note: job.slow ? 'Slow' : undefined,
            className: 'font-medium text-action',
          },
          { text: job.patientName },
          { text: job.clientName ?? 'Walk-in', className: 'text-ink2' },
          {
            text: String(job.hours),
            className: job.slow ? 'font-semibold text-amber' : 'text-ink',
          },
        ])}
      />
    </>
  );
}

function PagedSection({
  title,
  note,
  tone,
  columns,
  rows,
  empty,
  resetKey,
}: {
  title: string;
  note: string;
  tone: ReportTone;
  columns: readonly string[];
  rows: readonly (readonly ReportCell[])[];
  empty: string;
  resetKey: string;
}): React.ReactElement {
  const [pageSize, setPageSize] = useState(10);
  const [draft, setDraft] = useState('10');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [pageSize, resetKey]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = rows.length === 0 ? 0 : (current - 1) * pageSize;
  const visible = rows.slice(start, start + pageSize);

  function applyDraft(raw: string): void {
    const next = Number(raw);
    if (!Number.isInteger(next) || next < 1 || next > MAX_ROWS) {
      setDraft(String(pageSize));
      return;
    }
    setPageSize(next);
    setDraft(String(next));
  }

  return (
    <ReportSection title={title} note={note} tone={tone}>
      <ReportTable tone={tone} columns={columns} rows={visible} empty={empty} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/70 bg-white/60 px-4 py-3 text-sm text-ink2">
        <p>
          {rows.length === 0 ? '0' : start + 1}–{start + visible.length} of {rows.length}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {PAGE_CHOICES.map((size) => (
            <button
              key={size}
              type="button"
              aria-pressed={pageSize === size}
              onClick={() => {
                setPageSize(size);
                setDraft(String(size));
              }}
              className={`h-9 min-w-9 rounded-lg border px-2 text-sm ${
                pageSize === size
                  ? 'border-navy bg-navy text-white'
                  : 'border-line bg-white text-ink'
              }`}
            >
              {size}
            </button>
          ))}
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              applyDraft(draft);
            }}
          >
            <label className="flex items-center gap-2">
              Rows
              <input
                type="number"
                min={1}
                max={MAX_ROWS}
                inputMode="numeric"
                value={draft}
                aria-label={`Rows to show in ${title}`}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => applyDraft(draft)}
                className="h-9 w-16 rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-action"
              />
            </label>
          </form>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
            className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={current >= pageCount}
            onClick={() => setPage(current + 1)}
            className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
          >
            Next
          </button>
        </div>
      </div>
    </ReportSection>
  );
}

function defaultRange(now = new Date()): { from: string; to: string } {
  const end = now.toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${end}T00:00:00.000Z`) - 29 * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to: end };
}
