'use client';

import { RetailerShellSchema, type RetailerFeature } from '@optiworld/shared';
import { Home, Menu, Package, Receipt, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { POS_CHANGED_EVENT, readPosSnapshot } from '@/lib/offline/pos-db';
import { syncPos } from '@/lib/offline/sync-client';

import { SignOutButton } from '@/components/auth/SignOutButton';

import { ALERTS_CHANGED_EVENT } from './alerts-api';
import { loadRetailerProfile } from './retailer-account-api';
import { OfflineBanner } from './offline-banner';
import { RetailerSidebar } from './RetailerSidebar';
import { RetailerTopbar } from './RetailerTopbar';
import {
  RETAILER_SECTIONS,
  canSeeRetailerNav,
  isMoreTabActive,
  isRetailerNavActive,
  retailerPageTitle,
} from './retailer-nav';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ShellResponseSchema = z.object({
  success: z.literal(true),
  data: RetailerShellSchema,
});

type RetailerShellProps = {
  userName: string;
  role: string;
  children: React.ReactNode;
};

export function RetailerShell({
  userName,
  role,
  children,
}: RetailerShellProps): React.ReactElement {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [orgName, setOrgName] = useState('');
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [activeJobCount, setActiveJobCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingLabRequestCount, setPendingLabRequestCount] = useState(0);
  const [features, setFeatures] = useState<RetailerFeature[] | null>(null);
  const [online, setOnline] = useState(true);
  const [syncingLabel, setSyncingLabel] = useState<string | null>(null);
  const accessTokenRef = useRef<string | undefined>(undefined);
  accessTokenRef.current = session?.accessToken;
  const [moreOpen, setMoreOpen] = useState(false);
  const [alertTick, setAlertTick] = useState(0);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    let active = true;
    void loadRetailerProfile(token)
      .then((profile) => {
        if (active) {
          setFeatures(profile.features);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    const refresh = (): void => setAlertTick((current) => current + 1);
    window.addEventListener(ALERTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(ALERTS_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    let active = true;
    void fetch(`${API_BASE}/api/v1/retailer/shell`, {
      headers: { authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        const parsed = ShellResponseSchema.safeParse(payload);
        if (!active || !response.ok || !parsed.success) {
          return;
        }
        setOrgName(parsed.data.data.orgName);
        setUnreadAlertCount(parsed.data.data.unreadAlertCount);
        setActiveJobCount(parsed.data.data.activeJobCount);
        setPendingLabRequestCount(parsed.data.data.pendingLabRequestCount);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [alertTick, pathname, session?.accessToken]);

  useEffect(() => {
    let active = true;
    const refresh = (): void => {
      void readPosSnapshot().then((snapshot) => {
        if (!active) {
          return;
        }
        setPendingCount(
          snapshot.invoices.filter(
            (invoice) => invoice.syncStatus === 'PENDING' || invoice.syncStatus === 'SYNCING',
          ).length,
        );
      });
    };
    refresh();
    setOnline(navigator.onLine);
    const onOnline = (): void => {
      setOnline(true);
      const token = accessTokenRef.current;
      if (!token) {
        return;
      }
      void readPosSnapshot().then(async (snapshot) => {
        const pending = snapshot.invoices.filter(
          (invoice) => invoice.syncStatus === 'PENDING' || invoice.syncStatus === 'SYNCING',
        ).length;
        if (pending === 0) {
          return;
        }
        setSyncingLabel(`Back online — syncing ${pending} invoices...`);
        try {
          await syncPos(token);
        } catch {
          // The sale stays on this device until the next successful sync.
        } finally {
          setSyncingLabel(null);
        }
      });
    };
    const onOffline = (): void => {
      setSyncingLabel(null);
      setOnline(false);
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(POS_CHANGED_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(POS_CHANGED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const moreItems = RETAILER_SECTIONS.flatMap((section) => [...section.items]).filter((item) => {
    const inTabBar =
      item.href === '/retailer/dashboard' ||
      item.href.startsWith('/retailer/billing') ||
      item.href === '/retailer/customers' ||
      item.href === '/retailer/inventory';
    return !inTabBar && canSeeRetailerNav(item, role, features);
  });

  return (
    <div className="min-h-screen bg-canvas">
      <RetailerSidebar
        pathname={pathname}
        orgName={orgName}
        userName={userName}
        role={role}
        pendingCount={pendingCount}
        activeJobCount={activeJobCount}
        unreadAlertCount={unreadAlertCount}
        pendingLabRequestCount={pendingLabRequestCount}
        features={features}
      />
      <div className="flex min-h-screen flex-col print:pl-0 md:pl-16 lg:pl-[280px]">
        <RetailerTopbar title={retailerPageTitle(pathname)} unreadAlertCount={unreadAlertCount} />
        <OfflineBanner online={online} pendingCount={pendingCount} syncingLabel={syncingLabel} />
        <div className="flex-1 px-3 py-3 pb-24 md:px-5 md:py-4 md:pb-4">{children}</div>
      </div>
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white print:hidden md:hidden"
        aria-label="Primary"
      >
        {moreOpen ? (
          <div className="max-h-64 overflow-y-auto border-b border-line px-3 py-2">
            {moreItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex min-h-[44px] items-center text-md text-ink"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/retailer/settings"
              className="flex min-h-[44px] items-center text-md text-ink"
            >
              Settings
            </Link>
            <SignOutButton variant="menu" />
          </div>
        ) : null}
        <div className="grid grid-cols-5">
          <TabLink
            href="/retailer/dashboard"
            label="Home"
            icon={Home}
            active={pathname === '/retailer/dashboard'}
          />
          {role === 'OWNER' || features?.includes('billing') ? (
            <TabLink
              href="/retailer/billing/new"
              label="Bills"
              icon={Receipt}
              active={isRetailerNavActive(pathname, '/retailer/billing/new')}
            />
          ) : null}
          {role === 'OWNER' || features?.includes('customers') ? (
            <TabLink
              href="/retailer/customers"
              label="Customers"
              icon={Users}
              active={isRetailerNavActive(pathname, '/retailer/customers')}
            />
          ) : null}
          {role === 'OWNER' || features?.includes('inventory') ? (
            <TabLink
              href="/retailer/inventory"
              label="Inventory"
              icon={Package}
              active={isRetailerNavActive(pathname, '/retailer/inventory')}
            />
          ) : null}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-label="More"
            onClick={() => setMoreOpen((open) => !open)}
            className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-xs ${
              moreOpen || isMoreTabActive(pathname) ? 'text-action' : 'text-ink3'
            }`}
          >
            <Menu size={18} aria-hidden="true" />
            More
          </button>
        </div>
      </nav>
    </div>
  );
}

function TabLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}): React.ReactElement {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-xs ${
        active ? 'text-action' : 'text-ink3'
      }`}
    >
      <Icon size={18} aria-hidden="true" />
      {label}
    </Link>
  );
}
