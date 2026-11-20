'use client';

import type { RetailerAlert } from '@optiworld/shared';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { formatRelativeTime } from '@/components/retailer/dashboard-format';

export type NoticeBoardDef = {
  id: string;
  title: string;
  empty: string;
  icon: LucideIcon;
  card: string;
  mark: string;
};

const LIST_SCROLL =
  'grid max-h-[14.875rem] gap-2 overflow-y-auto overscroll-y-contain pr-1 [scrollbar-color:transparent_transparent] [scrollbar-width:thin] group-hover:[scrollbar-color:color-mix(in_srgb,var(--ow-ink3)_90%,transparent)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent group-hover:[&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--ow-ink3)_90%,transparent)]';

export function NoticeBoards({
  boards,
  grouped,
  categoryHref,
  itemHref,
  iconFor,
  onOpen,
}: {
  boards: readonly NoticeBoardDef[];
  grouped: Readonly<Record<string, readonly RetailerAlert[]>>;
  categoryHref: (id: string) => string;
  itemHref: (alert: RetailerAlert) => string;
  iconFor: (alert: RetailerAlert) => LucideIcon;
  onOpen: (alert: RetailerAlert) => void;
}): React.ReactElement {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {boards.map((board) => {
        const rows = grouped[board.id] ?? [];
        const Icon = board.icon;
        const unread = rows.filter((alert) => !alert.isRead).length;
        return (
          <article
            key={board.id}
            className={`group grid gap-2 rounded-xl border-2 p-3 ${board.card}`}
          >
            <Link href={categoryHref(board.id)} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${board.mark}`}
                >
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {board.title}
                  </span>
                  <span className="block text-xs text-ink3">View all</span>
                </span>
              </span>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-ink2">
                {unread > 0 ? `${unread} new` : rows.length}
              </span>
            </Link>
            {rows.length === 0 ? (
              <p className="rounded-lg bg-white/70 px-3 py-3 text-sm text-ink2">{board.empty}</p>
            ) : (
              <ul className={LIST_SCROLL}>
                {rows.map((alert) => (
                  <li key={alert.id}>
                    <NoticeRow
                      alert={alert}
                      href={itemHref(alert)}
                      icon={iconFor(alert)}
                      onOpen={() => onOpen(alert)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function NoticeList({
  alerts,
  itemHref,
  iconFor,
  onOpen,
  onMarkRead,
}: {
  alerts: readonly RetailerAlert[];
  itemHref: (alert: RetailerAlert) => string;
  iconFor: (alert: RetailerAlert) => LucideIcon;
  onOpen: (alert: RetailerAlert) => void;
  onMarkRead: (alert: RetailerAlert) => void;
}): React.ReactElement {
  return (
    <ul className="grid gap-3">
      {alerts.map((alert) => {
        const Icon = iconFor(alert);
        return (
          <li
            key={alert.id}
            className={`grid gap-2 rounded-xl border border-line border-l-4 border-l-action bg-white p-4 sm:grid-cols-[1fr_auto] ${alert.isRead ? 'opacity-70' : ''}`}
          >
            <Link href={itemHref(alert)} onClick={() => onOpen(alert)} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-action-soft text-action">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-ink">{alert.title}</span>
                <span className="block text-sm text-ink2">{alert.body}</span>
                <span className="mt-1 block text-xs text-ink3">
                  {formatRelativeTime(alert.createdAt)} · {alert.isRead ? 'Read' : 'Unread'}
                </span>
              </span>
            </Link>
            {alert.isRead ? null : (
              <button
                type="button"
                className="min-h-11 text-sm text-ink2"
                onClick={() => onMarkRead(alert)}
              >
                Mark read
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NoticeRow({
  alert,
  href,
  icon: Icon,
  onOpen,
}: {
  alert: RetailerAlert;
  href: string;
  icon: LucideIcon;
  onOpen: () => void;
}): React.ReactElement {
  const request = alert.type === 'CONNECTION_REQUEST' || /request/i.test(alert.title);
  return (
    <Link
      href={href}
      onClick={onOpen}
      className={`flex min-h-11 items-start gap-2 rounded-lg px-2.5 py-2 ${
        request
          ? 'border border-danger bg-[linear-gradient(105deg,color-mix(in_srgb,var(--ow-red)_28%,white)_0%,var(--ow-red-soft)_42%,white_100%)]'
          : 'border border-white/80 bg-white/80 hover:bg-white'
      } ${alert.isRead ? 'opacity-70' : ''}`}
    >
      <span
        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${request ? 'bg-danger text-white' : 'bg-white text-ink2'}`}
      >
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">{alert.title}</span>
          {request ? (
            <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-xs font-medium text-white">
              Reply
            </span>
          ) : null}
        </span>
        <span className="line-clamp-1 block text-xs text-ink2">{alert.body}</span>
        <span className="mt-0.5 block text-sm text-ink3">
          {formatRelativeTime(alert.createdAt)}
        </span>
      </span>
    </Link>
  );
}
