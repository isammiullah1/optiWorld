'use client';

import {
  isProcessingStatus,
  JOB_STATUS_LABEL,
  type JobStatus,
  type LabFeature,
  type LabKanbanCard,
  type RetailerAlert,
} from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatRelativeTime } from '@/components/retailer/dashboard-format';

import { loadLabBoard } from './lab-api';
import { loadLabProfile } from './lab-account-api';
import { loadLabNotifications } from './lab-notifications-api';

const STAGES: readonly {
  id: string;
  label: string;
  className: string;
  match: (status: JobStatus) => boolean;
}[] = [
  {
    id: 'SUBMITTED',
    label: 'Submitted',
    className: 'bg-amber-soft text-amber',
    match: (status) => status === 'SUBMITTED',
  },
  {
    id: 'CONFIRMED',
    label: 'Confirmed',
    className: 'bg-action-soft text-action',
    match: (status) => status === 'CONFIRMED',
  },
  {
    id: 'RECEIVED',
    label: 'Received',
    className: 'bg-canvas text-ink2',
    match: (status) => status === 'RECEIVED',
  },
  {
    id: 'PROCESSING',
    label: 'Processing',
    className: 'bg-action-soft text-action',
    match: isProcessingStatus,
  },
  {
    id: 'READY',
    label: 'Ready',
    className: 'bg-teal-soft text-teal',
    match: (status) => status === 'READY',
  },
  {
    id: 'DISPATCHED',
    label: 'Dispatched',
    className: 'bg-canvas text-ink3',
    match: (status) => status === 'DISPATCHED',
  },
];

export function LabDashboard(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [labName, setLabName] = useState('');
  const [features, setFeatures] = useState<LabFeature[] | null>(null);
  const [jobs, setJobs] = useState<LabKanbanCard[] | null>(null);
  const [notices, setNotices] = useState<RetailerAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    void loadLabProfile(token)
      .then(async (profile) => {
        if (!active) {
          return;
        }
        setLabName(profile.laboratory.name);
        setFeatures(profile.features);
        const [board, notes] = await Promise.all([
          profile.features.includes('jobs') ? loadLabBoard(token, {}) : Promise.resolve(null),
          profile.features.includes('notifications')
            ? loadLabNotifications(token)
            : Promise.resolve(null),
        ]);
        if (!active) {
          return;
        }
        setJobs(board?.jobs ?? null);
        setNotices(notes);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'The dashboard could not be loaded');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const activeJobs = (jobs ?? [])
    .filter((job) => job.status !== 'DISPATCHED' && job.status !== 'CANCELLED')
    .slice(0, 8);
  const unread = notices?.filter((notice) => !notice.isRead).length ?? 0;

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-xl font-semibold text-ink">{labName || 'Laboratory'}</h2>
        <p className="text-sm text-ink2">Jobs in progress and notices from connected shops.</p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {features === null && !error ? (
        <div className="h-40 animate-pulse rounded-xl bg-white" />
      ) : null}
      {features ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-3">
            {features.includes('jobs') && jobs ? (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {STAGES.map((stage) => {
                    const count = jobs.filter((job) => stage.match(job.status)).length;
                    return (
                      <Link
                        key={stage.id}
                        href="/laboratory/jobs"
                        className={`rounded-xl border border-line px-3 py-3 ${stage.className}`}
                      >
                        <p className="text-xs font-medium uppercase tracking-wide">{stage.label}</p>
                        <p className="mt-1 text-2xl font-semibold text-ink">{count}</p>
                      </Link>
                    );
                  })}
                </div>
                <article className="rounded-xl border border-line bg-white">
                  <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <h3 className="text-md font-semibold text-ink">Active jobs</h3>
                    <Link href="/laboratory/jobs" className="text-sm font-medium text-action">
                      Open board
                    </Link>
                  </header>
                  {activeJobs.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-ink2">No jobs are in progress.</p>
                  ) : (
                    <ul>
                      {activeJobs.map((job) => (
                        <li key={job.id} className="border-t border-line first:border-t-0">
                          <Link
                            href={`/laboratory/jobs?job=${job.id}`}
                            className="grid gap-1 px-4 py-3 hover:bg-canvas"
                          >
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-action">
                                {job.referenceNumber}
                              </span>
                              <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-ink2">
                                {JOB_STATUS_LABEL[job.status]}
                              </span>
                              {job.isUrgent ? (
                                <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                                  Urgent
                                </span>
                              ) : null}
                            </span>
                            <span className="text-sm text-ink">
                              {job.patientName}
                              {job.retailerName ? ` · ${job.retailerName}` : ''}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              </>
            ) : (
              <article className="rounded-xl border border-line bg-white p-4">
                <h3 className="text-md font-semibold text-ink">Jobs</h3>
                <p className="mt-1 text-sm text-ink2">This account cannot open the job board.</p>
              </article>
            )}
          </div>
          <aside className="rounded-xl border border-line bg-white">
            <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h3 className="text-md font-semibold text-ink">Notifications</h3>
              {features.includes('notifications') ? (
                <Link href="/laboratory/notifications" className="text-sm font-medium text-action">
                  {unread > 0 ? `${unread} unread` : 'View all'}
                </Link>
              ) : null}
            </header>
            {features.includes('notifications') && notices ? (
              notices.length === 0 ? (
                <p className="px-4 py-6 text-sm text-ink2">
                  No notices yet. A shop assignment will show up here.
                </p>
              ) : (
                <ul>
                  {notices.slice(0, 6).map((notice) => (
                    <li key={notice.id} className="border-t border-line px-4 py-3 first:border-t-0">
                      <p
                        className={`text-sm ${notice.isRead ? 'text-ink2' : 'font-semibold text-ink'}`}
                      >
                        {notice.title}
                      </p>
                      <p className="text-sm text-ink2">{notice.body}</p>
                      <p className="mt-1 text-xs text-ink3">
                        {formatRelativeTime(notice.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="px-4 py-6 text-sm text-ink2">This account cannot open notifications.</p>
            )}
          </aside>
        </div>
      ) : null}
    </section>
  );
}
