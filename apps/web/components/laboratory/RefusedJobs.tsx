'use client';

import type { LabKanbanCard } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { formatShortDate } from '@/components/retailer/dashboard-format';

import { loadLabBoard } from './lab-api';

type ClosedJob = LabKanbanCard & { kind: 'REJECTED' | 'CANCELLED' };
type View = 'summary' | 'shops' | 'reasons' | 'people';

export function RefusedJobs(): React.ReactElement | null {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [jobs, setJobs] = useState<ClosedJob[] | null>(null);
  const [view, setView] = useState<View>('summary');

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    void loadLabBoard(token, {})
      .then((board) => {
        if (!active) {
          return;
        }
        setJobs(
          board.jobs.flatMap((job) =>
            job.status === 'REJECTED' || job.status === 'CANCELLED'
              ? [{ ...job, kind: job.status }]
              : [],
          ),
        );
      })
      .catch(() => {
        if (active) {
          setJobs([]);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  if (jobs === null || jobs.length === 0) {
    return null;
  }
  const rejected = jobs.filter((job) => job.kind === 'REJECTED');
  const cancelled = jobs.filter((job) => job.kind === 'CANCELLED');

  return (
    <section className="grid gap-3 rounded-xl border-2 border-danger bg-danger-soft p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-md font-semibold text-ink">Refused and cancelled</h2>
          <p className="text-sm text-ink2">
            Jobs kept out of the bill list. Rejected means the laboratory declined the job.
            Cancelled means it was stopped after it had been accepted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['summary', 'Summary'],
              ['shops', 'By shop'],
              ['reasons', 'By reason'],
              ['people', 'By person'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`min-h-11 rounded-lg px-3 text-sm font-medium ${
                view === id ? 'bg-danger text-white' : 'border border-danger bg-white text-danger'
              }`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {view === 'summary' ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Count
            label="Rejected"
            value={rejected.length}
            tone="border-danger bg-white text-danger"
          />
          <Count label="Cancelled" value={cancelled.length} tone="border-navy bg-white text-navy" />
          <Count
            label="Shops"
            value={new Set(jobs.map((job) => job.retailerName ?? 'Walk-in')).size}
            tone="border-amber bg-white text-amber"
          />
        </div>
      ) : null}
      {view === 'shops' ? (
        <CountTable rows={countBy(jobs, (job) => job.retailerName ?? 'Walk-in')} label="Shop" />
      ) : null}
      {view === 'reasons' ? (
        <CountTable
          rows={countBy(jobs, (job) => job.stageNote?.trim() || 'No reason recorded')}
          label="Reason"
        />
      ) : null}
      {view === 'people' ? (
        <CountTable
          rows={countBy(jobs, (job) => job.closedByName?.trim() || 'Not recorded')}
          label="Person"
        />
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-danger/30 bg-white">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="bg-danger text-left text-white">
              {['Job', 'Customer', 'Shop', 'Outcome', 'Reason', 'By', 'Date'].map((heading) => (
                <th key={heading} className="px-3 py-2 text-xs font-medium uppercase tracking-wide">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-line">
                <td className="px-3 py-2 text-sm font-medium text-ink">{job.referenceNumber}</td>
                <td className="px-3 py-2 text-sm text-ink">{job.patientName}</td>
                <td className="px-3 py-2 text-sm text-ink2">{job.retailerName ?? 'Walk-in'}</td>
                <td className="px-3 py-2 text-sm font-medium text-ink">
                  {job.kind === 'REJECTED' ? 'Rejected' : 'Cancelled'}
                </td>
                <td className="px-3 py-2 text-sm text-ink2">
                  {job.stageNote?.trim() || 'No reason recorded'}
                </td>
                <td className="px-3 py-2 text-sm text-ink2">
                  {job.closedByName?.trim() || 'Not recorded'}
                </td>
                <td className="px-3 py-2 text-sm text-ink2">
                  {formatShortDate(job.stageEnteredAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}): React.ReactElement {
  return (
    <p className={`rounded-xl border-2 px-4 py-3 ${tone}`}>
      <span className="block text-xs font-medium uppercase tracking-wide">{label}</span>
      <span className="mt-1 block text-2xl font-semibold text-ink">{value}</span>
    </p>
  );
}

function CountTable({
  rows,
  label,
}: {
  rows: Array<{ name: string; rejected: number; cancelled: number }>;
  label: string;
}): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-white text-left">
            {[label, 'Rejected', 'Cancelled'].map((heading) => (
              <th
                key={heading}
                className="border-b border-line px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink2"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-line">
              <td className="px-3 py-2 text-sm font-medium text-ink">{row.name}</td>
              <td className="px-3 py-2 text-sm text-danger">{row.rejected}</td>
              <td className="px-3 py-2 text-sm text-navy">{row.cancelled}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function countBy(
  jobs: readonly ClosedJob[],
  nameOf: (job: ClosedJob) => string,
): Array<{ name: string; rejected: number; cancelled: number }> {
  const groups = new Map<string, { name: string; rejected: number; cancelled: number }>();
  for (const job of jobs) {
    const name = nameOf(job);
    const current = groups.get(name) ?? { name, rejected: 0, cancelled: 0 };
    if (job.kind === 'REJECTED') {
      current.rejected += 1;
    } else {
      current.cancelled += 1;
    }
    groups.set(name, current);
  }
  return [...groups.values()].sort(
    (left, right) => right.rejected + right.cancelled - (left.rejected + left.cancelled),
  );
}
