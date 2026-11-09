'use client';

import { signOut, useSession } from 'next-auth/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/organisations', label: 'Organisations' },
  { href: '/subscriptions', label: 'Subscriptions' },
  { href: '/users', label: 'Users' },
  { href: '/health', label: 'Health' },
] as const;

export function AppFrame({ children }: { children: ReactNode }): React.ReactElement {
  const pathname = usePathname();
  if (pathname === '/' || pathname === '/login' || pathname.startsWith('/admin')) {
    return <>{children}</>;
  }
  return <AdminShell>{children}</AdminShell>;
}

function AdminShell({ children }: { children: ReactNode }): React.ReactElement {
  const pathname = usePathname();
  const { data } = useSession();
  const name = data?.user.name ?? 'Platform admin';
  const title = pageTitle(pathname);

  return (
    <div className="min-h-screen bg-canvas md:flex">
      <aside className="hidden w-[200px] shrink-0 flex-col bg-admin text-white md:flex">
        <div className="px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-white/50">OptiWorld</p>
          <p className="mt-1 text-md font-semibold">Super admin</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="Admin">
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(pathname, item.href)}
            />
          ))}
        </nav>
        <UserChip name={name} />
      </aside>
      <div className="min-w-0 flex-1">
        <nav className="flex gap-2 overflow-x-auto bg-admin px-3 py-2 md:hidden" aria-label="Admin">
          {NAV.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(pathname, item.href)}
            />
          ))}
        </nav>
        <header className="flex items-center justify-between border-b border-line bg-white px-5 py-3">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          <button
            type="button"
            className="text-sm text-purp md:hidden"
            onClick={() => void signOutAdmin()}
          >
            Sign out
          </button>
        </header>
        <main className="px-5 py-4">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}): React.ReactElement {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-2 text-sm ${active ? 'bg-purp text-white' : 'text-white/80 hover:bg-white/10'}`}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </Link>
  );
}

function UserChip({ name }: { name: string }): React.ReactElement {
  const initials = name
    .split(' ')
    .map((part) => part.slice(0, 1))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="border-t border-white/10 px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purp text-xs font-medium text-white">
          {initials || 'SA'}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm text-white">{name}</p>
          <p className="text-xs uppercase tracking-wide text-white/50">Super admin</p>
        </div>
      </div>
      <button
        type="button"
        className="mt-3 min-h-11 w-full rounded-lg text-left text-sm text-white/80"
        onClick={() => void signOutAdmin()}
      >
        Sign out
      </button>
    </div>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === '/dashboard';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function pageTitle(pathname: string): string {
  if (pathname.startsWith('/organisations/new')) {
    return 'Add organisation';
  }
  if (pathname.startsWith('/organisations/')) {
    return 'Organisation';
  }
  const match = NAV.find((item) => isActive(pathname, item.href));
  return match?.label ?? 'Super admin';
}

async function signOutAdmin(): Promise<void> {
  await fetch('/api/logout', { method: 'POST' });
  await signOut({ callbackUrl: '/login' });
}
