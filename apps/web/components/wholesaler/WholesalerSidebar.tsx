'use client';

import { Glasses } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { SignOutButton } from '@/components/auth/SignOutButton';

import {
  WHOLESALER_NAV,
  WHOLESALER_SECTIONS,
  isWholesalerNavActive,
  roleLabel,
} from './wholesaler-nav';

type WholesalerSidebarProps = {
  userName: string;
  role: string;
  orgName: string;
  pendingOrderCount: number;
};

export function WholesalerSidebar({
  userName,
  role,
  orgName,
  pendingOrderCount,
}: WholesalerSidebarProps): React.ReactElement {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col bg-navy text-white md:flex lg:w-[200px]">
      <div className="flex items-center gap-2 px-3 py-4 lg:px-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10">
          <Glasses size={16} aria-hidden="true" />
        </span>
        <span className="hidden min-w-0 lg:block">
          <span className="block truncate text-md font-semibold">OptiWorld</span>
          <span className="block text-xs uppercase tracking-wide text-white/60">Wholesaler</span>
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto px-2" aria-label="Wholesaler">
        {WHOLESALER_SECTIONS.map((section) => (
          <div key={section} className="mb-3">
            <p className="hidden px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-white/40 lg:block">
              {section}
            </p>
            <ul className="space-y-1">
              {WHOLESALER_NAV.filter((item) => item.section === section).map((item) => {
                const active = isWholesalerNavActive(pathname, item.href);
                const Icon = item.icon;
                const count = 'badge' in item && item.badge === 'pending' ? pendingOrderCount : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      title={item.label}
                      className={`relative flex min-h-11 items-center gap-2 rounded-lg px-2 text-base lg:px-3 ${
                        active
                          ? 'ow-nav-active text-white'
                          : 'text-white/75 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <span className="hidden truncate lg:inline">{item.label}</span>
                      <CountBadge count={count} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-2 lg:p-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-medium">
            {initials(userName)}
          </span>
          <span className="hidden min-w-0 flex-1 lg:block">
            <span className="block truncate text-sm font-medium">{orgName || 'Wholesaler'}</span>
            <span className="block truncate text-xs text-white/60">{roleLabel(role)}</span>
          </span>
        </div>
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0] ?? '').join('');
  return letters.toUpperCase() || 'OW';
}
