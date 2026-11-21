'use client';

import type { LabFeature } from '@optiworld/shared';
import {
  BarChart3,
  Bell,
  Boxes,
  Columns3,
  Glasses,
  LayoutDashboard,
  Receipt,
  Settings,
  Tags,
  Users,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { SignOutButton } from '@/components/auth/SignOutButton';

import { loadLabProfile } from './lab-account-api';
import { LAB_NOTIFICATIONS_CHANGED, loadUnreadNotificationCount } from './lab-notifications-api';

const NAV = [
  { href: '/laboratory/dashboard', label: 'Dashboard', icon: LayoutDashboard, feature: null },
  { href: '/laboratory/jobs', label: 'Orders', icon: Columns3, feature: 'jobs' },
  { href: '/laboratory/bills', label: 'Lab bills', icon: Receipt, feature: 'jobs' },
  {
    href: '/laboratory/income',
    label: 'Income',
    icon: Wallet,
    feature: 'reports',
    adminOnly: true,
  },
  { href: '/laboratory/services', label: 'Our Services', icon: Tags, feature: null },
  {
    href: '/laboratory/notifications',
    label: 'Notifications',
    icon: Bell,
    feature: 'notifications',
  },
  { href: '/laboratory/inventory', label: 'Inventory', icon: Boxes, feature: 'inventory' },
  { href: '/laboratory/clients', label: 'Clients', icon: Users, feature: 'clients' },
  { href: '/laboratory/reports', label: 'Reports', icon: BarChart3, feature: 'reports' },
  { href: '/laboratory/settings', label: 'Settings', icon: Settings, feature: null },
] as const;

function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return '?';
  }
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function LaboratoryShell({
  userName,
  role,
  children,
}: {
  userName: string;
  role: string;
  children: React.ReactNode;
}): React.ReactElement {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [unread, setUnread] = useState(0);
  const [features, setFeatures] = useState<LabFeature[] | null>(null);
  const [labName, setLabName] = useState('');
  const title = NAV.find((item) => pathname.startsWith(item.href))?.label ?? 'Laboratory';

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    let active = true;
    void loadLabProfile(token)
      .then((profile) => {
        if (active) {
          setFeatures(profile.features);
          setLabName(profile.laboratory.name);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  const visibleNav = NAV.filter((item) => {
    if ('adminOnly' in item && item.adminOnly && role !== 'ADMIN') {
      return false;
    }
    if (item.feature === null || role === 'ADMIN') {
      return true;
    }
    return features?.includes(item.feature) ?? false;
  });

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    let active = true;
    const load = (): void => {
      void loadUnreadNotificationCount(token)
        .then((count) => {
          if (active) {
            setUnread(count);
          }
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 30_000);
    window.addEventListener(LAB_NOTIFICATIONS_CHANGED, load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener(LAB_NOTIFICATIONS_CHANGED, load);
    };
  }, [session?.accessToken]);

  return (
    <div className="h-dvh overflow-hidden bg-canvas text-ink lg:grid lg:grid-cols-[200px_1fr]">
      <aside className="hidden min-h-0 bg-navy text-white lg:flex lg:h-dvh lg:flex-col">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-4">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-action text-white"
            aria-hidden="true"
          >
            <Glasses size={18} />
          </span>
          <span className="min-w-0">
            {labName ? (
              <span className="block truncate text-md font-semibold text-white">{labName}</span>
            ) : (
              <span className="block h-4 w-28 rounded bg-white/10" />
            )}
            <span className="block text-xs uppercase tracking-wide text-white/60">Laboratory</span>
          </span>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3" aria-label="Laboratory">
          <ul className="space-y-1">
            {visibleNav.map((item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-2 rounded-lg px-3 text-base ${
                      active
                        ? 'bg-white/10 text-white'
                        : 'text-white/75 hover:bg-white/[0.08] hover:text-white'
                    }`}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.href === '/laboratory/notifications' && unread > 0 ? (
                      <span className="rounded-full bg-action px-1.5 py-0.5 text-xs font-medium leading-none text-white">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-white/10 px-3 py-3">
          <div className="flex items-center gap-2">
            <Link
              href="/laboratory/settings"
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
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">{userName}</span>
                <span className="block truncate text-xs text-white/60">
                  {role === 'ADMIN' ? 'Admin' : 'Technician'}
                </span>
              </span>
            </Link>
            <Link
              href="/laboratory/settings"
              aria-label="Settings"
              title="Settings"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/[0.08] hover:text-white"
            >
              <Settings size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="border-t border-white/10 p-3">
          <p className="px-2 text-center text-[12px] leading-4 text-white/60">
            Powered by OptiWorld
          </p>
          <SignOutButton variant="sidebar" />
        </div>
      </aside>
      <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 lg:px-5">
          <h1 className="text-lg font-semibold">{title}</h1>
          <div className="flex flex-wrap items-center justify-end gap-2 lg:hidden">
            <nav className="flex flex-wrap justify-end gap-2" aria-label="Laboratory">
              {visibleNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm text-action"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <SignOutButton variant="header" />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 lg:px-5 lg:py-4">{children}</div>
      </div>
    </div>
  );
}
