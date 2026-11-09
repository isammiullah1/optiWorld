'use client';

import type { RetailerFeature } from '@optiworld/shared';
import { Glasses, Settings } from 'lucide-react';
import Link from 'next/link';

import { SignOutButton } from '@/components/auth/SignOutButton';

import {
  RETAILER_SECTIONS,
  canSeeRetailerNav,
  initials,
  isRetailerNavActive,
  roleLabel,
  type RetailerBadgeKey,
} from './retailer-nav';

type RetailerSidebarProps = {
  pathname: string;
  orgName: string;
  userName: string;
  role: string;
  pendingCount: number;
  activeJobCount: number;
  unreadAlertCount: number;
  pendingLabRequestCount: number;
  features: readonly RetailerFeature[] | null;
};

export function RetailerSidebar({
  pathname,
  orgName,
  userName,
  role,
  pendingCount,
  activeJobCount,
  unreadAlertCount,
  pendingLabRequestCount,
  features,
}: RetailerSidebarProps): React.ReactElement {
  const counts: Record<RetailerBadgeKey, number> = {
    pending: pendingCount,
    jobs: activeJobCount,
    alerts: unreadAlertCount,
    labs: pendingLabRequestCount,
  };
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col bg-navy print:hidden md:flex lg:w-[280px]">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-4 lg:px-4">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-action text-white"
          aria-hidden="true"
        >
          <Glasses size={18} />
        </span>
        <span className="hidden min-w-0 lg:block">
          {orgName ? (
            <span className="block truncate text-md font-semibold text-white">{orgName}</span>
          ) : (
            <span className="block h-4 w-28 rounded bg-white/10" />
          )}
          <span className="block text-xs uppercase tracking-wide text-white/60">Retailer</span>
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3" aria-label="Retailer">
        {RETAILER_SECTIONS.map((section) => (
          <div key={section.label} className="mt-3">
            <p className="hidden px-2 pb-1 text-xs font-medium uppercase tracking-wide text-white/45 lg:block">
              {section.label}
            </p>
            <ul className="grid gap-0.5">
              {section.items
                .filter((item) => canSeeRetailerNav(item, role, features))
                .map((item) => {
                  const active = isRetailerNavActive(pathname, item.href);
                  const count = item.badge ? counts[item.badge] : 0;
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        title={item.label}
                        className={`relative flex min-h-11 items-center gap-2 rounded-lg px-2 text-base lg:px-2 ${
                          active
                            ? 'ow-nav-active text-white'
                            : 'text-white/80 hover:bg-white/[0.08]'
                        }`}
                      >
                        <Icon
                          size={18}
                          className={active ? 'text-action' : 'text-white/70'}
                          aria-hidden="true"
                        />
                        <span className="hidden whitespace-nowrap lg:inline">{item.label}</span>
                        <CountBadge count={count} />
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 px-2 py-3 lg:px-3">
        <div className="flex items-center gap-2">
          <Link
            href="/retailer/profile"
            aria-label="Open profile"
            title="Profile"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 hover:bg-white/[0.08]"
          >
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-medium text-white"
              aria-hidden="true"
            >
              {initials(userName)}
            </span>
            <span className="hidden min-w-0 flex-1 lg:block">
              <span className="block truncate text-sm font-medium text-white">{userName}</span>
              <span className="block truncate text-xs text-white/60">{roleLabel(role)}</span>
            </span>
          </Link>
          <Link
            href="/retailer/settings"
            aria-label="Settings"
            title="Settings"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/[0.08] hover:text-white"
          >
            <Settings size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="border-t border-white/10 p-2 lg:p-3">
        <p className="hidden px-2 text-center text-[12px] leading-4 text-white/60 lg:block">
          Powered by OptiWorld
        </p>
        <SignOutButton variant="sidebar" />
      </div>
    </aside>
  );
}

function CountBadge({ count }: { count: number }): React.ReactElement | null {
  if (count <= 0) {
    return null;
  }
  const label = count > 99 ? '99+' : String(count);
  return (
    <span className="absolute right-1 top-1 rounded-full bg-action px-1.5 py-0.5 text-xs font-medium leading-none text-white lg:static lg:ml-auto">
      {label}
    </span>
  );
}
