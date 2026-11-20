'use client';

import { productTagLabel, type LabClientJobs } from '@optiworld/shared';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { formatRupee } from '@/components/retailer/dashboard-format';
import { JobStatusBadge } from '@/components/retailer/LabJobStatus';

import { loadLabClientJobs } from './lab-api';
import { TypeBadge } from './LabClients';

export function LabClientProfile({ clientId }: { clientId: string }): React.ReactElement {
  const { data: session, status } = useSession();
  const [detail, setDetail] = useState<LabClientJobs | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <h2 className="mt-1 text-xl font-semibold text-ink">{client.name}</h2>
          <p className="mt-1 text-sm text-ink2">
            {client.username ? `@${client.username}` : 'No username'}
          </p>
          <p className="mt-1 text-sm text-ink2">
            {[client.city, client.phone].filter(Boolean).join(' · ') || 'No contact on file'}
          </p>
          <p className="mt-1 text-sm text-ink2">{client.address ?? 'No address on file'}</p>
          <p className="mt-3 text-sm text-ink3">About us</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{client.about?.trim() || '—'}</p>
          <p className="mt-1 text-sm text-ink2">
            Connected {client.connectedAt ? formatWhen(client.connectedAt) : 'date not on file'}
          </p>
          <div className="mt-2">
            <TypeBadge type={client.type} />
          </div>
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
        </div>
      </div>
      <JobTable title="Live jobs" empty="No live jobs from this client." jobs={live} />
      <JobTable title="Closed jobs" empty="No closed jobs yet." jobs={closed} />
    </section>
  );
}

function JobTable({
  title,
  empty,
  jobs,
}: {
  title: string;
  empty: string;
  jobs: LabClientJobs['jobs'];
}): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <h2 className="border-b border-line px-3 py-2 text-md font-semibold text-ink">{title}</h2>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="text-sm uppercase text-ink3">
            <th className="px-3 py-2 font-medium">Reference</th>
            <th className="px-3 py-2 font-medium">Patient</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Received</th>
            <th className="px-3 py-2 font-medium">Completed</th>
          </tr>
        </thead>
        <tbody>
          {jobs.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-sm text-ink3">
                {empty}
              </td>
            </tr>
          ) : null}
          {jobs.map((job) => (
            <tr key={job.id} className="border-t border-line text-sm">
              <td className="px-3 py-2 font-mono font-medium text-action">
                <Link href={`/laboratory/jobs?job=${job.id}`}>
                  {productTagLabel(job.referenceNumber)}
                </Link>
              </td>
              <td className="px-3 py-2">{job.patientName}</td>
              <td className="px-3 py-2">
                <JobStatusBadge status={job.status} />
              </td>
              <td className="px-3 py-2 text-ink2">{formatWhen(job.createdAt)}</td>
              <td className="px-3 py-2 text-ink2">
                {job.completedAt ? formatWhen(job.completedAt) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
