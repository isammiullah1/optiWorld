'use client';

import type { RetailerAlert } from '@optiworld/shared';
import {
  CircleMinus,
  CirclePlus,
  ClipboardList,
  FlaskConical,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

import { alertHref, alertIcon, groupAlerts, stockMark, type AlertLane } from './alert-lanes';
import { markAlertRead } from './alerts-api';
import { formatRelativeTime } from './dashboard-format';

const PREVIEW = 4;

const LANES: readonly {
  id: AlertLane;
  title: string;
  href: string;
  empty: string;
  icon: LucideIcon;
  card: string;
  mark: string;
}[] = [
  {
    id: 'orders',
    title: 'Order alerts',
    href: '/retailer/alerts?category=ORDERS',
    empty: 'No order updates.',
    icon: ClipboardList,
    card: 'border-action-soft bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-blue)_26%,white)_0%,white_48%,var(--ow-blue-soft)_100%)]',
    mark: 'bg-action-soft text-action',
  },
  {
    id: 'lab',
    title: 'Lab alerts',
    href: '/retailer/alerts?category=LAB_JOBS',
    empty: 'No laboratory updates.',
    icon: FlaskConical,
    card: 'border-teal-soft bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-teal)_24%,white)_0%,white_46%,var(--ow-teal-soft)_100%)]',
    mark: 'bg-teal-soft text-teal',
  },
  {
    id: 'stock',
    title: 'Stock alerts',
    href: '/retailer/alerts?category=LOW_STOCK',
    empty: 'No stock warnings.',
    icon: CircleMinus,
    card: 'border-amber-soft bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-amber)_26%,white)_0%,white_46%,var(--ow-amber-soft)_100%)]',
    mark: 'bg-amber-soft text-amber',
  },
];

export function AlertsPanel({ alerts }: { alerts: readonly RetailerAlert[] }): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const grouped = groupAlerts(alerts);

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-md font-semibold text-ink">Alerts</h2>
        <Link href="/retailer/alerts" className="text-sm text-action">
          All alerts
        </Link>
      </div>
      <div className="grid min-w-0 items-start gap-3 lg:grid-cols-3">
        {LANES.map((lane) => {
          const rows = grouped[lane.id];
          const Icon = lane.icon;
          return (
            <article
              key={lane.id}
              className={`grid min-w-0 content-start gap-3 overflow-hidden rounded-xl border p-4 ${lane.card}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${lane.mark}`}
                  >
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <h3 className="text-sm font-semibold text-ink">{lane.title}</h3>
                </div>
                <Link href={lane.href} className="text-xs font-medium text-ink2">
                  {rows.length}
                </Link>
              </div>
              {rows.length === 0 ? (
                <p className="rounded-lg bg-white/70 px-3 py-3 text-sm text-ink2">{lane.empty}</p>
              ) : (
                <ul className="grid min-w-0 gap-2">
                  {rows.slice(0, PREVIEW).map((alert) => (
                    <li key={alert.id} className="min-w-0">
                      <AlertLink alert={alert} token={token} />
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AlertLink({
  alert,
  token,
}: {
  alert: RetailerAlert;
  token: string | undefined;
}): React.ReactElement {
  const request = alert.type === 'CONNECTION_REQUEST';
  const Icon = alertIcon(alert.type);
  const stock = alert.type === 'LOW_STOCK' ? stockMark(alert.body) : null;

  return (
    <Link
      href={alertHref(alert)}
      onClick={() => {
        if (token && !alert.isRead) {
          void markAlertRead(token, alert.id).catch(() => undefined);
        }
      }}
      className={`flex min-h-11 min-w-0 items-start gap-2 overflow-hidden rounded-lg px-2.5 py-2 ${
        request
          ? 'border border-danger bg-[linear-gradient(105deg,color-mix(in_srgb,var(--ow-red)_28%,white)_0%,var(--ow-red-soft)_42%,white_100%)]'
          : 'border border-white/80 bg-white/80 hover:bg-white'
      }`}
    >
      <span
        className={`mt-0.5 grid h-7 shrink-0 place-items-center rounded-full ${
          stock ? 'min-w-7 px-1' : 'w-7'
        } ${request ? 'bg-danger text-white' : 'bg-white text-ink2'}`}
      >
        {stock ? <StockMark mark={stock} /> : <Icon size={15} aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            {alert.title}
          </span>
          {request ? (
            <span className="shrink-0 rounded-full bg-danger px-2 py-0.5 text-xs font-medium text-white">
              Reply
            </span>
          ) : null}
        </span>
        <span className="line-clamp-2 block break-words text-xs text-ink2">{alert.body}</span>
        <span className="mt-0.5 block text-sm text-ink3">
          {formatRelativeTime(alert.createdAt)}
        </span>
      </span>
    </Link>
  );
}

function StockMark({
  mark,
}: {
  mark: { sign: '+' | '-'; count: string | null };
}): React.ReactElement {
  const label =
    mark.sign === '+'
      ? `Stock up to ${mark.count ?? ''}`.trim()
      : `Stock down to ${mark.count ?? ''}`.trim();
  return (
    <span
      className="inline-flex items-center gap-0.5 text-sm font-semibold leading-none text-amber"
      aria-label={label}
    >
      {mark.sign === '+' ? (
        <CirclePlus size={13} aria-hidden="true" />
      ) : (
        <CircleMinus size={13} aria-hidden="true" />
      )}
      {mark.count ? (
        <span>
          {mark.sign === '+' ? '+' : '−'}
          {mark.count}
        </span>
      ) : null}
    </span>
  );
}
