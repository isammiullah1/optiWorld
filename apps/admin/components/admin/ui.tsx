import type { OrgType } from '@optiworld/shared';

import { orgTypeLabel, statusLabel } from './format';

export function TypeBadge({ type }: { type: OrgType }): React.ReactElement {
  const tone =
    type === 'RETAILER'
      ? 'bg-action-soft text-action'
      : type === 'WHOLESALER'
        ? 'bg-teal-soft text-teal'
        : 'bg-amber-soft text-amber';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {orgTypeLabel(type)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }): React.ReactElement {
  const tone =
    status === 'ACTIVE'
      ? 'bg-teal-soft text-teal'
      : status === 'TRIAL' || status === 'PAST_DUE'
        ? 'bg-amber-soft text-amber'
        : status === 'INACTIVE'
          ? 'bg-canvas text-ink3'
          : 'bg-danger-soft text-danger';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {statusLabel(status)}
    </span>
  );
}

export function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-line bg-white p-4" role="alert">
      <p className="text-md font-medium text-ink">This page could not be loaded</p>
      <p className="mt-1 text-sm text-ink2">{message}</p>
      <button
        type="button"
        className="mt-3 min-h-11 rounded-lg bg-purp px-4 py-2 text-sm font-medium text-white"
        onClick={onRetry}
      >
        Try again
      </button>
    </div>
  );
}

export function SkeletonRows(): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      {['a', 'b', 'c', 'd'].map((key) => (
        <div key={key} className="h-10 animate-pulse rounded-lg bg-line" />
      ))}
    </div>
  );
}

export const fieldClass =
  'rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-purp';
export const primaryButton =
  'min-h-11 rounded-lg bg-purp px-4 py-2 text-md font-medium text-white disabled:opacity-60';
export const secondaryButton =
  'min-h-11 rounded-lg border border-line bg-white px-4 py-2 text-md text-ink2';
