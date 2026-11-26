'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

export const PAGE_SIZES = [10, 20, 30, 40] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const AMBER_CARD =
  'border-amber bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-amber)_22%,white)_0%,white_50%,var(--ow-amber-soft)_100%)]';
export const BLUE_CARD =
  'border-action bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-blue)_22%,white)_0%,white_50%,var(--ow-blue-soft)_100%)]';
export const TEAL_CARD =
  'border-teal bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-teal)_18%,white)_0%,white_52%,var(--ow-teal-soft)_100%)]';
export const NAVY_CARD =
  'border-navy bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-navy)_10%,white)_0%,white_55%,var(--ow-bg)_100%)]';
export const DANGER_CARD =
  'border-danger bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-red)_16%,white)_0%,white_52%,var(--ow-red-soft)_100%)]';

export const fieldClass =
  'h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-action';

export const headRowClass = 'bg-navy text-left';
export const headCellClass = 'px-3 py-2 text-xs font-medium uppercase tracking-wide text-white';

export function pageWindow<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): { current: number; pageCount: number; visible: T[] } {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(page, 1), pageCount);
  const start = (current - 1) * pageSize;
  return { current, pageCount, visible: rows.slice(start, start + pageSize) };
}

export function MetricCard({
  label,
  value,
  hint,
  card,
  mark,
  icon: Icon,
  href,
  onClick,
  pressed,
  tone = 'ink',
}: {
  label: string;
  value: string;
  hint?: string;
  card: string;
  mark: string;
  icon: LucideIcon;
  href?: string;
  onClick?: () => void;
  pressed?: boolean;
  tone?: 'ink' | 'inverse';
}): React.ReactElement {
  const className = `flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left ${card}`;
  const body = (
    <>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${mark}`}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span
          className={`block text-xs font-medium uppercase tracking-wide ${tone === 'inverse' ? 'text-white/80' : 'text-ink3'}`}
        >
          {label}
        </span>
        <span
          className={`block text-md font-semibold leading-tight ${tone === 'inverse' ? 'text-white' : 'text-ink'}`}
        >
          {value}
        </span>
        {hint ? (
          <span
            className={`block text-xs leading-tight ${tone === 'inverse' ? 'text-white/80' : 'text-amber'}`}
          >
            {hint}
          </span>
        ) : null}
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={pressed} className={className}>
        {body}
      </button>
    );
  }
  return <article className={className}>{body}</article>;
}

export function ListPager({
  total,
  shown,
  page,
  pageCount,
  pageSize,
  onPage,
  onPageSize,
}: {
  total: number;
  shown: number;
  page: number;
  pageCount: number;
  pageSize: PageSize;
  onPage: (page: number) => void;
  onPageSize: (size: PageSize) => void;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink2">
      <p>
        {shown} of {total}
      </p>
      <label className="inline-flex items-center gap-2">
        Show
        <select
          aria-label="Rows per page"
          value={pageSize}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (next === 10 || next === 20 || next === 30 || next === 40) {
              onPageSize(next);
            }
          }}
          className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-action"
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
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
        >
          Previous
        </button>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
        >
          Next
        </button>
      </div>
    </div>
  );
}
