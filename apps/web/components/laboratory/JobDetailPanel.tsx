'use client';

import {
  isMarkedDoneNote,
  NEXT_LAB_STATUS,
  prescriptionIssues,
  productTagLabel,
  type ItemPrescription,
  type LabBoardJob,
  type PrescriptionIssueKey,
  type PrescriptionReading,
} from '@optiworld/shared';
import { useState } from 'react';

import { cancellationLine, RecordTrail } from '@/components/RecordTrail';
import { PrescriptionFields } from '@/components/retailer/PrescriptionFields';
import { JobStatusBadge, jobStatusLabel } from '@/components/retailer/LabJobStatus';

export function JobDetailPanel({
  job,
  busy,
  notice,
  onClose,
  onAdvance,
  onUrgent,
  onNotes,
  onSavePrescription,
  onNotify,
  onCancel,
  onReopen,
  onAccept,
  onReject,
  onRemind,
  onRespond,
}: {
  job: LabBoardJob;
  busy: boolean;
  notice: string | null;
  onClose: () => void;
  onAdvance: () => void;
  onUrgent: (isUrgent: boolean) => void;
  onNotes: (notes: string) => void;
  onSavePrescription: (prescription: ItemPrescription) => void;
  onNotify: () => void;
  onCancel: () => void;
  onReopen: () => void;
  onAccept: () => void;
  onReject: (reason: string) => void;
  onRemind: () => void;
  onRespond: (action: 'ACCEPT' | 'DECLINE') => void;
}): React.ReactElement {
  const [notes, setNotes] = useState(job.notes ?? '');
  const [rejectReason, setRejectReason] = useState('');
  const [editingRx, setEditingRx] = useState(false);
  const [rxDraft, setRxDraft] = useState<PrescriptionReading>(() => readingFrom(job));
  const [rxIssues, setRxIssues] = useState<Partial<Record<PrescriptionIssueKey, string>>>({});
  const canEditRx =
    job.status === 'SUBMITTED' ||
    job.status === 'CONFIRMED' ||
    (job.status === 'RECEIVED' && !job.retailerName);
  const cancelReason =
    job.history.find((entry) => entry.status === 'CANCELLED' || entry.status === 'REJECTED')
      ?.notes ?? null;
  const next = NEXT_LAB_STATUS[job.status];
  const frame = [job.frame.name, job.frame.type, job.frame.material, job.frame.eyeSize]
    .filter((part) => part.length > 0)
    .join(' · ');
  const lens = [job.lens.name, job.lens.type].filter((part) => part.length > 0).join(' · ');

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[360px] flex-col border-l border-line bg-white"
      aria-label="Job detail"
    >
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink3">Product tag</p>
          <p className="font-mono text-lg font-semibold tracking-wide text-action">
            {productTagLabel(job.referenceNumber)}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <JobStatusBadge status={job.status} />
            {job.isUrgent ? (
              <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                Urgent
              </span>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="min-h-11 rounded-lg px-3 text-sm text-ink2"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        <dl className="grid gap-2 text-ink2">
          <div>
            <dt className="text-sm uppercase text-ink3">Customer</dt>
            <dd className="text-ink">{job.patientName}</dd>
          </div>
          <div>
            <dt className="text-sm uppercase text-ink3">Contact</dt>
            <dd className="text-ink">{job.patientPhone || '—'}</dd>
          </div>
          <div>
            <dt className="text-sm uppercase text-ink3">Submitted by</dt>
            <dd>{job.retailerName ?? 'Walk-in'}</dd>
          </div>
          <div>
            <dt className="text-sm uppercase text-ink3">Date received</dt>
            <dd>{formatWhen(job.createdAt)}</dd>
          </div>
        </dl>
        <RecordTrail activity={job.activity} />
        {job.status === 'CANCELLED' || job.status === 'REJECTED' ? (
          <div>
            <h2 className="text-sm font-medium uppercase text-ink3">
              {job.status === 'REJECTED' ? 'Rejection' : 'Cancellation'}
            </h2>
            <p className="mt-1 text-ink">{cancellationLine(job.activity, job.updatedAt)}</p>
            <p className="mt-1 text-sm text-ink2">{cancelReason || 'No reason recorded'}</p>
          </div>
        ) : null}
        <div>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium uppercase text-ink3">Prescription</h2>
            {canEditRx && !editingRx ? (
              <button
                type="button"
                className="min-h-11 rounded-lg px-2 text-sm font-medium text-action"
                onClick={() => {
                  setRxDraft(readingFrom(job));
                  setRxIssues({});
                  setEditingRx(true);
                }}
              >
                Edit
              </button>
            ) : null}
          </div>
          {editingRx ? (
            <form
              className="mt-2 grid gap-3"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                const issues = prescriptionIssues(rxDraft);
                setRxIssues(issues);
                if (Object.keys(issues).length > 0) {
                  return;
                }
                onSavePrescription({ ...rxDraft, notes: '' });
              }}
            >
              <PrescriptionFields
                draft={rxDraft}
                issues={rxIssues}
                onChange={setRxDraft}
                showNotes={false}
                showGuidance={false}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-11 rounded-lg bg-action px-3 text-sm font-medium text-white disabled:opacity-50"
                >
                  Save prescription
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink2"
                  onClick={() => setEditingRx(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <table className="mt-2 w-full border-collapse text-left text-xs">
              <thead>
                <tr className="text-xs uppercase text-ink3">
                  <th className="py-1 pr-2" />
                  <th className="py-1 pr-2">SPH</th>
                  <th className="py-1 pr-2">CYL</th>
                  <th className="py-1 pr-2">AXIS</th>
                  <th className="py-1 pr-2">ADD</th>
                  <th className="py-1">PD</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="py-1 pr-2 font-medium text-ink">R</th>
                  <td className="py-1 pr-2">{job.prescription.right.sphere || '—'}</td>
                  <td className="py-1 pr-2">{job.prescription.right.cylinder || '—'}</td>
                  <td className="py-1 pr-2">{job.prescription.right.axis || '—'}</td>
                  <td className="py-1 pr-2">{job.prescription.add || '—'}</td>
                  <td className="py-1">{job.prescription.pd || '—'}</td>
                </tr>
                <tr>
                  <th className="py-1 pr-2 font-medium text-ink">L</th>
                  <td className="py-1 pr-2">{job.prescription.left.sphere || '—'}</td>
                  <td className="py-1 pr-2">{job.prescription.left.cylinder || '—'}</td>
                  <td className="py-1 pr-2">{job.prescription.left.axis || '—'}</td>
                  <td className="py-1 pr-2">{job.prescription.add || '—'}</td>
                  <td className="py-1">{job.prescription.pd || '—'}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h2 className="text-sm font-medium uppercase text-ink3">Lens</h2>
          <p className="mt-1 text-ink2">{lens || 'No lens details'}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium uppercase text-ink3">Frame</h2>
          <p className="mt-1 text-ink2">{frame || 'No frame details'}</p>
        </div>
        <div>
          <h2 className="text-sm font-medium uppercase text-ink3">Notes/Special instructions</h2>
          <p className="mt-1 text-ink2">{job.specialInstructions || 'None'}</p>
        </div>
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onNotes(notes);
          }}
        >
          <label htmlFor="lab-notes" className="text-sm font-medium uppercase text-ink3">
            Internal lab notes
          </label>
          <textarea
            id="lab-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={2000}
            className="rounded-lg border border-line px-3 py-2 text-sm focus:border-action focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 justify-self-start rounded-lg border border-line px-3 text-sm text-ink2"
          >
            Save notes
          </button>
        </form>
        <div>
          <h2 className="text-sm font-medium uppercase text-ink3">Status history</h2>
          <ol className="mt-2 space-y-3 border-l border-line pl-3">
            {job.history.map((entry) => (
              <li key={entry.id}>
                <p className="font-medium text-ink">
                  {isMarkedDoneNote(entry.notes) ? 'Done' : jobStatusLabel(entry.status)}
                </p>
                {entry.notes && !isMarkedDoneNote(entry.notes) ? (
                  <p className="text-sm text-ink2">{entry.notes}</p>
                ) : null}
                <p className="text-xs text-ink3">
                  {formatWhen(entry.changedAt)} · {entry.action} {entry.changedByName}
                </p>
              </li>
            ))}
          </ol>
        </div>
        {job.shopRequest ? (
          <div className="rounded-lg bg-amber-soft p-3">
            <p className="text-sm text-ink">
              {job.shopRequest.kind === 'CANCEL'
                ? 'The shop asked to cancel this received job. Call them to discuss it. Accept only if the job should be cancelled. Otherwise keep the job.'
                : 'The shop proposed a prescription change. Accept it or keep the current prescription.'}
            </p>
            <p className="mt-1 text-sm text-ink2">{job.shopRequest.summary}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                className="min-h-11 rounded-lg bg-action px-3 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => onRespond('ACCEPT')}
              >
                {job.shopRequest.kind === 'CANCEL' ? 'Accept cancellation' : 'Accept change'}
              </button>
              <button
                type="button"
                disabled={busy}
                className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink2"
                onClick={() => onRespond('DECLINE')}
              >
                {job.shopRequest.kind === 'CANCEL' ? 'Reject cancellation' : 'Reject change'}
              </button>
            </div>
          </div>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-ink2">
            {notice}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2 border-t border-line p-4">
        {job.status === 'SUBMITTED' ? (
          <>
            <button
              type="button"
              disabled={busy}
              className="min-h-11 rounded-lg bg-teal px-4 text-sm font-medium text-white disabled:opacity-50"
              onClick={onAccept}
            >
              Accept job
            </button>
            <label className="grid gap-1 text-sm text-ink2">
              Message to the shop
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                rows={3}
                maxLength={500}
                className="rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-action focus:outline-none"
              />
            </label>
            <button
              type="button"
              disabled={busy || rejectReason.trim().length === 0}
              className="min-h-11 rounded-lg border border-danger px-4 text-sm text-danger disabled:opacity-50"
              onClick={() => onReject(rejectReason.trim())}
            >
              Reject job
            </button>
          </>
        ) : null}
        {job.status === 'CONFIRMED' ? (
          <button
            type="button"
            disabled={busy}
            className="min-h-11 rounded-lg border border-line px-4 text-sm text-ink2"
            onClick={onRemind}
          >
            Remind the shop about material
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy || !next}
          className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-50"
          onClick={onAdvance}
        >
          {next
            ? `Move to ${jobStatusLabel(next)}`
            : job.status === 'SUBMITTED'
              ? 'Waiting for a decision'
              : 'Completed'}
        </button>
        <button
          type="button"
          disabled={busy}
          className="min-h-11 rounded-lg border border-line px-4 text-sm text-ink2"
          aria-pressed={job.isUrgent}
          onClick={() => onUrgent(!job.isUrgent)}
        >
          {job.isUrgent ? 'Clear urgent' : 'Flag urgent'}
        </button>
        <button
          type="button"
          disabled={busy}
          className="min-h-11 rounded-lg border border-line px-4 text-sm text-ink2"
          onClick={onNotify}
        >
          {job.retailerName ? 'Notify retailer' : 'Notify customer'}
        </button>
        {job.status === 'DISPATCHED' ? (
          <button
            type="button"
            disabled={busy}
            className="min-h-11 rounded-lg border border-action px-4 text-sm text-action"
            onClick={onReopen}
          >
            Reopen job
          </button>
        ) : null}
        {job.status === 'CANCELLED' ||
        job.status === 'DISPATCHED' ||
        job.status === 'REJECTED' ||
        job.status === 'OUTSOURCED' ? null : (
          <button
            type="button"
            disabled={busy}
            className="min-h-11 rounded-lg border border-danger px-4 text-sm text-danger"
            onClick={onCancel}
          >
            Cancel job
          </button>
        )}
      </div>
    </aside>
  );
}

function readingFrom(job: LabBoardJob): PrescriptionReading {
  return {
    right: job.prescription.right,
    left: job.prescription.left,
    add: job.prescription.add,
    pd: job.prescription.pd,
    notes: '',
  };
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
