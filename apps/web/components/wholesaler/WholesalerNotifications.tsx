'use client';

import type { RetailerAlert } from '@optiworld/shared';
import {
  Bell,
  ClipboardList,
  FileWarning,
  Handshake,
  Package,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { NoticeBoards, NoticeList, type NoticeBoardDef } from '@/components/notices/NoticeBoards';

import {
  loadWholesalerAlerts,
  markAllWholesalerAlertsRead,
  markWholesalerAlertRead,
} from './wholesaler-alerts-api';

const LANES = ['ORDERS', 'CANCELLATIONS', 'UPDATES', 'CONNECTIONS', 'STOCK'] as const;
type WholesalerLane = (typeof LANES)[number];

const BOARDS: readonly NoticeBoardDef[] = [
  {
    id: 'ORDERS',
    title: 'Orders',
    empty: 'No new orders.',
    icon: ClipboardList,
    card: 'border-action bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-blue)_26%,white)_0%,white_48%,var(--ow-blue-soft)_100%)]',
    mark: 'bg-action-soft text-action',
  },
  {
    id: 'CANCELLATIONS',
    title: 'Cancellations',
    empty: 'No cancellation requests.',
    icon: FileWarning,
    card: 'border-danger bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-red)_16%,white)_0%,white_52%,var(--ow-red-soft)_100%)]',
    mark: 'bg-danger-soft text-danger',
  },
  {
    id: 'UPDATES',
    title: 'Order updates',
    empty: 'No order updates.',
    icon: Truck,
    card: 'border-teal bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-teal)_24%,white)_0%,white_46%,var(--ow-teal-soft)_100%)]',
    mark: 'bg-teal-soft text-teal',
  },
  {
    id: 'CONNECTIONS',
    title: 'Connections',
    empty: 'No connection requests.',
    icon: Handshake,
    card: 'border-navy bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-navy)_10%,white)_0%,white_55%,var(--ow-bg)_100%)]',
    mark: 'bg-white text-navy',
  },
  {
    id: 'STOCK',
    title: 'Low stock',
    empty: 'No stock warnings.',
    icon: Package,
    card: 'border-amber bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-amber)_26%,white)_0%,white_46%,var(--ow-amber-soft)_100%)]',
    mark: 'bg-amber-soft text-amber',
  },
];

export function WholesalerNotifications({
  category = 'ALL',
}: {
  category?: string;
}): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const lane = isLane(category) ? category : 'ALL';
  const [rows, setRows] = useState<RetailerAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    void loadWholesalerAlerts(token)
      .then((next) => {
        if (active) {
          setRows(next);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Notifications could not be loaded');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const visible = rows?.filter((row) => lane === 'ALL' || wholesalerLane(row) === lane) ?? [];
  const unread = rows?.some((row) => !row.isRead) ?? false;

  function replace(next: RetailerAlert): void {
    setRows((current) => current?.map((item) => (item.id === next.id ? next : item)) ?? null);
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">Notifications</h2>
          <p className="text-sm text-ink2">New orders, cancellations, and shop requests.</p>
        </div>
        <button
          type="button"
          disabled={!token || !unread}
          className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm text-ink2 disabled:opacity-50"
          onClick={() => {
            if (!token) {
              return;
            }
            void markAllWholesalerAlertsRead(token)
              .then(() => loadWholesalerAlerts(token))
              .then((next) => {
                setRows(next);
                setError(null);
              })
              .catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'Notifications could not be updated',
                );
              });
          }}
        >
          Mark all read
        </button>
      </div>
      {lane === 'ALL' ? null : (
        <div className="flex flex-wrap gap-2">
          <LaneLink id="ALL" current={lane} label="All" />
          {BOARDS.map((board) => (
            <LaneLink key={board.id} id={board.id} current={lane} label={board.title} />
          ))}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {rows === null && !error ? <div className="h-24 animate-pulse rounded-xl bg-white" /> : null}
      {rows && lane === 'ALL' ? (
        <NoticeBoards
          boards={BOARDS}
          grouped={groupWholesaler(rows)}
          categoryHref={(id) => `/wholesaler/notifications?category=${id}`}
          itemHref={wholesalerHref}
          iconFor={wholesalerIcon}
          onOpen={(alert) => {
            if (token && !alert.isRead) {
              void markWholesalerAlertRead(token, alert.id)
                .then(replace)
                .catch(() => undefined);
            }
          }}
        />
      ) : null}
      {rows && lane !== 'ALL' && visible.length === 0 ? (
        <section className="rounded-xl border border-line bg-white p-6 text-center">
          <Bell className="mx-auto text-ink3" size={20} aria-hidden="true" />
          <h3 className="mt-2 text-md font-semibold text-ink">
            {BOARDS.find((board) => board.id === lane)?.empty ?? 'No notifications'}
          </h3>
        </section>
      ) : null}
      {rows && lane !== 'ALL' && visible.length > 0 ? (
        <NoticeList
          alerts={visible}
          itemHref={wholesalerHref}
          iconFor={wholesalerIcon}
          onOpen={(alert) => {
            if (token && !alert.isRead) {
              void markWholesalerAlertRead(token, alert.id)
                .then(replace)
                .catch(() => undefined);
            }
          }}
          onMarkRead={(alert) => {
            if (!token) {
              return;
            }
            void markWholesalerAlertRead(token, alert.id)
              .then(replace)
              .catch(() => undefined);
          }}
        />
      ) : null}
    </section>
  );
}

function LaneLink({
  id,
  current,
  label,
}: {
  id: string;
  current: string;
  label: string;
}): React.ReactElement {
  const href =
    id === 'ALL' ? '/wholesaler/notifications' : `/wholesaler/notifications?category=${id}`;
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm ${
        current === id ? 'bg-action text-white' : 'border border-line bg-white text-ink2'
      }`}
    >
      {label}
    </Link>
  );
}

function isLane(value: string): value is WholesalerLane {
  return (LANES as readonly string[]).includes(value);
}

function groupWholesaler(
  alerts: readonly RetailerAlert[],
): Record<WholesalerLane, RetailerAlert[]> {
  const grouped: Record<WholesalerLane, RetailerAlert[]> = {
    ORDERS: [],
    CANCELLATIONS: [],
    UPDATES: [],
    CONNECTIONS: [],
    STOCK: [],
  };
  for (const alert of alerts) {
    grouped[wholesalerLane(alert)].push(alert);
  }
  return grouped;
}

function wholesalerLane(alert: RetailerAlert): WholesalerLane {
  if (alert.type === 'LOW_STOCK') {
    return 'STOCK';
  }
  if (alert.type === 'CONNECTION_REQUEST') {
    return 'CONNECTIONS';
  }
  if (/cancel/i.test(alert.title)) {
    return 'CANCELLATIONS';
  }
  if (alert.type === 'ORDER_DISPATCHED' || alert.type === 'ORDER_DELIVERED') {
    return 'UPDATES';
  }
  if (alert.type.startsWith('ORDER_')) {
    return 'ORDERS';
  }
  return 'UPDATES';
}

function wholesalerHref(alert: RetailerAlert): string {
  if (alert.type === 'CONNECTION_REQUEST') {
    return '/wholesaler/retailers';
  }
  if (alert.relatedEntityType === 'Order' && alert.relatedEntityId) {
    return `/wholesaler/orders/${alert.relatedEntityId}`;
  }
  if (alert.type.startsWith('ORDER_')) {
    return '/wholesaler/orders';
  }
  return '/wholesaler/notifications';
}

function wholesalerIcon(alert: RetailerAlert): LucideIcon {
  if (alert.type === 'LOW_STOCK') {
    return Package;
  }
  if (alert.type === 'CONNECTION_REQUEST') {
    return Handshake;
  }
  if (/cancel/i.test(alert.title)) {
    return FileWarning;
  }
  if (alert.type === 'ORDER_DISPATCHED' || alert.type === 'ORDER_DELIVERED') {
    return Truck;
  }
  return ClipboardList;
}
