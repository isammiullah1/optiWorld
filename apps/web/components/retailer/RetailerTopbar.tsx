'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

type RetailerTopbarProps = {
  title: string;
  unreadAlertCount: number;
  actions?: ReactNode;
};

export function RetailerTopbar({
  title,
  unreadAlertCount,
  actions,
}: RetailerTopbarProps): React.ReactElement {
  const alertLabel =
    unreadAlertCount > 0 ? `Notifications, ${unreadAlertCount} unread` : 'Notifications';

  return (
    <header className="flex h-14 items-center gap-3 border-b border-line bg-white px-3 print:hidden md:px-5">
      <h1 className="shrink-0 text-lg font-semibold text-ink">{title}</h1>
      <div className="flex-1" />
      <div className="ml-auto flex items-center gap-2">
        {actions}
        <Link
          href="/retailer/alerts"
          aria-label={alertLabel}
          className="relative grid h-11 w-11 place-items-center rounded-lg text-ink2 hover:bg-canvas"
        >
          <Bell size={18} aria-hidden="true" />
          {unreadAlertCount > 0 ? (
            <span
              className="absolute right-2 top-2 h-2 w-2 rounded-full bg-action"
              aria-hidden="true"
            />
          ) : null}
        </Link>
      </div>
    </header>
  );
}
