import { JOB_STATUS_LABEL, isProcessingStatus, type JobStatus } from '@optiworld/shared';
import {
  ArrowRightLeft,
  Ban,
  Check,
  Cog,
  Inbox,
  PackageCheck,
  Send,
  Truck,
  X,
  type LucideIcon,
} from 'lucide-react';

export const JOB_STAGES = [
  'SUBMITTED',
  'CONFIRMED',
  'RECEIVED',
  'CUTTING',
  'READY',
  'DISPATCHED',
] as const;

const LABELS = JOB_STATUS_LABEL;

const LOOK: Record<JobStatus, { idle: string; active: string; icon: LucideIcon }> = {
  SUBMITTED: {
    idle: 'border border-amber bg-amber-soft text-amber',
    active: 'border border-amber bg-amber-soft text-amber',
    icon: Send,
  },
  CONFIRMED: {
    idle: 'border border-action bg-action-soft text-action',
    active: 'border border-action bg-action text-white',
    icon: Check,
  },
  RECEIVED: {
    idle: 'border border-action bg-action-soft text-action',
    active: 'border border-action bg-action text-white',
    icon: Inbox,
  },
  CUTTING: {
    idle: 'border border-action bg-action-soft text-action',
    active: 'border border-action bg-action text-white',
    icon: Cog,
  },
  FITTING: {
    idle: 'border border-action bg-action-soft text-action',
    active: 'border border-action bg-action text-white',
    icon: Cog,
  },
  QC: {
    idle: 'border border-action bg-action-soft text-action',
    active: 'border border-action bg-action text-white',
    icon: Cog,
  },
  READY: {
    idle: 'border border-purp bg-purp-soft text-purp',
    active: 'border border-purp bg-purp text-white',
    icon: PackageCheck,
  },
  DISPATCHED: {
    idle: 'border border-teal bg-teal-soft text-teal',
    active: 'border border-teal bg-teal text-white',
    icon: Truck,
  },
  REJECTED: {
    idle: 'border border-danger bg-danger-soft text-danger',
    active: 'border border-danger bg-danger text-white',
    icon: X,
  },
  OUTSOURCED: {
    idle: 'border border-ink3 bg-canvas text-ink2',
    active: 'border border-ink2 bg-ink2 text-white',
    icon: ArrowRightLeft,
  },
  CANCELLED: {
    idle: 'border border-danger bg-danger-soft text-danger',
    active: 'border border-danger bg-danger text-white',
    icon: Ban,
  },
};

export const ALL_STATUS_LOOK = {
  idle: 'border border-ink3 bg-[color-mix(in_srgb,var(--ow-ink3)_22%,white)] text-ink2',
  active: 'border border-ink2 bg-ink2 text-white',
};

export function jobStatusLabel(status: JobStatus): string {
  return LABELS[status];
}

export function jobStatusClass(status: JobStatus): string {
  return LOOK[status].idle;
}

export function jobStatusActiveClass(status: JobStatus): string {
  return LOOK[status].active;
}

export function jobStatusIcon(status: JobStatus): LucideIcon {
  return LOOK[status].icon;
}

export function JobStatusBadge({ status }: { status: JobStatus }): React.ReactElement {
  const Icon = LOOK[status].icon;
  return (
    <span
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${LOOK[status].idle}`}
    >
      <Icon size={14} aria-hidden="true" />
      {jobStatusLabel(status)}
    </span>
  );
}

export function JobProgress({ status }: { status: JobStatus }): React.ReactElement {
  if (status === 'CANCELLED' || status === 'REJECTED' || status === 'OUTSOURCED') {
    return <p className="text-sm font-medium text-ink">{jobStatusLabel(status)}</p>;
  }
  const current = isProcessingStatus(status)
    ? JOB_STAGES.indexOf('CUTTING')
    : JOB_STAGES.indexOf(status as (typeof JOB_STAGES)[number]);
  return (
    <ol className="grid grid-cols-3 gap-1 sm:grid-cols-6">
      {JOB_STAGES.map((stage, index) => {
        const reached = index <= current;
        return (
          <li key={stage} className="grid gap-1">
            <span className={`h-1.5 rounded-full ${reached ? 'bg-action' : 'bg-line'}`} />
            <span className={`text-xs ${index === current ? 'font-medium text-ink' : 'text-ink3'}`}>
              {jobStatusLabel(stage)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
