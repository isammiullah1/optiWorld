'use client';

import { productTagLabel, type LabClientJobs } from '@optiworld/shared';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Fragment, useEffect, useState } from 'react';

import { formatRupee, formatShortDate } from '@/components/retailer/dashboard-format';
import { JobStatusBadge } from '@/components/retailer/LabJobStatus';

import { ExternalClientDialog, TypeBadge } from './ExternalClientDialog';
import { loadLabClientJobs, updateExternalLabClient } from './lab-api';

export function LabClientProfile({ clientId }: { clientId: string }): React.ReactElement {
  const { data: session, status } = useSession();
  const [detail, setDetail] = useState<LabClientJobs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const token = session?.accessToken;
    if (status === 'loading' || !token) {
      return;
    }
    void loadLabClientJobs(token, clientId)
      .then((payload) => {
        setDetail(payload);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'This client could not be loaded');
      });
  }, [clientId, session?.accessToken, status]);

  if (error) {
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  }
  if (!detail) {
    return <div className="h-40 animate-pulse rounded-xl border border-line bg-white" />;
  }

  const { client, jobs } = detail;
  const live = jobs.filter((job) =>
    ['SUBMITTED', 'CONFIRMED', 'RECEIVED', 'CUTTING', 'FITTING', 'QC', 'READY'].includes(
      job.status,
    ),
  );
  const closed = jobs.filter((job) => !live.includes(job));
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-white p-4">
        <div>
          <Link href="/laboratory/clients" className="text-sm text-action">
            All clients
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-ink">{client.name}</h2>
            <TypeBadge type={client.type} />
          </div>
          {client.username ? <p className="mt-1 text-sm text-ink2">@{client.username}</p> : null}
          <p className="mt-1 text-sm text-ink2">
            {[client.city, client.phone].filter(Boolean).join(' · ') || 'No contact on file'}
          </p>
          <p className="mt-1 text-sm text-ink2">{client.address ?? 'No address on file'}</p>
          <p className="mt-3 text-sm text-ink3">About us</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{client.about?.trim() || '—'}</p>
          <p className="mt-1 text-sm text-ink2">
            {client.type === 'OPTIWORLD' ? 'Connected' : 'On file'}{' '}
            {client.connectedAt ? formatWhen(client.connectedAt) : 'date not on file'}
          </p>
        </div>
        <div className="grid gap-2 text-sm text-ink2">
          <p>{client.activeJobs} live jobs</p>
          <p>Outstanding {formatRupee(client.outstanding)}</p>
          <p>{client.totalJobs} jobs in all</p>
          <p>Average turnaround {hoursLabel(client.averageTurnaroundHours)}</p>
          <Link
            href={`/laboratory/bills?clientId=${client.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink"
          >
            Lab bills
          </Link>
          <Link
            href={`/laboratory/jobs?clientId=${client.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 text-sm font-medium text-white"
          >
            New job
          </Link>
          {client.type === 'EXTERNAL' ? (
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-navy bg-white px-4 text-sm font-semibold text-navy"
              onClick={() => {
                setSaveError(null);
                setEditing(true);
              }}
            >
              Edit profile
            </button>
          ) : null}
        </div>
      </div>
      {editing && client.type === 'EXTERNAL' ? (
        <ExternalClientDialog
          client={client}
          busy={saving}
          error={saveError}
          onClose={() => {
            if (!saving) {
              setEditing(false);
            }
          }}
          onSave={async (input) => {
            const token = session?.accessToken;
            if (!token) {
              return;
            }
            setSaving(true);
            setSaveError(null);
            try {
              await updateExternalLabClient(token, client.id, input);
              const payload = await loadLabClientJobs(token, clientId);
              setDetail(payload);
              setEditing(false);
            } catch (caught) {
              setSaveError(
                caught instanceof Error ? caught.message : 'The retailer could not be saved',
              );
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}
      <JobTable title="Live jobs" empty="No live jobs from this client." jobs={live} />
      <JobTable title="Closed jobs" empty="No closed jobs yet." jobs={closed} />
    </section>
  );
}

const PAGE_CHOICES = [10, 20, 30, 40] as const;
const MAX_ROWS = 100;
const JOB_COLUMNS = ['Reference', 'Patient', 'Status', 'Received', 'Completed'] as const;

const DAY_LOOK = [
  { fill: 'bg-action-soft', edge: 'border-action' },
  { fill: 'bg-teal-soft', edge: 'border-teal' },
  { fill: 'bg-amber-soft', edge: 'border-amber' },
  { fill: 'bg-[var(--ow-navy-soft)]', edge: 'border-navy' },
  { fill: 'bg-[var(--ow-work-soft)]', edge: 'border-[var(--ow-work)]' },
  { fill: 'bg-[var(--ow-sent-soft)]', edge: 'border-[var(--ow-sent)]' },
] as const;

function JobTable({
  title,
  empty,
  jobs,
}: {
  title: string;
  empty: string;
  jobs: LabClientJobs['jobs'];
}): React.ReactElement {
  const [pageSize, setPageSize] = useState(10);
  const [draft, setDraft] = useState('10');
  const [page, setPage] = useState(1);
  const listKey = jobs.map((job) => job.id).join('|');

  useEffect(() => {
    setPage(1);
  }, [pageSize, listKey]);

  const pageCount = Math.max(1, Math.ceil(jobs.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = jobs.length === 0 ? 0 : (current - 1) * pageSize;
  const visible = jobs.slice(start, start + pageSize);

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
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <h2 className="border-b border-line px-4 py-3 text-md font-semibold text-ink">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="bg-navy text-left">
              {JOB_COLUMNS.map((heading) => (
                <th
                  key={heading}
                  className="border border-navy px-3 py-2 text-xs font-medium uppercase tracking-wide text-white"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={JOB_COLUMNS.length} className="px-3 py-6 text-sm text-ink2">
                  {empty}
                </td>
              </tr>
            ) : (
              groupJobsByDay(visible).map((group, groupIndex) => (
                <Fragment key={group.day}>
                  {groupIndex > 0 ? (
                    <tr aria-hidden="true">
                      <td colSpan={JOB_COLUMNS.length} className="h-2 border-0 bg-white p-0" />
                    </tr>
                  ) : null}
                  <tr>
                    <td
                      colSpan={JOB_COLUMNS.length}
                      className={`border-x-2 border-t-2 border-b-2 px-3 py-2 text-sm font-semibold text-ink ${group.edge} ${group.fill}`}
                    >
                      {group.label}
                      <span className="ml-2 text-xs font-medium text-ink2">
                        {group.rows.length} {group.rows.length === 1 ? 'job' : 'jobs'}
                      </span>
                    </td>
                  </tr>
                  {group.rows.map((job) => {
                    const box = `${group.fill} border-b-2 ${group.edge}`;
                    return (
                      <tr key={job.id} className="hover:bg-white">
                        <td
                          className={`border-l-2 px-3 py-2 text-sm font-medium ${group.edge} ${box}`}
                        >
                          <Link
                            href={`/laboratory/jobs?job=${job.id}`}
                            className="font-medium text-action underline-offset-2 hover:underline"
                          >
                            {productTagLabel(job.referenceNumber)}
                          </Link>
                        </td>
                        <td className={`px-3 py-2 text-sm text-ink ${box}`}>{job.patientName}</td>
                        <td className={`px-3 py-2 ${box}`}>
                          <JobStatusBadge status={job.status} />
                        </td>
                        <td className={`px-3 py-2 text-sm text-ink2 ${box}`}>
                          {formatShortDate(job.createdAt)}
                        </td>
                        <td
                          className={`border-r-2 px-3 py-2 text-sm text-ink2 ${group.edge} ${box}`}
                        >
                          {job.completedAt ? formatShortDate(job.completedAt) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink2">
        <p>
          {jobs.length === 0 ? '0' : start + 1}–{start + visible.length} of {jobs.length}
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
    </div>
  );
}

function groupJobsByDay(rows: LabClientJobs['jobs']): Array<{
  day: string;
  label: string;
  fill: string;
  edge: string;
  rows: LabClientJobs['jobs'];
}> {
  const groups: Array<{
    day: string;
    label: string;
    fill: string;
    edge: string;
    rows: LabClientJobs['jobs'];
  }> = [];
  const index = new Map<string, number>();
  for (const job of rows) {
    const day = new Date(job.createdAt).toLocaleDateString('en-CA');
    const existing = index.get(day);
    if (existing !== undefined) {
      groups[existing]?.rows.push(job);
      continue;
    }
    const look = DAY_LOOK[groups.length % DAY_LOOK.length] ?? DAY_LOOK[0];
    index.set(day, groups.length);
    groups.push({
      day,
      label: formatShortDate(job.createdAt),
      fill: look.fill,
      edge: look.edge,
      rows: [job],
    });
  }
  return groups;
}

function hoursLabel(hours: number | null): string {
  if (hours === null) {
    return '—';
  }
  if (hours < 48) {
    return `${hours} h`;
  }
  return `${Math.round((hours / 24) * 10) / 10} d`;
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium' }).format(new Date(value));
}
