'use client';

import {
  JOB_STATUS_LABEL,
  NEXT_LAB_STATUS,
  productTagLabel,
  REOPEN_JOB_REASONS,
  type JobStatus,
  type LabBill,
  type LabBoard,
  type LabClientRow,
  type LabKanbanCard,
} from '@optiworld/shared';
import { ArrowRight, Check, Plus, X } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { resolveBillLogoUrl, ShopMark } from '@/components/retailer/ShopMark';

import { JOB_STAGE_LOOK } from './job-stage-look';
import { labServiceLook } from './service-look';
import { WalkInInvoice } from './WalkInInvoice';
import { AddLabJobDialog } from './AddLabJobDialog';
import { JobDetailPanel, REJECT_JOB_MESSAGES } from './JobDetailPanel';
import {
  cancelLabBoardJob,
  reopenLabJob,
  loadLabClients,
  loadLabBoard,
  loadLabBoardJob,
  notifyLabRetailer,
  acceptLabBoardJob,
  rejectLabBoardJob,
  remindLabMaterial,
  updateLabBoardNotes,
  updateLabBoardPrescription,
  respondToLabShopRequest,
  updateLabBoardStatus,
  updateLabBoardUrgent,
} from './lab-api';

const COLUMN_ACCEPTS: Record<string, (status: JobStatus) => boolean> = {
  SUBMITTED: (status) => status === 'SUBMITTED',
  CONFIRMED: (status) => status === 'CONFIRMED',
  RECEIVED: (status) => status === 'RECEIVED',
  PROCESSING: (status) => status === 'CUTTING',
  READY: (status) => status === 'READY',
  DISPATCHED: (status) => status === 'DISPATCHED',
};

const COLUMNS = JOB_STAGE_LOOK.map((stage) => ({
  ...stage,
  accepts: COLUMN_ACCEPTS[stage.id] ?? (() => false),
}));

const DISPATCHED_PREVIEW = 5;

const CANCEL_REASONS = [
  'Customer cancelled the order',
  'Prescription needs to be remade',
  'Frame or lens is not available',
] as const;

const NEXT = NEXT_LAB_STATUS;

type MenuState = { job: LabKanbanCard; x: number; y: number };
type NotePrompt = {
  jobId: string;
  reference: string;
  from: JobStatus;
  note: string;
};
type CompletePrompt = { jobId: string; reference: string };
type CancelPrompt = { jobId: string; reference: string; reason: string };
type RejectPrompt = { jobId: string; reference: string; reason: string };
type ReopenPrompt = { jobId: string; reference: string; reason: string };

function stageLabel(status: JobStatus): string {
  if (status === 'CANCELLED') {
    return 'Cancelled';
  }
  return JOB_STATUS_LABEL[status];
}

export function JobKanban({
  initialClientId,
  initialJobId,
}: {
  initialClientId?: string;
  initialJobId?: string;
}): React.ReactElement {
  const { data: session, status } = useSession();
  const token = session?.accessToken;
  const [board, setBoard] = useState<LabBoard | null>(null);
  const [query, setQuery] = useState('');
  const [retailerOrgId, setRetailerOrgId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobId ?? null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof loadLabBoardJob>> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [adding, setAdding] = useState(false);
  const [clients, setClients] = useState<LabClientRow[]>([]);
  const [notePrompt, setNotePrompt] = useState<NotePrompt | null>(null);
  const [completePrompt, setCompletePrompt] = useState<CompletePrompt | null>(null);
  const [cancelPrompt, setCancelPrompt] = useState<CancelPrompt | null>(null);
  const [rejectPrompt, setRejectPrompt] = useState<RejectPrompt | null>(null);
  const [reopenPrompt, setReopenPrompt] = useState<ReopenPrompt | null>(null);
  const [showAllDispatched, setShowAllDispatched] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [showAllRejected, setShowAllRejected] = useState(false);
  const [showAllCancelled, setShowAllCancelled] = useState(false);
  const [invoice, setInvoice] = useState<LabBill | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    setLoading(true);
    try {
      const next = await loadLabBoard(token, {
        q: query.trim() || undefined,
        retailerOrgId: retailerOrgId || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setBoard(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Jobs could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [token, query, retailerOrgId, from, to]);

  useEffect(() => {
    if (status === 'loading') {
      return;
    }
    void refresh();
  }, [refresh, status]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadLabClients(token)
      .then(setClients)
      .catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (!token || !selectedId) {
      setDetail(null);
      return;
    }
    let active = true;
    void loadLabBoardJob(token, selectedId)
      .then((job) => {
        if (active) {
          setDetail(job);
          setNotice(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Job detail could not be loaded');
        }
      });
    return () => {
      active = false;
    };
  }, [token, selectedId]);

  async function moveJob(job: {
    id: string;
    referenceNumber: string;
    status: JobStatus;
  }): Promise<void> {
    const next = NEXT[job.status];
    if (!token || !next) {
      return;
    }
    setMenu(null);
    if (next === 'DISPATCHED') {
      setCompletePrompt({ jobId: job.id, reference: productTagLabel(job.referenceNumber) });
      return;
    }
    setBusy(true);
    try {
      const updated = await updateLabBoardStatus(token, job.id, next);
      if (selectedId === job.id) {
        setDetail(updated);
      }
      setError(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The stage could not be updated');
    } finally {
      setBusy(false);
    }
  }

  async function confirmComplete(): Promise<void> {
    if (!token || !completePrompt) {
      return;
    }
    setBusy(true);
    try {
      const updated = await updateLabBoardStatus(token, completePrompt.jobId, 'DISPATCHED');
      if (selectedId === completePrompt.jobId) {
        setDetail(updated);
      }
      setCompletePrompt(null);
      setError(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The job could not be completed');
    } finally {
      setBusy(false);
    }
  }

  async function confirmCancel(): Promise<void> {
    if (!token || !cancelPrompt) {
      return;
    }
    const reason = cancelPrompt.reason.trim();
    if (!reason) {
      setError('Write a reason for cancelling this job.');
      return;
    }
    setBusy(true);
    try {
      const updated = await cancelLabBoardJob(token, cancelPrompt.jobId, reason);
      if (selectedId === cancelPrompt.jobId) {
        setDetail(updated);
      }
      setCancelPrompt(null);
      setNotice('Job cancelled.');
      setError(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The job could not be cancelled');
    } finally {
      setBusy(false);
    }
  }

  function askReject(job: { id: string; referenceNumber: string }, reason = ''): void {
    setMenu(null);
    setRejectPrompt({
      jobId: job.id,
      reference: productTagLabel(job.referenceNumber),
      reason,
    });
  }

  async function confirmReject(): Promise<void> {
    if (!token || !rejectPrompt) {
      return;
    }
    const reason = rejectPrompt.reason.trim();
    if (!reason) {
      setError('Choose a message or write one.');
      return;
    }
    setBusy(true);
    try {
      const result = await rejectLabBoardJob(token, rejectPrompt.jobId, reason);
      if (selectedId === rejectPrompt.jobId) {
        setDetail(await loadLabBoardJob(token, rejectPrompt.jobId));
      }
      setRejectPrompt(null);
      setNotice(result.message);
      setError(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The job could not be rejected');
    } finally {
      setBusy(false);
    }
  }

  async function acceptJob(jobId: string): Promise<void> {
    if (!token) {
      return;
    }
    setMenu(null);
    setBusy(true);
    try {
      const saved = await acceptLabBoardJob(token, jobId);
      if (selectedId === jobId) {
        setDetail(saved);
      }
      setNotice('The job was accepted. Mark it received when the material arrives.');
      setError(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The job could not be accepted');
    } finally {
      setBusy(false);
    }
  }

  function askCancel(job: { id: string; referenceNumber: string }): void {
    setMenu(null);
    setCancelPrompt({ jobId: job.id, reference: productTagLabel(job.referenceNumber), reason: '' });
  }

  function askReopen(job: { id: string; referenceNumber: string }): void {
    setMenu(null);
    setReopenPrompt({ jobId: job.id, reference: productTagLabel(job.referenceNumber), reason: '' });
  }

  async function confirmReopen(): Promise<void> {
    if (!token || !reopenPrompt) {
      return;
    }
    const reason = reopenPrompt.reason.trim();
    if (!reason) {
      setError('Write why this job is being reopened.');
      return;
    }
    setBusy(true);
    try {
      const message = await reopenLabJob(token, reopenPrompt.jobId, reason);
      if (selectedId === reopenPrompt.jobId) {
        setDetail(await loadLabBoardJob(token, reopenPrompt.jobId));
      }
      setReopenPrompt(null);
      setNotice(message);
      setError(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The job could not be reopened');
    } finally {
      setBusy(false);
    }
  }

  async function saveNote(): Promise<void> {
    if (!token || !notePrompt) {
      return;
    }
    setBusy(true);
    try {
      await updateLabBoardNotes(token, notePrompt.jobId, notePrompt.note);
      if (selectedId === notePrompt.jobId) {
        setDetail(await loadLabBoardJob(token, notePrompt.jobId));
      }
      setNotePrompt(null);
      setError(null);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The note could not be saved');
    } finally {
      setBusy(false);
    }
  }

  function renderJob(job: LabKanbanCard, closed = false): React.ReactElement {
    return (
      <JobCard
        key={job.id}
        job={job}
        closed={closed}
        open={openCardId === job.id}
        onToggle={() => setOpenCardId((current) => (current === job.id ? null : job.id))}
        onOpen={() => setSelectedId(job.id)}
        onMenu={(x, y) => setMenu({ job, x, y })}
        onMove={() => {
          void moveJob(job);
        }}
        onAccept={() => {
          void acceptJob(job.id);
        }}
        onReject={() => askReject(job)}
        onNote={() =>
          setNotePrompt({
            jobId: job.id,
            reference: productTagLabel(job.referenceNumber),
            from: job.status,
            note: job.stageNote ?? '',
          })
        }
        onCancel={() => askCancel(job)}
        onReopen={() => askReopen(job)}
      />
    );
  }

  const rejectedJobs = (board?.jobs ?? []).filter((job) => job.status === 'REJECTED');
  const cancelledJobs = (board?.jobs ?? []).filter((job) => job.status === 'CANCELLED');

  return (
    <section className="grid gap-3" onClick={() => setMenu(null)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink2">
          Accept a submitted job from its card, or move a job on to the next stage.
        </p>
        <button
          type="button"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-action px-4 text-sm font-semibold text-white"
          onClick={() => setAdding(true)}
        >
          <Plus size={16} aria-hidden="true" />
          Add New Job
        </button>
      </div>
      <form
        className="grid gap-2 rounded-xl border-2 border-action bg-action-soft p-3 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          void refresh();
        }}
      >
        <label className="grid gap-1 text-xs text-ink2">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Patient, reference, retailer"
            className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-action focus:outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs text-ink2">
          Retailer
          <select
            value={retailerOrgId}
            onChange={(event) => setRetailerOrgId(event.target.value)}
            className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink focus:border-action focus:outline-none"
          >
            <option value="">All retailers</option>
            {(board?.retailers ?? []).map((retailer) => (
              <option key={retailer.id} value={retailer.id}>
                {retailer.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-ink2">
          From
          <input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>
        <label className="grid gap-1 text-xs text-ink2">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm"
          />
        </label>
        <div className="flex flex-wrap items-end justify-between gap-3 md:col-span-4">
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white"
          >
            Apply filters
          </button>
          <ul
            className="ml-auto flex flex-wrap justify-end gap-x-3 gap-y-1"
            aria-label="Service marks"
          >
            {SERVICE_MARKS.map((mark) => (
              <li key={mark.label} className="inline-flex items-center gap-1 text-xs text-ink2">
                <ServiceMark name={mark.sample} />
                {mark.label}
              </li>
            ))}
          </ul>
        </div>
      </form>
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}
      {loading && !board ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {COLUMNS.map((column) => (
            <div
              key={column.id}
              className="h-40 animate-pulse rounded-xl border border-line bg-white"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {COLUMNS.map((column) => {
              const jobs = (board?.jobs ?? []).filter((job) => column.match(job.status));
              const Icon = column.icon;
              return (
                <section
                  key={column.id}
                  className={`min-w-0 overflow-hidden rounded-xl border-2 ${column.tone}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const jobId = event.dataTransfer.getData('text/plain');
                    const current = (board?.jobs ?? []).find((job) => job.id === jobId);
                    if (
                      !current ||
                      current.status === 'DISPATCHED' ||
                      current.status === 'CANCELLED' ||
                      current.status === 'REJECTED'
                    ) {
                      return;
                    }
                    const next = NEXT[current.status];
                    if (!next || !column.accepts(next)) {
                      setError(
                        next
                          ? `This job must move to ${stageLabel(next)} next.`
                          : current.status === 'SUBMITTED'
                            ? 'Accept or reject this job first.'
                            : 'This job is completed.',
                      );
                      return;
                    }
                    void moveJob(current);
                  }}
                >
                  <header className="flex items-center gap-2 px-3 py-2">
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    <h2 className="text-sm font-medium">{column.label}</h2>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-ink">
                      {jobs.length}
                    </span>
                  </header>
                  <div className="grid min-h-24 gap-2 bg-white/70 p-2">
                    {jobs.length === 0 ? (
                      <p className="px-1 py-3 text-xs text-ink3">No jobs</p>
                    ) : null}
                    {(column.id === 'DISPATCHED'
                      ? showAllDispatched
                        ? jobs
                        : jobs.slice(0, DISPATCHED_PREVIEW)
                      : jobs
                    ).map((job) => renderJob(job))}
                    {column.id === 'DISPATCHED' && jobs.length > DISPATCHED_PREVIEW ? (
                      <button
                        type="button"
                        className="min-h-11 rounded-lg px-3 text-sm font-medium text-action"
                        onClick={() => setShowAllDispatched((current) => !current)}
                      >
                        {showAllDispatched
                          ? 'See less'
                          : `See more (${jobs.length - DISPATCHED_PREVIEW})`}
                      </button>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
          <section className="grid gap-3">
            <div>
              <h2 className="text-md font-semibold text-ink">Closed jobs</h2>
              <p className="text-sm text-ink2">
                Rejected and cancelled jobs stay here. Neither can be reopened.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ClosedColumn
                title="Rejected"
                header="border-danger bg-danger-soft text-danger"
                jobs={rejectedJobs}
                expanded={showAllRejected}
                onToggle={() => setShowAllRejected((current) => !current)}
                renderJob={renderJob}
              />
              <ClosedColumn
                title="Cancelled"
                header="border-ink2 bg-canvas text-ink2"
                jobs={cancelledJobs}
                expanded={showAllCancelled}
                onToggle={() => setShowAllCancelled((current) => !current)}
                renderJob={renderJob}
              />
            </div>
          </section>
        </>
      )}
      {menu ? (
        <div
          role="menu"
          className="fixed z-50 w-48 rounded-lg border border-line bg-white py-1 text-sm"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            type="button"
            role="menuitem"
            className="block min-h-11 w-full px-3 text-left hover:bg-canvas disabled:text-ink3"
            disabled={!NEXT[menu.job.status]}
            onClick={() => {
              void moveJob(menu.job);
            }}
          >
            {NEXT[menu.job.status]
              ? `Move to ${stageLabel(NEXT[menu.job.status] as JobStatus)}`
              : menu.job.status === 'SUBMITTED'
                ? 'Waiting for a decision'
                : 'Completed'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="block min-h-11 w-full px-3 text-left hover:bg-canvas"
            onClick={() => {
              if (!token) {
                return;
              }
              setMenu(null);
              void updateLabBoardUrgent(token, menu.job.id, !menu.job.isUrgent).then(() =>
                refresh(),
              );
            }}
          >
            {menu.job.isUrgent ? 'Clear urgent' : 'Flag urgent'}
          </button>
          {menu.job.status === 'CANCELLED' || menu.job.status === 'REJECTED' ? null : (
            <button
              type="button"
              role="menuitem"
              className="block min-h-11 w-full px-3 text-left text-danger hover:bg-canvas"
              onClick={() => askCancel(menu.job)}
            >
              Cancel job
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="block min-h-11 w-full px-3 text-left hover:bg-canvas"
            onClick={() => {
              setSelectedId(menu.job.id);
              setMenu(null);
            }}
          >
            View detail
          </button>
        </div>
      ) : null}
      {detail ? (
        <JobDetailPanel
          key={detail.id + detail.updatedAt}
          job={detail}
          busy={busy}
          notice={notice}
          onClose={() => setSelectedId(null)}
          onAdvance={() => {
            void moveJob(detail);
          }}
          onUrgent={(isUrgent) => {
            if (!token) {
              return;
            }
            setBusy(true);
            void updateLabBoardUrgent(token, detail.id, isUrgent)
              .then(async () => {
                setDetail(await loadLabBoardJob(token, detail.id));
                await refresh();
              })
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error ? caught.message : 'Urgent flag could not be saved',
                ),
              )
              .finally(() => setBusy(false));
          }}
          onNotes={(notes) => {
            if (!token) {
              return;
            }
            setBusy(true);
            void updateLabBoardNotes(token, detail.id, notes)
              .then(async () => {
                setDetail(await loadLabBoardJob(token, detail.id));
                setNotice('Notes saved.');
              })
              .catch((caught: unknown) =>
                setError(caught instanceof Error ? caught.message : 'Notes could not be saved'),
              )
              .finally(() => setBusy(false));
          }}
          onSavePrescription={(prescription) => {
            if (!token) {
              return;
            }
            setBusy(true);
            void updateLabBoardPrescription(token, detail.id, prescription)
              .then(async (saved) => {
                setDetail(saved);
                setNotice('Prescription saved.');
                await refresh();
              })
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error ? caught.message : 'The prescription could not be saved',
                ),
              )
              .finally(() => setBusy(false));
          }}
          onNotify={() => {
            if (!token) {
              return;
            }
            setBusy(true);
            void notifyLabRetailer(token, detail.id)
              .then((result) => setNotice(result.message))
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error ? caught.message : 'The notification could not be sent',
                ),
              )
              .finally(() => setBusy(false));
          }}
          onCancel={() => askCancel(detail)}
          onReopen={() => askReopen(detail)}
          onAccept={() => {
            void acceptJob(detail.id);
          }}
          onReject={(reason) => askReject(detail, reason)}
          onRespond={(action) => {
            if (!token) {
              return;
            }
            setBusy(true);
            void respondToLabShopRequest(token, detail.id, action)
              .then(async (saved) => {
                setDetail(saved);
                setNotice(
                  action === 'ACCEPT'
                    ? 'The shop request was accepted.'
                    : 'The current job was kept.',
                );
                await refresh();
              })
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error ? caught.message : 'The request could not be answered',
                ),
              )
              .finally(() => setBusy(false));
          }}
          onRemind={() => {
            if (!token) {
              return;
            }
            setBusy(true);
            void remindLabMaterial(token, detail.id)
              .then((result) => setNotice(result.message))
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error ? caught.message : 'The reminder could not be sent',
                ),
              )
              .finally(() => setBusy(false));
          }}
        />
      ) : null}
      {notePrompt ? (
        <NoteDialog
          prompt={notePrompt}
          busy={busy}
          onChange={(note) => setNotePrompt({ ...notePrompt, note })}
          onClose={() => {
            if (!busy) {
              setNotePrompt(null);
            }
          }}
          onConfirm={() => {
            void saveNote();
          }}
        />
      ) : null}
      {completePrompt ? (
        <CompleteDialog
          prompt={completePrompt}
          busy={busy}
          onClose={() => {
            if (!busy) {
              setCompletePrompt(null);
            }
          }}
          onConfirm={() => {
            void confirmComplete();
          }}
        />
      ) : null}
      {reopenPrompt ? (
        <ReopenDialog
          prompt={reopenPrompt}
          busy={busy}
          onChange={(reason) => setReopenPrompt({ ...reopenPrompt, reason })}
          onClose={() => {
            if (!busy) {
              setReopenPrompt(null);
            }
          }}
          onConfirm={() => {
            void confirmReopen();
          }}
        />
      ) : null}
      {rejectPrompt ? (
        <RejectDialog
          prompt={rejectPrompt}
          busy={busy}
          onChange={(reason) => setRejectPrompt({ ...rejectPrompt, reason })}
          onClose={() => {
            if (!busy) {
              setRejectPrompt(null);
            }
          }}
          onConfirm={() => {
            void confirmReject();
          }}
        />
      ) : null}
      {cancelPrompt ? (
        <CancelDialog
          prompt={cancelPrompt}
          busy={busy}
          onChange={(reason) => setCancelPrompt({ ...cancelPrompt, reason })}
          onClose={() => {
            if (!busy) {
              setCancelPrompt(null);
            }
          }}
          onConfirm={() => {
            void confirmCancel();
          }}
        />
      ) : null}
      {invoice && token ? (
        <WalkInInvoice token={token} bill={invoice} onClose={() => setInvoice(null)} />
      ) : null}
      {adding && token ? (
        <AddLabJobDialog
          token={token}
          clients={clients}
          initialClientId={initialClientId ?? ''}
          onClose={() => setAdding(false)}
          onCreated={(_reference, createdInvoice) => {
            setAdding(false);
            setInvoice(createdInvoice);
            void refresh();
          }}
        />
      ) : null}
    </section>
  );
}

const SERVICE_MARKS = [
  { sample: 'Fitting', label: 'Fitting' },
  { sample: 'Edging', label: 'Edging' },
  { sample: 'Hard coat', label: 'Coating' },
  { sample: 'Tint', label: 'Tint' },
  { sample: 'Single vision', label: 'Lens or surfacing' },
  { sample: 'Other', label: 'Other service' },
] as const;

function ServiceMark({ name }: { name: string }): React.ReactElement {
  const look = labServiceLook(name);
  const Icon = look.icon;
  return (
    <span
      title={name}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${look.tone}`}
    >
      <Icon size={14} aria-hidden="true" />
    </span>
  );
}

function JobCard({
  job,
  closed = false,
  open,
  onToggle,
  onOpen,
  onMenu,
  onMove,
  onAccept,
  onReject,
  onNote,
  onCancel,
  onReopen,
}: {
  job: LabKanbanCard;
  closed?: boolean;
  open: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
  onMove: () => void;
  onAccept: () => void;
  onReject: () => void;
  onNote: () => void;
  onCancel: () => void;
  onReopen: () => void;
}): React.ReactElement {
  const age = stageAge(job.stageEnteredAt);
  const hold = useRef<number | null>(null);
  const openedMenu = useRef(false);
  const shopName = job.retailerName ?? 'Walk-in';
  const canDrag =
    !closed &&
    job.status !== 'DISPATCHED' &&
    job.status !== 'CANCELLED' &&
    job.status !== 'REJECTED';
  const next = NEXT[job.status];
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex items-stretch">
        <div
          draggable={canDrag}
          onDragStart={(event) => {
            if (!canDrag) {
              event.preventDefault();
              return;
            }
            event.dataTransfer.setData('text/plain', job.id);
            event.dataTransfer.effectAllowed = 'move';
            if (hold.current) {
              window.clearTimeout(hold.current);
            }
          }}
          className={`min-w-0 flex-1 ${canDrag ? 'cursor-grab' : ''}`}
        >
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${productTagLabel(job.referenceNumber)}, ${job.patientName}${job.services.length > 0 ? `, ${job.services.join(', ')}` : ''}`}
            onClick={() => {
              if (openedMenu.current) {
                openedMenu.current = false;
                return;
              }
              onToggle();
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              onMenu(event.clientX, event.clientY);
            }}
            onPointerDown={(event) => {
              if (event.pointerType === 'mouse') {
                return;
              }
              const x = event.clientX;
              const y = event.clientY;
              hold.current = window.setTimeout(() => {
                openedMenu.current = true;
                onMenu(x, y);
              }, 550);
            }}
            onPointerUp={() => {
              if (hold.current) {
                window.clearTimeout(hold.current);
              }
            }}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-canvas"
          >
            <ShopMark name={shopName} logoUrl={resolveBillLogoUrl(job.retailerLogoUrl)} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-sm font-semibold text-action">
                {productTagLabel(job.referenceNumber)}
              </span>
              <span className="block truncate text-sm text-ink">{job.patientName}</span>
              {job.services.length > 0 ? (
                <span className="mt-1 flex flex-wrap gap-1">
                  {job.services.map((service, index) => (
                    <ServiceMark key={`${service}-${index}`} name={service} />
                  ))}
                </span>
              ) : null}
            </span>
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-1 pr-2">
          <CardActions
            job={job}
            closed={closed}
            next={next}
            onAccept={onAccept}
            onReject={onReject}
            onMove={onMove}
          />
        </div>
      </div>
      {open ? (
        <div className="grid gap-2 border-t border-line bg-white/70 px-3 py-3 text-left">
          {job.patientPhone ? <p className="text-xs text-ink2">{job.patientPhone}</p> : null}
          <p className="text-xs text-ink3">via {shopName}</p>
          <div className="grid gap-1">
            <p className="text-xs font-medium uppercase tracking-wide text-ink3">Services</p>
            {job.services.length === 0 ? (
              <p className="text-sm text-ink2">No service is on this job.</p>
            ) : (
              <ul className="flex flex-wrap gap-1">
                {job.services.map((service, index) => (
                  <li
                    key={`${service}-${index}`}
                    className="inline-flex min-h-8 items-center gap-1 rounded-full bg-white px-2 text-sm text-ink"
                  >
                    <ServiceMark name={service} />
                    {service}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {job.shopRequest ? (
            <p className="text-xs font-medium text-amber">
              {job.shopRequest.kind === 'CANCEL'
                ? 'Cancellation requested'
                : 'Prescription change requested'}
            </p>
          ) : null}
          <p className="truncate text-xs text-ink2">{job.rxSummary}</p>
          {job.stageNote ? <p className="text-xs text-ink2">{job.stageNote}</p> : null}
          {job.status === 'CANCELLED' ? (
            <p className="text-sm text-ink3">
              {job.trail.map((status) => stageLabel(status)).join(' → ')}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm ${age.className}`}>{age.label}</p>
            {job.isUrgent ? (
              <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                Urgent
              </span>
            ) : null}
          </div>
          <div className="grid justify-items-end gap-2">
            {closed ? (
              <p className="text-sm text-ink2">This job is closed and cannot be reopened.</p>
            ) : (
              <>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink2"
                  onClick={onNote}
                >
                  Add note
                </button>
                {job.status === 'SUBMITTED' ? (
                  <>
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-teal px-3 text-xs font-semibold text-white"
                      onClick={onAccept}
                    >
                      <Check size={14} aria-hidden="true" />
                      Accept job
                    </button>
                    {job.retailerName ? (
                      <button
                        type="button"
                        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-danger bg-white px-3 text-xs font-semibold text-danger"
                        onClick={onReject}
                      >
                        <X size={14} aria-hidden="true" />
                        Reject job
                      </button>
                    ) : null}
                  </>
                ) : null}
                {job.status === 'DISPATCHED' ? (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center rounded-lg border border-action bg-white px-3 text-xs font-semibold text-action"
                    onClick={onReopen}
                  >
                    Reopen job
                  </button>
                ) : null}
                {(job.status === 'SUBMITTED' && job.retailerName) ||
                job.status === 'CANCELLED' ||
                job.status === 'REJECTED' ||
                job.status === 'DISPATCHED' ? null : (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center rounded-lg border border-danger bg-white px-3 text-xs font-semibold text-danger"
                    onClick={onCancel}
                  >
                    Cancel job
                  </button>
                )}
                {next ? (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-action px-3 text-xs font-semibold text-white"
                    onClick={onMove}
                  >
                    Move to {stageLabel(next)}
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                ) : job.status === 'CANCELLED' ? (
                  <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                    Cancelled
                  </span>
                ) : job.status === 'REJECTED' ? (
                  <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                    Rejected
                  </span>
                ) : job.status === 'SUBMITTED' ? null : (
                  <span className="rounded-full bg-teal-soft px-2 py-0.5 text-xs font-medium text-teal">
                    Completed
                  </span>
                )}
              </>
            )}
            <button
              type="button"
              className="min-h-11 px-3 text-xs font-semibold text-action"
              onClick={onOpen}
            >
              Open job
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function CardActions({
  job,
  closed,
  next,
  onAccept,
  onReject,
  onMove,
}: {
  job: LabKanbanCard;
  closed: boolean;
  next: JobStatus | null;
  onAccept: () => void;
  onReject: () => void;
  onMove: () => void;
}): React.ReactElement | null {
  if (closed || job.status === 'REJECTED' || job.status === 'CANCELLED') {
    return (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${job.status === 'REJECTED' ? 'bg-danger-soft text-danger' : 'bg-canvas text-ink3'}`}
      >
        {stageLabel(job.status)}
      </span>
    );
  }
  if (job.status === 'SUBMITTED') {
    return (
      <>
        <IconAction label="Accept job" className="bg-teal text-white" onClick={onAccept}>
          <Check size={16} aria-hidden="true" />
        </IconAction>
        {job.retailerName ? (
          <IconAction
            label="Reject job"
            className="border border-danger bg-white text-danger"
            onClick={onReject}
          >
            <X size={16} aria-hidden="true" />
          </IconAction>
        ) : null}
      </>
    );
  }
  if (!next) {
    return null;
  }
  return (
    <IconAction
      label={`Move to ${stageLabel(next)}`}
      className="bg-action text-white"
      onClick={onMove}
    >
      <ArrowRight size={16} aria-hidden="true" />
    </IconAction>
  );
}

function IconAction({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className: string;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-lg ${className}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function ClosedColumn({
  title,
  header,
  jobs,
  expanded,
  onToggle,
  renderJob,
}: {
  title: string;
  header: string;
  jobs: LabKanbanCard[];
  expanded: boolean;
  onToggle: () => void;
  renderJob: (job: LabKanbanCard, closed?: boolean) => React.ReactElement;
}): React.ReactElement {
  const visible = expanded ? jobs : jobs.slice(0, DISPATCHED_PREVIEW);
  return (
    <section className={`min-w-0 overflow-hidden rounded-xl border-2 ${header}`}>
      <header className="flex items-center gap-2 px-3 py-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-ink">
          {jobs.length}
        </span>
      </header>
      <div className="grid min-h-24 gap-2 bg-white/70 p-2">
        {jobs.length === 0 ? <p className="px-1 py-3 text-xs text-ink3">No jobs</p> : null}
        {visible.map((job) => renderJob(job, true))}
        {jobs.length > DISPATCHED_PREVIEW ? (
          <button
            type="button"
            className="min-h-11 rounded-lg px-3 text-sm font-medium text-action"
            onClick={onToggle}
          >
            {expanded ? 'See less' : `See more (${jobs.length - DISPATCHED_PREVIEW})`}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function RejectDialog({
  prompt,
  busy,
  onChange,
  onClose,
  onConfirm,
}: {
  prompt: RejectPrompt;
  busy: boolean;
  onChange: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  const missing = prompt.reason.trim().length === 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-4 py-6 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close reject"
        onClick={onClose}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="reject-job-title"
        className="relative grid w-full max-w-md gap-3 rounded-xl border border-line bg-white p-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div>
          <h2 id="reject-job-title" className="text-lg font-semibold text-ink">
            Reject {prompt.reference}
          </h2>
          <p className="mt-1 text-sm text-ink2">
            Confirm the rejection and tell the shop why. A rejected job cannot be reopened.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {REJECT_JOB_MESSAGES.map((message) => (
            <button
              key={message}
              type="button"
              aria-pressed={prompt.reason === message}
              className={`min-h-11 rounded-full border px-3 text-left text-xs ${prompt.reason === message ? 'border-action bg-action-soft text-action' : 'border-line text-ink2'}`}
              onClick={() => onChange(message)}
            >
              {message}
            </button>
          ))}
        </div>
        <label className="grid gap-1 text-xs text-ink2">
          Message to the shop
          <textarea
            value={prompt.reason}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
            maxLength={500}
            required
            placeholder="Choose a message or write one"
            aria-invalid={missing}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-action focus:outline-none"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line px-4 text-sm text-ink2"
            onClick={onClose}
          >
            Keep job
          </button>
          <button
            type="submit"
            disabled={busy || missing}
            className="min-h-11 rounded-lg bg-danger px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            Reject job
          </button>
        </div>
      </form>
    </div>
  );
}

function ReopenDialog({
  prompt,
  busy,
  onChange,
  onClose,
  onConfirm,
}: {
  prompt: ReopenPrompt;
  busy: boolean;
  onChange: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  const missing = prompt.reason.trim().length === 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-4 py-6 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close reopen"
        onClick={onClose}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="reopen-job-title"
        className="relative grid w-full max-w-md gap-3 rounded-xl border border-line bg-white p-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div>
          <h2 id="reopen-job-title" className="text-lg font-semibold text-ink">
            Reopen {prompt.reference}
          </h2>
          <p className="mt-1 text-sm text-ink2">
            Write why this dispatched job is coming back. The note stays on the job history.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {REOPEN_JOB_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              aria-pressed={prompt.reason === reason}
              className={`min-h-11 rounded-full border px-3 text-xs ${prompt.reason === reason ? 'border-action bg-action-soft text-action' : 'border-line text-ink2'}`}
              onClick={() => onChange(reason)}
            >
              {reason}
            </button>
          ))}
        </div>
        <label className="grid gap-1 text-xs text-ink2">
          Reason
          <textarea
            value={prompt.reason}
            placeholder="Write why this job is being reopened"
            onChange={(event) => onChange(event.target.value)}
            rows={3}
            maxLength={500}
            required
            aria-invalid={missing}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-action focus:outline-none"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line px-4 text-sm text-ink2"
            onClick={onClose}
          >
            Keep dispatched
          </button>
          <button
            type="submit"
            disabled={busy || missing}
            className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            Reopen job
          </button>
        </div>
      </form>
    </div>
  );
}

function CancelDialog({
  prompt,
  busy,
  onChange,
  onClose,
  onConfirm,
}: {
  prompt: CancelPrompt;
  busy: boolean;
  onChange: (reason: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  const missing = prompt.reason.trim().length === 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-4 py-6 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close cancel"
        onClick={onClose}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-job-title"
        className="relative grid w-full max-w-md gap-3 rounded-xl border border-line bg-white p-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div>
          <h2 id="cancel-job-title" className="text-lg font-semibold text-ink">
            Cancel {prompt.reference}
          </h2>
          <p className="mt-1 text-sm text-ink2">
            Confirm the cancellation and write why this job is ending. A cancelled job cannot be
            reopened.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CANCEL_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              aria-pressed={prompt.reason === reason}
              className={`min-h-11 rounded-full border px-3 text-xs ${prompt.reason === reason ? 'border-action bg-action-soft text-action' : 'border-line text-ink2'}`}
              onClick={() => onChange(reason)}
            >
              {reason}
            </button>
          ))}
        </div>
        <label className="grid gap-1 text-xs text-ink2">
          Reason
          <textarea
            value={prompt.reason}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
            maxLength={500}
            required
            aria-invalid={missing}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-action focus:outline-none"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line px-4 text-sm text-ink2"
            onClick={onClose}
          >
            Keep job
          </button>
          <button
            type="submit"
            disabled={busy || missing}
            className="min-h-11 rounded-lg bg-danger px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            Cancel job
          </button>
        </div>
      </form>
    </div>
  );
}

function NoteDialog({
  prompt,
  busy,
  onChange,
  onClose,
  onConfirm,
}: {
  prompt: NotePrompt;
  busy: boolean;
  onChange: (note: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-4 py-6 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close note"
        onClick={onClose}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-note-title"
        className="relative grid w-full max-w-md gap-3 rounded-xl border border-line bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div>
          <h2 id="job-note-title" className="text-lg font-semibold text-ink">
            Stage note
          </h2>
          <p className="mt-1 text-sm text-ink2">
            This note stays with {prompt.reference} at {stageLabel(prompt.from)}.
          </p>
        </div>
        <label className="grid gap-1 text-xs text-ink2">
          Note for this step
          <textarea
            value={prompt.note}
            onChange={(event) => onChange(event.target.value)}
            rows={3}
            maxLength={500}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-action"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            className="min-h-12 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink2"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 rounded-xl bg-action px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CompleteDialog({
  prompt,
  busy,
  onClose,
  onConfirm,
}: {
  prompt: CompletePrompt;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-4 py-6 sm:items-center"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close completion"
        onClick={onClose}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-complete-title"
        className="relative grid w-full max-w-md gap-3 rounded-xl border border-line bg-white p-4"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
      >
        <div>
          <h2 id="job-complete-title" className="text-lg font-semibold text-ink">
            Mark completed
          </h2>
          <p className="mt-1 text-sm text-ink2">
            {prompt.reference} will be marked completed. A completed job cannot move back.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            className="min-h-12 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink2"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 rounded-xl bg-action px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Saving…' : 'Mark completed'}
          </button>
        </div>
      </form>
    </div>
  );
}

function stageAge(iso: string): { label: string; className: string } {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  const label =
    hours < 1
      ? `${Math.max(1, Math.round(hours * 60))} min in stage`
      : hours < 48
        ? `${Math.round(hours)} h in stage`
        : `${Math.round(hours / 24)} d in stage`;
  const className = hours > 8 ? 'text-danger' : hours > 4 ? 'text-amber' : 'text-ink3';
  return { label, className };
}
