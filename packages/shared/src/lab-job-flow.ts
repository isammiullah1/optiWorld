import type { JobStatus } from './enums/index.js';

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  SUBMITTED: 'Submitted',
  CONFIRMED: 'Confirmed',
  RECEIVED: 'Received',
  CUTTING: 'Processing',
  FITTING: 'Processing',
  QC: 'Processing',
  READY: 'Ready',
  DISPATCHED: 'Dispatched',
  REJECTED: 'Rejected',
  OUTSOURCED: 'Outsourced',
  CANCELLED: 'Cancelled',
};

/** Linear workshop steps. Accept and reject are separate from this list. */
export const NEXT_LAB_STATUS: Record<JobStatus, JobStatus | null> = {
  SUBMITTED: null,
  CONFIRMED: 'RECEIVED',
  RECEIVED: 'CUTTING',
  CUTTING: 'READY',
  FITTING: 'READY',
  QC: 'READY',
  READY: 'DISPATCHED',
  DISPATCHED: null,
  REJECTED: null,
  OUTSOURCED: null,
  CANCELLED: null,
};

export const PROCESSING_JOB_STATUSES = ['CUTTING', 'FITTING', 'QC'] as const;

export const REDIRECTABLE_JOB_STATUSES = [
  'SUBMITTED',
  'CONFIRMED',
  'REJECTED',
  'OUTSOURCED',
] as const;

export const MATERIAL_REMINDER_WAIT_MS = 60 * 60 * 1000;

export const REOPEN_JOB_REASONS = [
  'Repair needed',
  'Wrong fitting',
  'Low quality',
  'Lens damage',
  'Prescription needs to be remade',
] as const;

export function canRedirectLabJob(status: JobStatus): boolean {
  return (REDIRECTABLE_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

export function isProcessingStatus(status: JobStatus): boolean {
  return (PROCESSING_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

/** The laboratory must accept a shop request. The shop cannot change the job alone. */
export function labJobNeedsLabDecision(status: JobStatus): boolean {
  return status === 'RECEIVED' || status === 'READY' || isProcessingStatus(status);
}

/** A prescription change can be requested only while the material is received, before processing. */
export function canRequestLabJobUpdate(status: JobStatus): boolean {
  return status === 'RECEIVED';
}

export const MARKED_DONE_NOTE = 'Marked done.';

export function isMarkedDoneNote(notes: string | null | undefined): boolean {
  return notes?.startsWith(MARKED_DONE_NOTE) === true;
}
