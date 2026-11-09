'use client';

import { LayoutDashboard, Menu, Tags, Users, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

import { SignOutButton } from '@/components/auth/SignOutButton';

import { WHOLESALER_ORDERS_CHANGED, loadWholesalerShell } from './wholesaler-api';
import { WholesalerSidebar } from './WholesalerSidebar';
import { isWholesalerNavActive, wholesalerPageTitle } from './wholesaler-nav';

type WholesalerShellProps = {
  userName: string;
  role: string;
  children: React.ReactNode;
};

export function WholesalerShell({
  userName,
  role,
  children,
}: WholesalerShellProps): React.ReactElement {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [orgName, setOrgName] = useState('');
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const refresh = (): void => {
      const token = session?.accessToken;
      if (!token) {
        return;
      }
      void loadWholesalerShell(token)
        .then((shell) => {
          setOrgName(shell.orgName);
          setPendingOrderCount(shell.pendingOrderCount);
        })
        .catch(() => undefined);
    };
    refresh();
    window.addEventListener(WHOLESALER_ORDERS_CHANGED, refresh);
    return () => window.removeEventListener(WHOLESALER_ORDERS_CHANGED, refresh);
  }, [pathname, session?.accessToken]);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <WholesalerSidebar
        userName={userName}
        role={role}
        orgName={orgName}
        pendingOrderCount={pendingOrderCount}
      />
      <div className="md:pl-16 lg:pl-[200px]">
        <header className="flex h-14 items-center border-b border-line bg-white px-3 md:px-5">
          <h1 className="text-lg font-semibold text-ink">{wholesalerPageTitle(pathname)}</h1>
        </header>
        <div className="px-3 py-3 pb-24 md:px-5 md:py-4 md:pb-4">{children}</div>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white md:hidden"
        aria-label="Wholesaler"
      >
        <Tab href="/wholesaler/dashboard" label="Home" icon={LayoutDashboard} pathname={pathname} />
        <Tab
          href="/wholesaler/orders"
          label="Orders"
          icon={ClipboardList}
          pathname={pathname}
          count={pendingOrderCount}
        />
        <Tab href="/wholesaler/catalog" label="Catalog" icon={Tags} pathname={pathname} />
        <Tab href="/wholesaler/retailers" label="Retailers" icon={Users} pathname={pathname} />
        <button
          type="button"
          className="flex min-h-11 flex-col items-center justify-center gap-0.5 text-xs text-ink2"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <Menu size={18} aria-hidden="true" />
          More
        </button>
      </nav>
      {moreOpen ? (
        <div className="fixed inset-x-0 bottom-14 z-20 border-t border-line bg-white p-3 md:hidden">
          <Link
            href="/wholesaler/price-control"
            className="block min-h-11 py-2 text-sm"
            onClick={() => setMoreOpen(false)}
          >
            Price Control
          </Link>
          <Link
            href="/wholesaler/reports"
            className="block min-h-11 py-2 text-sm"
            onClick={() => setMoreOpen(false)}
          >
            Reports
          </Link>
          <Link
            href="/wholesaler/profile"
            className="block min-h-11 py-2 text-sm"
            onClick={() => setMoreOpen(false)}
          >
            Profile
          </Link>
          <SignOutButton variant="menu" />
        </div>
      ) : null}
    </div>
  );
}

function Tab({
  href,
  label,
  icon: Icon,
  pathname,
  count = 0,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  pathname: string;
  count?: number;
}): React.ReactElement {
  const active = isWholesalerNavActive(pathname, href);
  return (
    <Link
      href={href}
      className={`relative flex min-h-11 flex-col items-center justify-center gap-0.5 text-xs ${
        active ? 'text-action' : 'text-ink2'
      }`}
    >
      <Icon size={18} aria-hidden="true" />
      {label}
      {count > 0 ? (
        <span className="absolute right-3 top-1 rounded-full bg-action px-1 text-xs text-white">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
