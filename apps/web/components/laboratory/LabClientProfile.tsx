'use client';

import type { LabClientJobs } from '@optiworld/shared';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

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
          <p>{client.totalJobs} jobs</p>
          <p>Average turnaround {hoursLabel(client.averageTurnaroundHours)}</p>
          <Link
            href={`/laboratory/jobs?clientId=${client.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-action px-4 text-sm font-medium text-white"
          >
            New job
          </Link>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
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
                  No jobs for this client yet.
                </td>
              </tr>
            ) : null}
            {jobs.map((job) => (
              <tr key={job.id} className="border-t border-line text-sm">
                <td className="px-3 py-2 font-medium text-action">{job.referenceNumber}</td>
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
    </section>
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
