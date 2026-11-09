'use client';

import {
  canRedirectLabJob,
  canRequestLabJobUpdate,
  isMarkedDoneNote,
  labJobNeedsLabDecision,
  REOPEN_JOB_REASONS,
  type LabConnection,
  type LabJobDetail as LabJobDetailData,
} from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { RecordTrail } from '@/components/RecordTrail';

import { formatShortDate } from './dashboard-format';
import {
  cancelRetailerLabJob,
  loadLabConnections,
  loadLabJob,
  outsourceRetailerLabJob,
  redirectRetailerLabJob,
  reopenRetailerLabJob,
  setLabJobNotify,
} from './lab-api';
import { JobProgress, JobStatusBadge, jobStatusLabel } from './LabJobStatus';

export function LabJobDetail({ jobId }: { jobId: string }): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [job, setJob] = useState<LabJobDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [labs, setLabs] = useState<LabConnection[]>([]);
  const [labId, setLabId] = useState('');
  const [reason, setReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOutsource, setConfirmOutsource] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadLabJob(token, jobId)
      .then((next) => {
        setJob(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'This lab job could not be loaded');
      });
  }, [jobId, token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadLabConnections(token)
      .then(setLabs)
      .catch(() => setLabs([]));
  }, [token]);

  async function toggleNotify(notifyWhatsapp: boolean): Promise<void> {
    if (!token || !job) {
      return;
    }
    setSaving(true);
    try {
      const next = await setLabJobNotify(token, job.id, notifyWhatsapp);
      setJob({ ...job, notifyWhatsapp: next });
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : 'The notification setting could not be saved',
      );
    } finally {
      setSaving(false);
    }
  }

  if (error && !job) {
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  }
  if (!job) {
    return <div className="h-40 animate-pulse rounded-xl bg-white" />;
  }

  const contact = [job.lab.phone, job.lab.city]
    .filter((part) => part && part.length > 0)
    .join(' · ');

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-2xl font-semibold tracking-wide text-ink">{job.referenceNumber}</p>
        <p className="text-md text-ink2">{job.patientName}</p>
      </div>
      <section className="rounded-xl border border-line bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink">Status</h2>
          <JobStatusBadge status={job.status} />
        </div>
        <JobProgress status={job.status} />
        {labJobNeedsLabDecision(job.status) ? (
          <p className="mt-3 rounded-lg border border-line bg-amber-soft px-3 py-2 text-sm text-ink">
            {canRequestLabJobUpdate(job.status)
              ? 'This job is received. A change or a cancellation waits for the laboratory. They can accept it or reject it.'
              : job.status === 'READY'
                ? 'This job is ready. Only a cancellation can be requested, and the laboratory accepts or rejects it.'
                : 'This job is in processing. Only a cancellation can be requested, and the laboratory accepts or rejects it.'}
          </p>
        ) : null}
      </section>
      {labJobNeedsLabDecision(job.status) ? (
        <section className="grid gap-3 rounded-xl border border-line bg-white p-4">
          <h2 className="text-sm font-medium text-ink">
            {canRequestLabJobUpdate(job.status) ? 'Change or cancel' : 'Request cancellation'}
          </h2>
          {job.shopRequest ? (
            <p className="text-sm text-ink2">
              Waiting for the laboratory. {job.shopRequest.summary}
            </p>
          ) : (
            <>
              <p className="text-sm text-ink2">
                {canRequestLabJobUpdate(job.status)
                  ? 'Propose a prescription change from the bill, or request a cancellation. Nothing changes until the laboratory accepts.'
                  : 'The prescription stays as it is. Ask the laboratory to cancel this job. It stays here until they accept or reject the request.'}
              </p>
              <label className="grid gap-1 text-sm text-ink2">
                Request cancellation
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  maxLength={500}
                  className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
                />
              </label>
              <button
                type="button"
                disabled={saving || reason.trim().length === 0}
                className="min-h-11 w-fit rounded-lg border border-danger px-4 text-sm text-danger disabled:opacity-60"
                onClick={() => {
                  if (!token) {
                    return;
                  }
                  setSaving(true);
                  void cancelRetailerLabJob(token, job.id, reason.trim())
                    .then(async (result) => {
                      setNotice(result.message);
                      setReason('');
                      setJob(await loadLabJob(token, job.id));
                    })
                    .catch((caught: unknown) =>
                      setError(
                        caught instanceof Error ? caught.message : 'The request could not be sent',
                      ),
                    )
                    .finally(() => setSaving(false));
                }}
              >
                Request cancellation
              </button>
            </>
          )}
        </section>
      ) : null}
      {job.status === 'DISPATCHED' ? (
        <section className="grid gap-3 rounded-xl border border-line bg-white p-4">
          <h2 className="text-sm font-medium text-ink">Reopen</h2>
          <p className="text-sm text-ink2">
            Write why this dispatched job is coming back. The note stays on the status history.
          </p>
          <div className="flex flex-wrap gap-2">
            {REOPEN_JOB_REASONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                aria-pressed={reopenReason === suggestion}
                onClick={() => setReopenReason(suggestion)}
                className={`min-h-11 rounded-full border px-3 text-xs ${reopenReason === suggestion ? 'border-action bg-action-soft text-action' : 'border-line bg-white text-ink2'}`}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-sm text-ink2">
            Reason
            <textarea
              value={reopenReason}
              placeholder="Write why this job is being reopened"
              onChange={(event) => setReopenReason(event.target.value)}
              rows={2}
              maxLength={500}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
            />
          </label>
          <button
            type="button"
            disabled={saving || reopenReason.trim().length === 0}
            className="min-h-11 w-fit rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => {
              if (!token) {
                return;
              }
              setSaving(true);
              void reopenRetailerLabJob(token, job.id, reopenReason.trim())
                .then(async (message) => {
                  setNotice(message);
                  setReopenReason('');
                  setJob(await loadLabJob(token, job.id));
                })
                .catch((caught: unknown) =>
                  setError(
                    caught instanceof Error ? caught.message : 'The job could not be reopened',
                  ),
                )
                .finally(() => setSaving(false));
            }}
          >
            Reopen job
          </button>
        </section>
      ) : null}
      <section className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2">
        <div>
          <h2 className="text-sm font-medium text-ink">Prescription</h2>
          <EyeLine label="Right" eye={job.prescription.right} />
          <EyeLine label="Left" eye={job.prescription.left} />
          <p className="mt-2 text-sm text-ink2">
            Add {job.prescription.add || '—'} · PD {job.prescription.pd || '—'}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-medium text-ink">Laboratory</h2>
          <p className="text-sm text-ink">{job.lab.name}</p>
          <p className="text-sm text-ink2">{contact || 'No contact on file'}</p>
          <h3 className="mt-3 text-sm font-medium text-ink">Lens</h3>
          <p className="text-sm text-ink2">
            {[job.lens.name, job.lens.type].filter((part) => part.length > 0).join(' · ') ||
              'No lens details'}
          </p>
          <h3 className="mt-3 text-sm font-medium text-ink">Frame</h3>
          <p className="text-sm text-ink2">
            {[job.frame.name, job.frame.type, job.frame.material, job.frame.eyeSize]
              .filter((part) => part.length > 0)
              .join(' · ') || 'No frame details'}
          </p>
          {job.specialInstructions ? (
            <p className="mt-2 text-sm text-ink2">{job.specialInstructions}</p>
          ) : null}
        </div>
      </section>
      {canRedirectLabJob(job.status) && (job.status === 'OUTSOURCED' || !job.completedAt) ? (
        <section className="grid gap-3 rounded-xl border border-line bg-white p-4">
          <h2 className="text-sm font-medium text-ink">Change laboratory</h2>
          <p className="text-sm text-ink2">
            {job.status === 'OUTSOURCED'
              ? 'This job is outsourced. Send it to a connected laboratory, unless you mark it done.'
              : job.status === 'REJECTED'
                ? 'This laboratory rejected the job. Send it to another connected laboratory, or outsource it and finish the sale.'
                : 'The laboratory can be changed until the material is marked received.'}
          </p>
          {job.history.find((entry) => entry.status === 'REJECTED')?.notes ? (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {job.history.find((entry) => entry.status === 'REJECTED')?.notes}
            </p>
          ) : null}
          <label className="grid gap-1 text-sm text-ink2">
            Another laboratory
            <select
              value={labId}
              onChange={(event) => setLabId(event.target.value)}
              className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink"
            >
              <option value="">Choose a laboratory</option>
              {labs
                .filter((lab) => lab.status === 'APPROVED' && lab.id !== job.lab.id)
                .map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || labId.length === 0}
              className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
              onClick={() => {
                if (!token) {
                  return;
                }
                setSaving(true);
                void redirectRetailerLabJob(token, job.id, labId)
                  .then(async (result) => {
                    setNotice(result.message);
                    setJob(await loadLabJob(token, job.id));
                    setLabId('');
                  })
                  .catch((caught: unknown) =>
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : 'The laboratory could not be changed',
                    ),
                  )
                  .finally(() => setSaving(false));
              }}
            >
              Send to this laboratory
            </button>
            {job.status === 'OUTSOURCED' ? null : (
              <button
                type="button"
                disabled={saving}
                className="min-h-11 rounded-lg border border-line px-4 text-sm text-ink2"
                onClick={() => setConfirmOutsource(true)}
              >
                Outsource
              </button>
            )}
          </div>
          {confirmOutsource ? (
            <div className="grid gap-2 rounded-lg bg-amber-soft p-3">
              <p className="text-sm text-ink">
                Outsource {job.referenceNumber}? The sale can finish outside this laboratory. You
                can still send it to a laboratory until you mark it done.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setConfirmOutsource(false)}
                  className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm text-ink2"
                >
                  Keep this laboratory
                </button>
                <button
                  type="button"
                  disabled={saving || !token}
                  className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
                  onClick={() => {
                    if (!token) {
                      return;
                    }
                    setSaving(true);
                    void outsourceRetailerLabJob(token, job.id)
                      .then(async (result) => {
                        setNotice(result.message);
                        setConfirmOutsource(false);
                        setJob(await loadLabJob(token, job.id));
                      })
                      .catch((caught: unknown) =>
                        setError(
                          caught instanceof Error
                            ? caught.message
                            : 'The job could not be outsourced',
                        ),
                      )
                      .finally(() => setSaving(false));
                  }}
                >
                  {saving ? 'Saving…' : 'Confirm outsource'}
                </button>
              </div>
            </div>
          ) : null}
          <label className="grid gap-1 text-sm text-ink2">
            Cancel this job
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              maxLength={500}
              className="rounded-lg border border-line px-3 py-2 text-sm text-ink"
            />
          </label>
          <button
            type="button"
            disabled={saving || reason.trim().length === 0}
            className="min-h-11 w-fit rounded-lg border border-danger px-4 text-sm text-danger disabled:opacity-60"
            onClick={() => {
              if (!token) {
                return;
              }
              setSaving(true);
              void cancelRetailerLabJob(token, job.id, reason.trim())
                .then(async (result) => {
                  setNotice(result.message);
                  setReason('');
                  setJob(await loadLabJob(token, job.id));
                })
                .catch((caught: unknown) =>
                  setError(
                    caught instanceof Error ? caught.message : 'The job could not be cancelled',
                  ),
                )
                .finally(() => setSaving(false));
            }}
          >
            Cancel job
          </button>
        </section>
      ) : null}
      {notice ? <p className="text-sm text-ink2">{notice}</p> : null}
      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="text-sm font-medium text-ink">Record</h2>
        <div className="mt-2">
          <RecordTrail activity={job.activity} />
        </div>
        <h2 className="mt-4 text-sm font-medium text-ink">Status history</h2>
        <ol className="mt-3 grid gap-3">
          {job.history.map((entry) => (
            <li key={entry.id} className="border-l-2 border-line pl-3">
              <p className="text-sm text-ink">
                {isMarkedDoneNote(entry.notes) ? 'Done' : jobStatusLabel(entry.status)}
              </p>
              <p className="text-xs text-ink3">
                {formatShortDate(entry.changedAt)} · {entry.action} {entry.changedByName}
              </p>
              {entry.notes && !isMarkedDoneNote(entry.notes) ? (
                <p className="text-sm text-ink2">{entry.notes}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4">
        {job.invoice ? (
          <Link href={`/retailer/billing/${job.invoice.id}`} className="text-sm text-action">
            Invoice #{job.invoice.invoiceNumber}
          </Link>
        ) : (
          <p className="text-sm text-ink3">No invoice linked yet</p>
        )}
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={job.notifyWhatsapp}
            disabled={saving}
            onChange={(event) => {
              void toggleNotify(event.target.checked);
            }}
            className="h-4 w-4"
          />
          WhatsApp updates
        </label>
      </section>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function EyeLine({
  label,
  eye,
}: {
  label: string;
  eye: { sphere: string; cylinder: string; axis: string };
}): React.ReactElement {
  return (
    <p className="mt-1 text-sm text-ink2">
      {label} SPH {eye.sphere || '—'} CYL {eye.cylinder || '—'} AXIS {eye.axis || '—'}
    </p>
  );
}
