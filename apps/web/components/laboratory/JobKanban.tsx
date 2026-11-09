'use client';

import {
  isProcessingStatus,
  JOB_STATUS_LABEL,
  NEXT_LAB_STATUS,
  productTagLabel,
  REOPEN_JOB_REASONS,
  type JobStatus,
  type LabBoard,
  type LabClientRow,
  type LabKanbanCard,
} from '@optiworld/shared';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { resolveBillLogoUrl, ShopMark } from '@/components/retailer/ShopMark';

import { AddLabJobDialog } from './AddLabJobDialog';
import { JobDetailPanel } from './JobDetailPanel';
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

const COLUMNS: readonly {
  id: string;
  label: string;
  header: string;
  match: (status: JobStatus) => boolean;
  accepts: (status: JobStatus) => boolean;
}[] = [
  {
    id: 'SUBMITTED',
    label: 'Submitted',
    header: 'bg-amber-soft text-amber',
    match: (status) => status === 'SUBMITTED',
    accepts: (status) => status === 'SUBMITTED',
  },
  {
    id: 'CONFIRMED',
    label: 'Confirmed',
    header: 'bg-action-soft text-action',
    match: (status) => status === 'CONFIRMED',
    accepts: (status) => status === 'CONFIRMED',
  },
  {
    id: 'REJECTED',
    label: 'Rejected',
    header: 'bg-danger-soft text-danger',
    match: (status) => status === 'REJECTED',
    accepts: (status) => status === 'REJECTED',
  },
  {
    id: 'RECEIVED',
    label: 'Received',
    header: 'bg-canvas text-ink2',
    match: (status) => status === 'RECEIVED',
    accepts: (status) => status === 'RECEIVED',
  },
  {
    id: 'PROCESSING',
    label: 'Processing',
    header: 'bg-action-soft text-action',
    match: isProcessingStatus,
    accepts: (status) => status === 'CUTTING',
  },
  {
    id: 'READY',
    label: 'Ready',
    header: 'bg-teal-soft text-teal',
    match: (status) => status === 'READY',
    accepts: (status) => status === 'READY',
  },
  {
    id: 'DISPATCHED',
    label: 'Dispatched',
    header: 'bg-canvas text-ink3',
    match: (status) => status === 'DISPATCHED',
    accepts: (status) => status === 'DISPATCHED',
  },
];

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
  const [adding, setAdding] = useState(Boolean(initialClientId));
  const [clients, setClients] = useState<LabClientRow[]>([]);
  const [notePrompt, setNotePrompt] = useState<NotePrompt | null>(null);
  const [completePrompt, setCompletePrompt] = useState<CompletePrompt | null>(null);
  const [cancelPrompt, setCancelPrompt] = useState<CancelPrompt | null>(null);
  const [reopenPrompt, setReopenPrompt] = useState<ReopenPrompt | null>(null);
  const [showAllDispatched, setShowAllDispatched] = useState(false);
  const [showAllCancelled, setShowAllCancelled] = useState(false);

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

  return (
    <section className="grid gap-3" onClick={() => setMenu(null)}>
      <form
        className="grid gap-2 rounded-xl border border-line bg-white p-3 md:grid-cols-4"
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
            className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink focus:border-action focus:outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs text-ink2">
          Retailer
          <select
            value={retailerOrgId}
            onChange={(event) => setRetailerOrgId(event.target.value)}
            className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink focus:border-action focus:outline-none"
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
            className="min-h-11 rounded-lg border border-line px-3 text-sm"
          />
        </label>
        <label className="grid gap-1 text-xs text-ink2">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="min-h-11 rounded-lg border border-line px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white md:col-span-4 md:w-fit"
        >
          Apply filters
        </button>
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
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-line bg-white p-3 sm:grid-cols-2 xl:grid-cols-3">
          {COLUMNS.map((column) => {
            const jobs = (board?.jobs ?? []).filter((job) => column.match(job.status));
            const cancelled = (board?.jobs ?? []).filter((job) => job.status === 'CANCELLED');
            return (
              <section
                key={column.id}
                className="min-w-0"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const jobId = event.dataTransfer.getData('text/plain');
                  const current = (board?.jobs ?? []).find((job) => job.id === jobId);
                  if (
                    !current ||
                    current.status === 'DISPATCHED' ||
                    current.status === 'CANCELLED'
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
                <header className={`grid gap-2 rounded-t-xl px-3 py-2 ${column.header}`}>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-medium">{column.label}</h2>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-ink">
                      {jobs.length}
                    </span>
                  </div>
                  {column.id === 'RECEIVED' ? (
                    <button
                      type="button"
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-action px-3 text-sm font-semibold text-white"
                      onClick={() => setAdding(true)}
                    >
                      Add New Job
                    </button>
                  ) : null}
                </header>
                <div className="grid min-h-24 gap-2 rounded-b-xl border border-t-0 border-line bg-canvas p-2">
                  {jobs.length === 0 ? (
                    <p className="px-1 py-3 text-xs text-ink3">No jobs</p>
                  ) : null}
                  {(column.id === 'DISPATCHED'
                    ? showAllDispatched
                      ? jobs
                      : jobs.slice(0, DISPATCHED_PREVIEW)
                    : jobs
                  ).map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onOpen={() => setSelectedId(job.id)}
                      onMenu={(x, y) => setMenu({ job, x, y })}
                      onMove={() => {
                        void moveJob(job);
                      }}
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
                  ))}
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
                  {column.id === 'DISPATCHED' ? (
                    <div className="mt-1 grid gap-2 border-t border-line pt-3">
                      <div className="flex items-center gap-2 px-1">
                        <h3 className="text-sm font-medium text-ink">Cancelled</h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-ink">
                          {cancelled.length}
                        </span>
                      </div>
                      {cancelled.length === 0 ? (
                        <p className="px-1 py-2 text-xs text-ink3">No cancelled jobs</p>
                      ) : null}
                      {(showAllCancelled ? cancelled : cancelled.slice(0, DISPATCHED_PREVIEW)).map(
                        (job) => (
                          <JobCard
                            key={job.id}
                            job={job}
                            onOpen={() => setSelectedId(job.id)}
                            onMenu={(x, y) => setMenu({ job, x, y })}
                            onMove={() => {
                              void moveJob(job);
                            }}
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
                        ),
                      )}
                      {cancelled.length > DISPATCHED_PREVIEW ? (
                        <button
                          type="button"
                          className="min-h-11 rounded-lg px-3 text-sm font-medium text-action"
                          onClick={() => setShowAllCancelled((current) => !current)}
                        >
                          {showAllCancelled
                            ? 'See less'
                            : `See more (${cancelled.length - DISPATCHED_PREVIEW})`}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
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
          {menu.job.status === 'CANCELLED' ? null : (
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
            if (!token) {
              return;
            }
            setBusy(true);
            void acceptLabBoardJob(token, detail.id)
              .then(async (saved) => {
                setDetail(saved);
                setNotice('The job was accepted. Mark it received when the material arrives.');
                await refresh();
              })
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error ? caught.message : 'The job could not be accepted',
                ),
              )
              .finally(() => setBusy(false));
          }}
          onReject={(reason) => {
            if (!token) {
              return;
            }
            setBusy(true);
            void rejectLabBoardJob(token, detail.id, reason)
              .then(async (result) => {
                setDetail(await loadLabBoardJob(token, detail.id));
                setNotice(result.message);
                await refresh();
              })
              .catch((caught: unknown) =>
                setError(
                  caught instanceof Error ? caught.message : 'The job could not be rejected',
                ),
              )
              .finally(() => setBusy(false));
          }}
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
      {adding && token ? (
        <AddLabJobDialog
          token={token}
          clients={clients}
          initialClientId={initialClientId ?? ''}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            void refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function JobCard({
  job,
  onOpen,
  onMenu,
  onMove,
  onNote,
  onCancel,
  onReopen,
}: {
  job: LabKanbanCard;
  onOpen: () => void;
  onMenu: (x: number, y: number) => void;
  onMove: () => void;
  onNote: () => void;
  onCancel: () => void;
  onReopen: () => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const age = stageAge(job.stageEnteredAt);
  const hold = useRef<number | null>(null);
  const openedMenu = useRef(false);
  const shopName = job.retailerName ?? 'Walk-in';
  const canDrag = job.status !== 'DISPATCHED' && job.status !== 'CANCELLED';
  const next = NEXT[job.status];
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white">
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
        className={canDrag ? 'cursor-grab' : undefined}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${productTagLabel(job.referenceNumber)}, ${job.patientName}`}
          onClick={() => {
            if (openedMenu.current) {
              openedMenu.current = false;
              return;
            }
            setOpen((current) => !current);
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
          </span>
          <ChevronDown
            size={18}
            className={`shrink-0 text-ink2 transition-transform ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>
      {open ? (
        <div className="grid gap-2 border-t border-line bg-white/70 px-3 py-3 text-left">
          {job.patientPhone ? <p className="text-xs text-ink2">{job.patientPhone}</p> : null}
          <p className="text-xs text-ink3">via {shopName}</p>
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
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink2"
              onClick={onNote}
            >
              Add note
            </button>
            {job.status === 'DISPATCHED' ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-lg border border-action bg-white px-3 text-xs font-semibold text-action"
                onClick={onReopen}
              >
                Reopen job
              </button>
            ) : null}
            {job.status === 'CANCELLED' || job.status === 'DISPATCHED' ? null : (
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
            ) : (
              <span className="rounded-full bg-teal-soft px-2 py-0.5 text-xs font-medium text-teal">
                Completed
              </span>
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
            Confirm the cancellation and write why this job is ending.
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
