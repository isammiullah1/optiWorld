'use client';

import { type AlertCategory, type AlertType, type RetailerAlert } from '@optiworld/shared';
import {
  Banknote,
  Bell,
  CircleMinus,
  CirclePlus,
  ClipboardList,
  FileWarning,
  FlaskConical,
  Package,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { alertHref, alertIcon, stockMark } from './alert-lanes';

import { loadAgingReport, sendPaymentReminders } from './ledger-api';
import { ReminderDialog } from './ReminderDialog';
import { loadAlerts, markAlertRead, markAllAlertsRead } from './alerts-api';
import { formatRelativeTime } from './dashboard-format';
import type { AgingRow } from '@optiworld/shared';

const TABS: { id: AlertCategory; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'ORDERS', label: 'Orders' },
  { id: 'LAB_JOBS', label: 'Lab Jobs' },
  { id: 'PAYMENTS', label: 'Payment Dues' },
  { id: 'LOW_STOCK', label: 'Low Stock' },
  { id: 'REVIEWS', label: 'Needs review' },
];

const BOARDS: readonly {
  id: Exclude<AlertCategory, 'ALL'>;
  title: string;
  empty: string;
  icon: LucideIcon;
  card: string;
  mark: string;
}[] = [
  {
    id: 'ORDERS',
    title: 'Orders',
    empty: 'No order updates.',
    icon: ClipboardList,
    card: 'border-action bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-blue)_26%,white)_0%,white_48%,var(--ow-blue-soft)_100%)]',
    mark: 'bg-action-soft text-action',
  },
  {
    id: 'LAB_JOBS',
    title: 'Lab jobs',
    empty: 'No laboratory updates.',
    icon: FlaskConical,
    card: 'border-teal bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-teal)_24%,white)_0%,white_46%,var(--ow-teal-soft)_100%)]',
    mark: 'bg-teal-soft text-teal',
  },
  {
    id: 'PAYMENTS',
    title: 'Payment dues',
    empty: 'No payment alerts.',
    icon: Banknote,
    card: 'border-danger bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-red)_16%,white)_0%,white_52%,var(--ow-red-soft)_100%)]',
    mark: 'bg-danger-soft text-danger',
  },
  {
    id: 'LOW_STOCK',
    title: 'Low stock',
    empty: 'No stock warnings.',
    icon: CircleMinus,
    card: 'border-amber bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-amber)_26%,white)_0%,white_46%,var(--ow-amber-soft)_100%)]',
    mark: 'bg-amber-soft text-amber',
  },
  {
    id: 'REVIEWS',
    title: 'Needs review',
    empty: 'No sales waiting for review.',
    icon: FileWarning,
    card: 'border-navy bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-navy)_10%,white)_0%,white_55%,var(--ow-bg)_100%)]',
    mark: 'bg-white text-navy',
  },
];

const EMPTY_COPY: Record<AlertCategory, { title: string; body: string }> = {
  ALL: { title: 'No alerts', body: 'Shop notices will show up here.' },
  LOW_STOCK: {
    title: 'No low stock alerts',
    body: 'Items at or below their threshold will show up here.',
  },
  PAYMENTS: { title: 'No payment alerts', body: 'Due and overdue balances will show up here.' },
  LAB_JOBS: { title: 'No lab job alerts', body: 'Laboratory updates will show up here.' },
  ORDERS: { title: 'No order alerts', body: 'Wholesaler order updates will show up here.' },
  REVIEWS: {
    title: 'No sales to review',
    body: 'Offline sales that need a check will show up here.',
  },
};

export function AlertsDashboard({
  initialCategory = 'ALL',
}: {
  initialCategory?: AlertCategory;
}): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const isOwner = session?.user.role === 'OWNER';
  const [category, setCategory] = useState<AlertCategory>(initialCategory);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);
  const [alerts, setAlerts] = useState<RetailerAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dues, setDues] = useState<AgingRow[] | null>(null);
  const [remindIds, setRemindIds] = useState<string[] | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    setAlerts(null);
    void loadAlerts(token, category)
      .then((rows) => {
        setAlerts(rows);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Alerts could not be loaded');
      });
  }, [category, token]);

  const unread = alerts?.some((alert) => !alert.isRead) ?? false;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Alerts</h1>
          <p className="text-sm text-ink2">Notices for stock, payments, lab jobs, and orders.</p>
        </div>
        <button
          type="button"
          disabled={!token || !unread}
          onClick={() => {
            if (!token) {
              return;
            }
            void markAllAlertsRead(token)
              .then(() => loadAlerts(token, category))
              .then((rows) => {
                setAlerts(rows);
                setError(null);
              })
              .catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : 'Alerts could not be updated');
              });
          }}
          className="min-h-[44px] rounded-lg border border-line bg-white px-4 text-sm text-ink2 disabled:opacity-50"
        >
          Mark all read
        </button>
      </div>
      {category === 'ALL' ? null : (
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              href={tab.id === 'ALL' ? '/retailer/alerts' : `/retailer/alerts?category=${tab.id}`}
              className={`inline-flex min-h-[44px] items-center rounded-full px-3 text-sm ${
                category === tab.id
                  ? 'bg-action text-white'
                  : 'border border-line bg-white text-ink2'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {alerts === null && !error ? (
        <div className="h-24 animate-pulse rounded-xl bg-white" />
      ) : null}
      {category === 'ALL' && alerts ? <AlertBoards alerts={alerts} token={token} /> : null}
      {category !== 'ALL' && alerts?.length === 0 ? (
        <section className="rounded-xl border border-line bg-white p-6 text-center">
          <h2 className="text-md font-semibold text-ink">{EMPTY_COPY[category].title}</h2>
          <p className="text-sm text-ink2">{EMPTY_COPY[category].body}</p>
        </section>
      ) : null}
      {category === 'ALL' ? null : (
        <ul className="grid gap-3">
          {alerts?.map((alert) => (
            <li
              key={alert.id}
              className={`grid gap-2 rounded-xl border border-line border-l-4 bg-white p-4 sm:grid-cols-[1fr_auto] ${borderClass(alert.type)} ${
                alert.isRead ? 'opacity-70' : ''
              }`}
            >
              <div className="flex gap-3">
                <AlertIcon type={alert.type} />
                <div>
                  <p className="text-sm font-semibold text-ink">{alert.title}</p>
                  <p className="text-sm text-ink2">{alert.body}</p>
                  <p className="mt-1 text-xs text-ink3">
                    {formatRelativeTime(alert.createdAt)} · {alert.isRead ? 'Read' : 'Unread'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AlertAction
                  alert={alert}
                  isOwner={isOwner}
                  onRemind={(customerId) => {
                    if (!token || !isOwner) {
                      return;
                    }
                    void openReminder(token, customerId, setDues, setRemindIds, setError);
                  }}
                />
                {alert.isRead ? null : (
                  <button
                    type="button"
                    className="min-h-[44px] text-sm text-ink2"
                    onClick={() => {
                      if (!token) {
                        return;
                      }
                      void markAlertRead(token, alert.id).then((next) => {
                        setAlerts(
                          (current) =>
                            current?.map((row) => (row.id === next.id ? next : row)) ?? null,
                        );
                      });
                    }}
                  >
                    Mark read
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {remindIds && dues ? (
        <ReminderDialog
          rows={dues}
          initialIds={remindIds}
          sending={sending}
          error={sendError}
          onClose={() => setRemindIds(null)}
          onSend={async (customerIds) => {
            if (!token) {
              return;
            }
            setSending(true);
            setSendError(null);
            try {
              await sendPaymentReminders(token, customerIds);
              setRemindIds(null);
            } catch (caught) {
              setSendError(
                caught instanceof Error ? caught.message : 'The reminder could not be sent',
              );
            } finally {
              setSending(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function AlertBoards({
  alerts,
  token,
}: {
  alerts: readonly RetailerAlert[];
  token: string | undefined;
}): React.ReactElement {
  const grouped = groupBoards(alerts);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {BOARDS.map((board) => {
        const rows = grouped[board.id];
        const Icon = board.icon;
        const unread = rows.filter((alert) => !alert.isRead).length;
        return (
          <article
            key={board.id}
            className={`group grid gap-2 rounded-xl border-2 p-3 ${board.card}`}
          >
            <Link
              href={`/retailer/alerts?category=${board.id}`}
              className="flex items-center justify-between gap-2"
            >
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
              <ul className="grid max-h-[14.875rem] gap-2 overflow-y-auto overscroll-y-contain pr-1 [scrollbar-color:transparent_transparent] [scrollbar-width:thin] group-hover:[scrollbar-color:color-mix(in_srgb,var(--ow-ink3)_90%,transparent)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent group-hover:[&::-webkit-scrollbar-thumb]:bg-[color-mix(in_srgb,var(--ow-ink3)_90%,transparent)]">
                {rows.map((alert) => (
                  <li key={alert.id}>
                    <BoardAlert alert={alert} token={token} />
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

function BoardAlert({
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
      className={`flex min-h-11 items-start gap-2 rounded-lg px-2.5 py-2 ${
        request
          ? 'border border-danger bg-[linear-gradient(105deg,color-mix(in_srgb,var(--ow-red)_28%,white)_0%,var(--ow-red-soft)_42%,white_100%)]'
          : 'border border-white/80 bg-white/80 hover:bg-white'
      } ${alert.isRead ? 'opacity-70' : ''}`}
    >
      <span
        className={`mt-0.5 grid h-7 shrink-0 place-items-center rounded-full ${stock ? 'min-w-7 px-1' : 'w-7'} ${request ? 'bg-danger text-white' : 'bg-white text-ink2'}`}
      >
        {stock ? <StockMark mark={stock} /> : <Icon size={15} aria-hidden="true" />}
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

function groupBoards(
  alerts: readonly RetailerAlert[],
): Record<Exclude<AlertCategory, 'ALL'>, RetailerAlert[]> {
  const grouped: Record<Exclude<AlertCategory, 'ALL'>, RetailerAlert[]> = {
    LOW_STOCK: [],
    PAYMENTS: [],
    LAB_JOBS: [],
    ORDERS: [],
    REVIEWS: [],
  };
  for (const alert of alerts) {
    grouped[boardOf(alert.type)].push(alert);
  }
  grouped.LAB_JOBS.sort(
    (left, right) =>
      Number(right.type === 'CONNECTION_REQUEST') - Number(left.type === 'CONNECTION_REQUEST'),
  );
  return grouped;
}

function boardOf(type: AlertType): Exclude<AlertCategory, 'ALL'> {
  if (type === 'LOW_STOCK') {
    return 'LOW_STOCK';
  }
  if (type === 'PAYMENT_DUE' || type === 'PAYMENT_OVERDUE') {
    return 'PAYMENTS';
  }
  if (type === 'LAB_JOB_STATUS' || type === 'LAB_JOB_READY' || type === 'CONNECTION_REQUEST') {
    return 'LAB_JOBS';
  }
  if (type === 'INVOICE_REVIEW') {
    return 'REVIEWS';
  }
  return 'ORDERS';
}

function AlertAction({
  alert,
  isOwner,
  onRemind,
}: {
  alert: RetailerAlert;
  isOwner: boolean;
  onRemind: (customerId: string | null) => void;
}): React.ReactElement | null {
  if (alert.type === 'LOW_STOCK') {
    const href = alert.relatedEntityId
      ? `/retailer/inventory/${alert.relatedEntityId}`
      : '/retailer/inventory';
    return (
      <Link href={href} className="inline-flex min-h-[44px] items-center text-sm text-action">
        View inventory
      </Link>
    );
  }
  if (alert.type === 'PAYMENT_DUE' || alert.type === 'PAYMENT_OVERDUE') {
    if (!isOwner) {
      return null;
    }
    const customerId = alert.relatedEntityType === 'Customer' ? alert.relatedEntityId : null;
    return (
      <button
        type="button"
        className="min-h-[44px] text-sm text-action"
        onClick={() => onRemind(customerId)}
      >
        Send reminder
      </button>
    );
  }
  if (alert.type === 'CONNECTION_REQUEST') {
    return (
      <Link
        href="/retailer/laboratories"
        className="inline-flex min-h-[44px] items-center text-sm text-action"
      >
        Review request
      </Link>
    );
  }
  if (
    (alert.type === 'LAB_JOB_READY' || alert.type === 'LAB_JOB_STATUS') &&
    alert.relatedEntityId
  ) {
    return (
      <Link
        href={`/retailer/lab-jobs/${alert.relatedEntityId}`}
        className="inline-flex min-h-[44px] items-center text-sm text-action"
      >
        View job
      </Link>
    );
  }
  if (alert.type.startsWith('ORDER_') && alert.relatedEntityId) {
    return (
      <Link
        href={`/retailer/orders/${alert.relatedEntityId}`}
        className="inline-flex min-h-[44px] items-center text-sm text-action"
      >
        View order
      </Link>
    );
  }
  return null;
}

function AlertIcon({ type }: { type: AlertType }): React.ReactElement {
  const className = 'mt-0.5 h-4 w-4 shrink-0 text-ink2';
  if (type === 'LOW_STOCK') {
    return <Package className={className} aria-hidden="true" />;
  }
  if (type === 'PAYMENT_DUE' || type === 'PAYMENT_OVERDUE') {
    return <Bell className={className} aria-hidden="true" />;
  }
  if (type.startsWith('LAB_')) {
    return <FlaskConical className={className} aria-hidden="true" />;
  }
  return <ClipboardList className={className} aria-hidden="true" />;
}

function borderClass(type: AlertType): string {
  if (type === 'PAYMENT_OVERDUE') {
    return 'border-l-danger';
  }
  if (type === 'LOW_STOCK' || type === 'PAYMENT_DUE' || type === 'INVOICE_REVIEW') {
    return 'border-l-amber';
  }
  if (type === 'LAB_JOB_READY' || type === 'ORDER_DELIVERED' || type === 'ORDER_DISPATCHED') {
    return 'border-l-teal';
  }
  return 'border-l-action';
}

async function openReminder(
  token: string,
  customerId: string | null,
  setDues: (rows: AgingRow[]) => void,
  setRemindIds: (ids: string[]) => void,
  setError: (message: string | null) => void,
): Promise<void> {
  try {
    const report = await loadAgingReport(token);
    if (report.rows.length === 0) {
      setError('There are no outstanding balances to remind.');
      return;
    }
    setDues(report.rows);
    const match =
      customerId && report.rows.some((row) => row.customerId === customerId) ? [customerId] : [];
    setRemindIds(match);
    setError(null);
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : 'Reminders could not be opened');
  }
}
