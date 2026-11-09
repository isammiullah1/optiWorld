'use client';

import {
  JOB_STATUSES,
  labJobNeedsLabDecision,
  REOPEN_JOB_REASONS,
  type JobStatus,
  type LabConnection,
  type LabJobRow,
} from '@optiworld/shared';
import {
  Ban,
  ChevronDown,
  CircleCheck,
  Eye,
  Layers,
  Pencil,
  RotateCcw,
  Search,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';

import { formatShortDate } from './dashboard-format';
import {
  cancelRetailerLabJob,
  loadLabConnections,
  loadLabJobs,
  reopenRetailerLabJob,
  setLabJobCompletion,
} from './lab-api';
import { NewLabJobDialog } from './NewLabJobDialog';
import {
  ALL_STATUS_LOOK,
  JobStatusBadge,
  jobStatusActiveClass,
  jobStatusClass,
  jobStatusIcon,
  jobStatusLabel,
} from './LabJobStatus';
import { resolveBillLogoUrl, ShopMark } from './ShopMark';

const PAGE_SIZES = [10, 20, 30, 40] as const;
const SORTS = [
  { id: 'RECENT', label: 'Recent' },
  { id: 'PATIENT', label: 'Patient' },
  { id: 'REFERENCE', label: 'Reference' },
  { id: 'SUBMITTED', label: 'Submitted' },
] as const;

type SortId = (typeof SORTS)[number]['id'];
type Board = 'OPEN' | 'DONE';

type Filters = {
  q: string;
  status: JobStatus | 'ALL';
  labOrgId: string;
  from: string;
  to: string;
  sort: SortId;
};

const inputClass =
  'h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-action';

export function LabJobsList(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const presetLab = useSearchParams().get('lab') ?? '';
  const [draft, setDraft] = useState<Filters>({
    q: '',
    status: 'ALL',
    labOrgId: presetLab,
    from: '',
    to: '',
    sort: 'RECENT',
  });
  const [applied, setApplied] = useState<Filters>({
    q: '',
    status: 'ALL',
    labOrgId: presetLab,
    from: '',
    to: '',
    sort: 'RECENT',
  });
  const [board, setBoard] = useState<Board>('OPEN');
  const [pages, setPages] = useState<Record<Board, number>>({ OPEN: 1, DONE: 1 });
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [labs, setLabs] = useState<LabConnection[]>([]);
  const [lists, setLists] = useState<Record<Board, { rows: LabJobRow[]; total: number }>>({
    OPEN: { rows: [], total: 0 },
    DONE: { rows: [], total: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [confirmDoneId, setConfirmDoneId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [reopenId, setReopenId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadLabConnections(token)
      .then(setLabs)
      .catch(() => setLabs([]));
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    setLoading(true);
    const handle = window.setTimeout(() => {
      void Promise.all(
        (['OPEN', 'DONE'] as const).map((side) =>
          loadLabJobs(token, {
            q: applied.q,
            status: applied.status,
            labOrgId: applied.labOrgId || undefined,
            from: applied.from || undefined,
            to: applied.to || undefined,
            sort: applied.sort,
            board: side,
            page: pages[side],
            limit: pageSize,
          }).then((next) => ({ side, next })),
        ),
      )
        .then((loaded) => {
          if (!active) {
            return;
          }
          setLists((current) => {
            const next = { ...current };
            for (const item of loaded) {
              next[item.side] = { rows: item.next.rows, total: item.next.total };
            }
            return next;
          });
          setError(null);
        })
        .catch((caught: unknown) => {
          if (active) {
            setError(caught instanceof Error ? caught.message : 'Lab jobs could not be loaded');
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [applied, pages, pageSize, revision, token]);

  const visible = lists[board];
  const page = pages[board];
  const pageCount = Math.max(1, Math.ceil(visible.total / pageSize));
  const currentPage = Math.min(page, pageCount);

  useEffect(() => {
    if (!loading && page > pageCount) {
      setPages((current) => ({ ...current, [board]: pageCount }));
    }
  }, [board, loading, page, pageCount]);

  function chooseStatus(status: JobStatus | 'ALL'): void {
    setDraft((current) => ({ ...current, status }));
    setApplied((current) => ({ ...current, status }));
    setPages({ OPEN: 1, DONE: 1 });
    if (status === 'CANCELLED') {
      setBoard('DONE');
    }
  }

  async function markDone(jobId: string, done: boolean): Promise<void> {
    if (!token) {
      return;
    }
    setBusyId(jobId);
    setError(null);
    try {
      await setLabJobCompletion(token, jobId, done);
      setRevision((current) => current + 1);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The lab job could not be updated');
    } finally {
      setBusyId(null);
      setConfirmDoneId(null);
    }
  }

  async function reopenJob(jobId: string): Promise<void> {
    if (!token) {
      return;
    }
    const reason = reopenReason.trim();
    if (!reason) {
      setError('Write why this job is being reopened.');
      return;
    }
    setBusyId(jobId);
    setError(null);
    setNotice(null);
    try {
      const message = await reopenRetailerLabJob(token, jobId, reason);
      setReopenId(null);
      setReopenReason('');
      setNotice(message);
      setRevision((current) => current + 1);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The lab job could not be reopened');
    } finally {
      setBusyId(null);
    }
  }

  async function cancelJob(jobId: string): Promise<void> {
    if (!token) {
      return;
    }
    const reason = cancelReason.trim();
    if (!reason) {
      setError('Write a reason for cancelling this job.');
      return;
    }
    setBusyId(jobId);
    setError(null);
    setNotice(null);
    try {
      const result = await cancelRetailerLabJob(token, jobId, reason);
      setCancelId(null);
      setCancelReason('');
      setNotice(result.message);
      if (!result.message.startsWith('The request was sent')) {
        setBoard('DONE');
      }
      setRevision((current) => current + 1);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The lab job could not be cancelled');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Lab jobs</h1>
          <p className="text-sm text-ink2">Prescriptions this shop has sent to a laboratory.</p>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white"
          onClick={() => setCreating(true)}
        >
          New lab job
        </button>
      </div>
      {creating && token ? (
        <NewLabJobDialog
          token={token}
          labs={labs.filter((lab) => lab.status === 'APPROVED')}
          onClose={() => setCreating(false)}
          onCreated={(message) => {
            setCreating(false);
            setNotice(message);
            setBoard('OPEN');
            setPages({ OPEN: 1, DONE: 1 });
            setRevision((current) => current + 1);
          }}
        />
      ) : null}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Job status">
        <StatusChip
          active={applied.status === 'ALL'}
          label="All"
          onClick={() => chooseStatus('ALL')}
        />
        {JOB_STATUSES.filter((value) => value !== 'FITTING' && value !== 'QC').map((value) => (
          <StatusChip
            key={value}
            status={value}
            active={applied.status === value}
            label={jobStatusLabel(value)}
            onClick={() => chooseStatus(value)}
          />
        ))}
      </div>
      <form
        className="grid gap-3 rounded-xl border border-line bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied(draft);
          setPages({ OPEN: 1, DONE: 1 });
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-[240px] flex-1 gap-1 text-xs text-ink2">
            Search jobs
            <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3">
              <Search size={16} className="text-action" aria-hidden="true" />
              <input
                aria-label="Search jobs"
                value={draft.q}
                onChange={(event) => {
                  const q = event.target.value;
                  setDraft((current) => ({ ...current, q }));
                  setPages({ OPEN: 1, DONE: 1 });
                  setApplied((current) => ({ ...current, q }));
                }}
                placeholder="Reference, patient, or laboratory"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
              />
            </span>
          </label>
          <button
            type="submit"
            className="h-9 shrink-0 rounded-lg bg-action px-4 text-sm font-medium text-white"
          >
            Apply filters
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs text-ink2">
            Laboratory
            <select
              aria-label="Laboratory"
              value={draft.labOrgId}
              onChange={(event) =>
                setDraft((current) => ({ ...current, labOrgId: event.target.value }))
              }
              className={inputClass}
            >
              <option value="">All laboratories</option>
              {labs
                .filter((lab) => lab.status === 'APPROVED')
                .map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-ink2">
            From
            <input
              aria-label="From"
              type="date"
              value={draft.from}
              onChange={(event) =>
                setDraft((current) => ({ ...current, from: event.target.value }))
              }
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs text-ink2">
            To
            <input
              aria-label="To"
              type="date"
              value={draft.to}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs text-ink2">
            Sort
            <select
              aria-label="Sort lab jobs"
              value={draft.sort}
              onChange={(event) =>
                setDraft((current) => ({ ...current, sort: event.target.value as SortId }))
              }
              className={inputClass}
            >
              {SORTS.map((sort) => (
                <option key={sort.id} value={sort.id}>
                  {sort.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </form>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg bg-teal-soft px-3 py-2 text-sm text-teal">
          {notice}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2" role="tablist" aria-label="Lab job boards">
        <BoardTab
          active={board === 'OPEN'}
          label="In process"
          detail="Jobs still open with the laboratory"
          count={lists.OPEN.total}
          icon={<Layers size={18} aria-hidden="true" />}
          tone="border-action bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-blue)_22%,white)_0%,white_50%,var(--ow-blue-soft)_100%)]"
          onClick={() => setBoard('OPEN')}
        />
        <BoardTab
          active={board === 'DONE'}
          label="Completed"
          detail="Jobs marked done"
          count={lists.DONE.total}
          icon={<CircleCheck size={18} aria-hidden="true" />}
          tone="border-teal bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-teal)_18%,white)_0%,white_52%,var(--ow-teal-soft)_100%)]"
          onClick={() => setBoard('DONE')}
        />
      </div>
      {loading ? (
        <div
          className="h-40 animate-pulse rounded-xl border border-line bg-white"
          aria-busy="true"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          {visible.rows.length === 0 ? (
            <div className="p-6">
              <h2 className="text-md font-semibold text-ink">
                {board === 'OPEN' ? 'No jobs in process' : 'No completed jobs'}
              </h2>
              <p className="mt-1 text-sm text-ink2">
                {board === 'OPEN'
                  ? 'Jobs attached from POS billing show here until they are marked done.'
                  : 'Mark a job done from the in-process list and it will stay here.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-left">
                <thead>
                  <tr className="bg-navy text-left">
                    {[
                      'Reference',
                      'Patient',
                      'Laboratory',
                      'Status',
                      'Submitted',
                      'Updated',
                      'Actions',
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-white"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.rows.map((row) => (
                    <Fragment key={row.id}>
                      <tr className="border-b border-line last:border-0 hover:bg-canvas">
                        <td className="px-3 py-3 text-sm font-semibold">
                          <Link href={`/retailer/lab-jobs/${row.id}`} className="text-action">
                            {row.referenceNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-3 text-sm font-medium">
                          <Link href={`/retailer/lab-jobs/${row.id}`} className="text-ink">
                            {row.patientName}
                          </Link>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-2">
                            <ShopMark
                              name={row.labName}
                              logoUrl={resolveBillLogoUrl(row.labLogoUrl)}
                              size="sm"
                            />
                            <span className="text-sm text-ink">{row.labName}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <JobStatusBadge status={row.status} />
                        </td>
                        <td className="px-3 py-3 text-sm text-ink2">
                          {formatShortDate(row.createdAt)}
                        </td>
                        <td className="px-3 py-3 text-sm text-ink2">
                          {formatShortDate(row.updatedAt)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <Link
                              href={`/retailer/lab-jobs/${row.id}`}
                              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-medium text-action"
                            >
                              <Eye size={14} aria-hidden="true" />
                              View
                            </Link>
                            {row.status !== 'CANCELLED' &&
                            row.status !== 'DISPATCHED' &&
                            !labJobNeedsLabDecision(row.status) &&
                            (row.status === 'OUTSOURCED' || !row.completedAt) ? (
                              <Link
                                href={`/retailer/lab-jobs/${row.id}`}
                                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ink2"
                              >
                                <Pencil size={14} aria-hidden="true" />
                                Edit
                              </Link>
                            ) : null}
                            {row.status === 'DISPATCHED' ? (
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => {
                                  setCancelId(null);
                                  setConfirmDoneId(null);
                                  setReopenReason('');
                                  setReopenId(row.id);
                                }}
                                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ink2 disabled:text-ink3"
                              >
                                <RotateCcw size={14} aria-hidden="true" />
                                Reopen
                              </button>
                            ) : null}
                            {board === 'OPEN' ? (
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => {
                                  if (row.status === 'DISPATCHED') {
                                    void markDone(row.id, true);
                                    return;
                                  }
                                  setCancelId(null);
                                  setReopenId(null);
                                  setConfirmDoneId(row.id);
                                }}
                                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-teal disabled:text-ink3"
                              >
                                <CircleCheck size={14} aria-hidden="true" />
                                {busyId === row.id ? 'Saving…' : 'Mark done'}
                              </button>
                            ) : row.status === 'CANCELLED' || row.status === 'DISPATCHED' ? null : (
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => {
                                  void markDone(row.id, false);
                                }}
                                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-ink2 disabled:text-ink3"
                              >
                                <RotateCcw size={14} aria-hidden="true" />
                                {busyId === row.id ? 'Saving…' : 'Reopen'}
                              </button>
                            )}
                            {row.status !== 'CANCELLED' && row.status !== 'DISPATCHED' ? (
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => {
                                  setConfirmDoneId(null);
                                  setReopenId(null);
                                  setCancelReason('');
                                  setCancelId(row.id);
                                }}
                                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-danger disabled:text-ink3"
                              >
                                <Ban size={14} aria-hidden="true" />
                                {labJobNeedsLabDecision(row.status)
                                  ? 'Request cancellation'
                                  : 'Cancel'}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {confirmDoneId === row.id ? (
                        <tr className="border-b border-amber-soft bg-amber-soft">
                          <td colSpan={7} className="px-3 py-3">
                            <p className="text-sm text-ink">
                              {row.referenceNumber} is still {jobStatusLabel(row.status)}. Mark it
                              done before the laboratory dispatches it?
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => setConfirmDoneId(null)}
                                className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm text-ink2"
                              >
                                Keep open
                              </button>
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => {
                                  void markDone(row.id, true);
                                }}
                                className="min-h-11 rounded-lg bg-teal px-4 text-sm font-medium text-white disabled:opacity-60"
                              >
                                {busyId === row.id ? 'Saving…' : 'Mark done'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {reopenId === row.id ? (
                        <tr className="border-b border-action-soft bg-action-soft">
                          <td colSpan={7} className="px-3 py-3">
                            <p className="text-sm text-ink">
                              Reopen {row.referenceNumber}? Write why it is coming back. The note
                              stays on the job history.
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {REOPEN_JOB_REASONS.map((suggestion) => (
                                <button
                                  key={suggestion}
                                  type="button"
                                  aria-pressed={reopenReason === suggestion}
                                  onClick={() => setReopenReason(suggestion)}
                                  className={`min-h-11 rounded-full border px-3 text-xs ${reopenReason === suggestion ? 'border-action bg-white text-action' : 'border-line bg-white text-ink2'}`}
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                            <label className="mt-2 grid gap-1 text-xs text-ink2">
                              Reason
                              <textarea
                                aria-label={`Reason for reopening ${row.referenceNumber}`}
                                value={reopenReason}
                                placeholder="Write why this job is being reopened"
                                onChange={(event) => setReopenReason(event.target.value)}
                                rows={2}
                                maxLength={500}
                                className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
                              />
                            </label>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => setReopenId(null)}
                                className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm text-ink2"
                              >
                                Keep dispatched
                              </button>
                              <button
                                type="button"
                                disabled={busyId === row.id || reopenReason.trim().length === 0}
                                onClick={() => {
                                  void reopenJob(row.id);
                                }}
                                className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
                              >
                                {busyId === row.id ? 'Saving…' : 'Reopen job'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {cancelId === row.id ? (
                        <tr className="border-b border-danger-soft bg-danger-soft">
                          <td colSpan={7} className="px-3 py-3">
                            <p className="text-sm text-ink">
                              {labJobNeedsLabDecision(row.status)
                                ? `Ask the laboratory to cancel ${row.referenceNumber}? The job stays as it is until they accept or reject it.`
                                : `Cancel ${row.referenceNumber}? The laboratory can see the reason.`}
                            </p>
                            <label className="mt-2 grid gap-1 text-xs text-ink2">
                              Reason
                              <textarea
                                aria-label={`Reason for cancelling ${row.referenceNumber}`}
                                value={cancelReason}
                                onChange={(event) => setCancelReason(event.target.value)}
                                rows={2}
                                className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
                              />
                            </label>
                            <div className="mt-2 flex gap-2">
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => setCancelId(null)}
                                className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm text-ink2"
                              >
                                Keep job
                              </button>
                              <button
                                type="button"
                                disabled={busyId === row.id}
                                onClick={() => {
                                  void cancelJob(row.id);
                                }}
                                className="min-h-11 rounded-lg bg-danger px-4 text-sm font-medium text-white disabled:opacity-60"
                              >
                                {busyId === row.id
                                  ? 'Saving…'
                                  : labJobNeedsLabDecision(row.status)
                                    ? 'Send request'
                                    : 'Cancel job'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink2">
            <p>
              {visible.rows.length} of {visible.total}
            </p>
            <label className="inline-flex items-center gap-2">
              Show
              <select
                aria-label="Jobs per page"
                value={pageSize}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (next === 10 || next === 20 || next === 30 || next === 40) {
                    setPageSize(next);
                    setPages({ OPEN: 1, DONE: 1 });
                  }
                }}
                className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink"
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPages((current) => ({ ...current, [board]: currentPage - 1 }))}
                className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= pageCount}
                onClick={() => setPages((current) => ({ ...current, [board]: currentPage + 1 }))}
                className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BoardTab({
  active,
  label,
  detail,
  count,
  icon,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  detail: string;
  count: number;
  icon: React.ReactNode;
  tone: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-[88px] items-center gap-3 rounded-xl border-2 p-4 text-left ${active ? tone : 'border-line bg-white'}`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${active ? 'bg-white text-ink' : 'bg-canvas text-ink2'}`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-md font-semibold text-ink">
          {label}
          <span className="rounded-full bg-white px-2 text-sm font-medium text-ink2">{count}</span>
        </span>
        <span className="block text-sm text-ink2">{detail}</span>
      </span>
      <ChevronDown
        size={18}
        className={active ? 'shrink-0 text-ink' : 'shrink-0 -rotate-90 text-ink3'}
        aria-hidden="true"
      />
    </button>
  );
}

function StatusChip({
  active,
  label,
  status,
  onClick,
}: {
  active: boolean;
  label: string;
  status?: JobStatus;
  onClick: () => void;
}): React.ReactElement {
  const Icon = status ? jobStatusIcon(status) : Layers;
  const tone = status
    ? active
      ? jobStatusActiveClass(status)
      : jobStatusClass(status)
    : active
      ? ALL_STATUS_LOOK.active
      : ALL_STATUS_LOOK.idle;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-base font-medium ${tone}`}
    >
      <Icon size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
