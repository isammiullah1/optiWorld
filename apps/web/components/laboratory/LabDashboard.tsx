'use client';

import {
  JOB_STATUS_LABEL,
  type LabBill,
  type LabClientRow,
  type LabFeature,
  type LabKanbanCard,
  type RetailerAlert,
} from '@optiworld/shared';
import { Plus } from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { formatRelativeTime } from '@/components/retailer/dashboard-format';

import { AddLabJobDialog } from './AddLabJobDialog';
import { JOB_STAGE_LOOK } from './job-stage-look';
import { loadLabProfile } from './lab-account-api';
import { loadLabBoard, loadLabClients } from './lab-api';
import { loadLabNotifications } from './lab-notifications-api';
import { WalkInInvoice } from './WalkInInvoice';

export function LabDashboard(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [labName, setLabName] = useState('');
  const [features, setFeatures] = useState<LabFeature[] | null>(null);
  const [jobs, setJobs] = useState<LabKanbanCard[] | null>(null);
  const [notices, setNotices] = useState<RetailerAlert[] | null>(null);
  const [clients, setClients] = useState<LabClientRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [invoice, setInvoice] = useState<LabBill | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
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
        const canJobs = profile.features.includes('jobs');
        const [board, notes, nextClients] = await Promise.all([
          canJobs ? loadLabBoard(token, {}) : Promise.resolve(null),
          profile.features.includes('notifications')
            ? loadLabNotifications(token)
            : Promise.resolve(null),
          canJobs ? loadLabClients(token) : Promise.resolve([]),
        ]);
        if (!active) {
          return;
        }
        setJobs(board?.jobs ?? null);
        setNotices(notes);
        setClients(nextClients);
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
  }, [token, refreshKey]);

  const activeJobs = (jobs ?? [])
    .filter((job) => job.status !== 'DISPATCHED' && job.status !== 'CANCELLED')
    .slice(0, 8);
  const unread = notices?.filter((notice) => !notice.isRead).length ?? 0;
  const canAdd = Boolean(token) && features?.includes('jobs') === true;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">{labName || 'Laboratory'}</h2>
          <p className="text-sm text-ink2">Jobs in progress and notices from connected shops.</p>
        </div>
        {canAdd && token ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white"
            onClick={() => setAdding(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Add New Job
          </button>
        ) : null}
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
                  {JOB_STAGE_LOOK.map((stage) => {
                    const count = jobs.filter((job) => stage.match(job.status)).length;
                    const Icon = stage.icon;
                    return (
                      <Link
                        key={stage.id}
                        href="/laboratory/jobs"
                        className={`flex items-center gap-3 rounded-xl border-2 px-3 py-3 ${stage.tone}`}
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white">
                          <Icon className="h-6 w-6" aria-hidden />
                        </span>
                        <span>
                          <p className="text-xs font-medium uppercase tracking-wide">
                            {stage.label}
                          </p>
                          <p className="mt-1 text-2xl font-semibold text-ink">{count}</p>
                        </span>
                      </Link>
                    );
                  })}
                </div>
                <article className="overflow-hidden rounded-xl border-2 border-action bg-white">
                  <header className="flex items-center justify-between gap-3 bg-action px-4 py-3 text-white">
                    <h3 className="text-md font-semibold">Active jobs</h3>
                    <Link
                      href="/laboratory/jobs"
                      className="text-sm font-medium text-white underline"
                    >
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
                              <span
                                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                                  JOB_STAGE_LOOK.find((stage) => stage.match(job.status))?.tone ??
                                  'border-line bg-canvas text-ink2'
                                }`}
                              >
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
          <aside className="overflow-hidden rounded-xl border-2 border-navy bg-white">
            <header className="flex items-center justify-between gap-3 bg-navy px-4 py-3 text-white">
              <h3 className="text-md font-semibold">Notifications</h3>
              {features.includes('notifications') ? (
                <Link
                  href="/laboratory/notifications"
                  className="text-sm font-medium text-white underline"
                >
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
                <>
                  <div className="flex flex-wrap gap-2 px-3 py-3">
                    {noticeCounts(notices).map((item) => (
                      <span
                        key={item.label}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${item.row}`}
                      >
                        {item.label} {item.count}
                      </span>
                    ))}
                  </div>
                  <ul>
                    {notices.slice(0, 6).map((notice) => {
                      const tone = noticeTone(notice);
                      return (
                        <li key={notice.id} className={`border-l-4 border-t px-4 py-3 ${tone.row}`}>
                          <p className="text-xs font-medium uppercase tracking-wide">
                            {tone.label}
                          </p>
                          <p
                            className={`text-sm text-ink ${notice.isRead ? 'font-medium' : 'font-semibold'}`}
                          >
                            {notice.title}
                          </p>
                          <p className="text-sm text-ink2">{notice.body}</p>
                          <p className="mt-1 text-xs text-ink3">
                            {formatRelativeTime(notice.createdAt)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )
            ) : (
              <p className="px-4 py-6 text-sm text-ink2">This account cannot open notifications.</p>
            )}
          </aside>
        </div>
      ) : null}
      {adding && token ? (
        <AddLabJobDialog
          token={token}
          clients={clients}
          initialClientId=""
          onClose={() => setAdding(false)}
          onCreated={(_reference, createdInvoice) => {
            setAdding(false);
            setInvoice(createdInvoice);
            setRefreshKey((current) => current + 1);
          }}
        />
      ) : null}
      {invoice && token ? (
        <WalkInInvoice token={token} bill={invoice} onClose={() => setInvoice(null)} />
      ) : null}
    </section>
  );
}

const NOTICE_TONES = {
  JOBS: { label: 'New jobs', row: 'border-action bg-action-soft text-action' },
  REQUESTS: { label: 'Shop requests', row: 'border-danger bg-danger-soft text-danger' },
  UPDATES: { label: 'Job updates', row: 'border-teal bg-teal-soft text-teal' },
  CONNECTIONS: { label: 'Connections', row: 'border-navy bg-[var(--ow-navy-soft)] text-navy' },
  STOCK: { label: 'Low stock', row: 'border-amber bg-amber-soft text-amber' },
} as const;

function noticeCounts(
  notices: readonly RetailerAlert[],
): Array<{ label: string; row: string; count: number }> {
  const totals = new Map<string, { label: string; row: string; count: number }>();
  for (const notice of notices) {
    const tone = noticeTone(notice);
    const current = totals.get(tone.label) ?? { label: tone.label, row: tone.row, count: 0 };
    current.count += 1;
    totals.set(tone.label, current);
  }
  return [...totals.values()];
}

function noticeTone(alert: RetailerAlert): { label: string; row: string } {
  if (alert.type === 'LOW_STOCK') {
    return NOTICE_TONES.STOCK;
  }
  if (alert.type === 'CONNECTION_REQUEST') {
    return NOTICE_TONES.CONNECTIONS;
  }
  if (alert.title === 'New job assigned') {
    return NOTICE_TONES.JOBS;
  }
  if (/request/i.test(alert.title)) {
    return NOTICE_TONES.REQUESTS;
  }
  return NOTICE_TONES.UPDATES;
}
