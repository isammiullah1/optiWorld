import { isProcessingStatus, type JobStatus } from '@optiworld/shared';
import { BadgeCheck, CircleCheck, Cog, Inbox, Package, Truck, type LucideIcon } from 'lucide-react';

export type JobStageLook = {
  id: string;
  label: string;
  icon: LucideIcon;
  tone: string;
  match: (status: JobStatus) => boolean;
};

/** Each workshop stage keeps its own colour so neighbouring tiles do not blend. */
export const JOB_STAGE_LOOK: readonly JobStageLook[] = [
  {
    id: 'SUBMITTED',
    label: 'New orders',
    icon: Inbox,
    tone: 'border-amber bg-amber-soft text-amber',
    match: (status) => status === 'SUBMITTED',
  },
  {
    id: 'CONFIRMED',
    label: 'Accepted orders',
    icon: BadgeCheck,
    tone: 'border-action bg-action-soft text-action',
    match: (status) => status === 'CONFIRMED',
  },
  {
    id: 'RECEIVED',
    label: 'Received at lab',
    icon: Package,
    tone: 'border-navy bg-[var(--ow-navy-soft)] text-navy',
    match: (status) => status === 'RECEIVED',
  },
  {
    id: 'PROCESSING',
    label: 'Processing',
    icon: Cog,
    tone: 'border-[var(--ow-work)] bg-[var(--ow-work-soft)] text-[var(--ow-work)]',
    match: isProcessingStatus,
  },
  {
    id: 'READY',
    label: 'Ready',
    icon: CircleCheck,
    tone: 'border-teal bg-teal-soft text-teal',
    match: (status) => status === 'READY',
  },
  {
    id: 'DISPATCHED',
    label: 'Dispatched',
    icon: Truck,
    tone: 'border-[var(--ow-sent)] bg-[var(--ow-sent-soft)] text-[var(--ow-sent)]',
    match: (status) => status === 'DISPATCHED',
  },
];
