'use client';

import {
  centsToMoney,
  moneyToCents,
  type OrderStatus,
  type RetailerOrderRow,
  type WholesalerConnection,
} from '@optiworld/shared';
import {
  Ban,
  Banknote,
  Calendar,
  Check,
  Clock,
  Eye,
  LayoutGrid,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Truck,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import {
  cancelRetailerOrder,
  loadRetailerOrders,
  loadWholesalerConnections,
  requestRetailerOrderCancellation,
} from './catalog-api';
import { formatRupee, formatShortDate } from './dashboard-format';
import { orderStatusClass, orderStatusLabel } from './OrderProgress';

const PAGE_SIZES = [10, 20, 30, 40] as const;

const STATUS_FILTERS: ReadonlyArray<{
  id: 'ALL' | OrderStatus;
  label: string;
  icon: typeof LayoutGrid;
  idle: string;
  active: string;
}> = [
  {
    id: 'ALL',
    label: 'All',
    icon: LayoutGrid,
    idle: 'border border-ink3 bg-[color-mix(in_srgb,var(--ow-ink3)_18%,white)] text-ink2',
    active: 'border border-ink2 bg-ink2 text-white',
  },
  {
    id: 'PENDING',
    label: 'Pending',
    icon: Clock,
    idle: 'border border-amber bg-amber-soft text-amber',
    active: 'border border-amber bg-amber text-white',
  },
  {
    id: 'CONFIRMED',
    label: 'Confirmed',
    icon: Check,
    idle: 'border border-action bg-action-soft text-action',
    active: 'border border-action bg-action text-white',
  },
  {
    id: 'DISPATCHED',
    label: 'Dispatched',
    icon: Truck,
    idle: 'border border-teal bg-teal-soft text-teal',
    active: 'border border-teal bg-teal text-white',
  },
  {
    id: 'DELIVERED',
    label: 'Delivered',
    icon: PackageCheck,
    idle: 'border border-line bg-canvas text-ink2',
    active: 'border border-navy bg-navy text-white',
  },
  {
    id: 'CANCELLED',
    label: 'Cancelled',
    icon: Ban,
    idle: 'border border-danger bg-danger-soft text-danger',
    active: 'border border-danger bg-danger text-white',
  },
];

type Filters = {
  query: string;
  status: 'ALL' | OrderStatus;
  minAmount: string;
  maxAmount: string;
  from: string;
  to: string;
};

const EMPTY_FILTERS: Filters = {
  query: '',
  status: 'ALL',
  minAmount: '',
  maxAmount: '',
  from: '',
  to: '',
};

export function RetailerOrders(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [picking, setPicking] = useState(false);
  const [rows, setRows] = useState<RetailerOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    void loadRetailerOrders(token)
      .then((next) => {
        if (active) {
          setRows(next);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Orders could not be loaded');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const visibleRows = useMemo(
    () => (rows ?? []).filter((row) => matches(row, applied)),
    [applied, rows],
  );
  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visible = visibleRows.slice(pageStart, pageStart + pageSize);
  const liveRows = (rows ?? []).filter((row) => row.status !== 'CANCELLED');
  const quoted = liveRows.filter((row) => row.totalValue);
  const quotedCents = quoted.reduce((sum, row) => sum + moneyToCents(row.totalValue ?? '0.00'), 0);
  const onRequest = liveRows.length - quoted.length;

  useEffect(() => {
    setPage(1);
  }, [applied, pageSize]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Orders</h1>
          <p className="text-sm text-ink2">Orders placed with connected wholesalers.</p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-medium text-white"
          onClick={() => setPicking(true)}
        >
          <Plus size={16} aria-hidden="true" />
          New order
        </button>
      </div>
      {picking && token ? <NewOrderDialog token={token} onClose={() => setPicking(false)} /> : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {rows === null && !error ? <div className="h-24 animate-pulse rounded-xl bg-white" /> : null}
      {rows ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Orders"
              value={String(liveRows.length)}
              card={BLUE_CARD}
              mark="bg-action-soft text-action"
              icon={LayoutGrid}
            />
            <SummaryCard
              label="Pending"
              value={String(liveRows.filter((row) => row.status === 'PENDING').length)}
              card={AMBER_CARD}
              mark="bg-amber-soft text-amber"
              icon={Clock}
            />
            <SummaryCard
              label="Delivered"
              value={String(liveRows.filter((row) => row.status === 'DELIVERED').length)}
              card={TEAL_CARD}
              mark="bg-teal-soft text-teal"
              icon={PackageCheck}
            />
            <SummaryCard
              label="Quoted total"
              value={formatRupee(centsToMoney(quotedCents))}
              detail={onRequest > 0 ? `${onRequest} on request` : undefined}
              card={NAVY_CARD}
              mark="bg-white text-navy"
              icon={Banknote}
            />
          </div>
          <section className="rounded-xl border border-action-soft bg-white">
            <form
              className="grid gap-2 border-b border-action-soft bg-canvas px-3 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                setApplied(draft);
              }}
            >
              <div className="flex items-end gap-2">
                <label className="grid min-w-0 flex-1 gap-1 text-xs text-ink2">
                  Search orders
                  <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3">
                    <Search size={16} className="text-action" aria-hidden="true" />
                    <input
                      aria-label="Search orders"
                      value={draft.query}
                      onChange={(event) => {
                        const query = event.target.value;
                        setDraft((current) => ({ ...current, query }));
                        setApplied((current) => ({ ...current, query }));
                      }}
                      placeholder="Order number, wholesaler, or product"
                      className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
                    />
                  </span>
                </label>
                <button
                  type="submit"
                  className="h-9 shrink-0 rounded-lg bg-action px-4 text-sm font-medium text-white"
                >
                  Apply filters
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field
                  label="From"
                  icon={<Calendar size={14} className="text-teal" aria-hidden="true" />}
                >
                  <input
                    aria-label="Orders from"
                    type="date"
                    value={draft.from}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, from: event.target.value }))
                    }
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="To"
                  icon={<Calendar size={14} className="text-teal" aria-hidden="true" />}
                >
                  <input
                    aria-label="Orders to"
                    type="date"
                    value={draft.to}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, to: event.target.value }))
                    }
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Amount from"
                  icon={<Banknote size={14} className="text-amber" aria-hidden="true" />}
                >
                  <input
                    aria-label="Amount from"
                    inputMode="decimal"
                    value={draft.minAmount}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, minAmount: event.target.value }))
                    }
                    placeholder="0"
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Amount up to"
                  icon={<Banknote size={14} className="text-amber" aria-hidden="true" />}
                >
                  <input
                    aria-label="Amount up to"
                    inputMode="decimal"
                    value={draft.maxAmount}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, maxAmount: event.target.value }))
                    }
                    placeholder="Any"
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Order status">
                {STATUS_FILTERS.map((option) => {
                  const Icon = option.icon;
                  const selected = draft.status === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setDraft((current) => ({ ...current, status: option.id }));
                        setApplied((current) => ({ ...current, status: option.id }));
                      }}
                      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ${selected ? option.active : option.idle}`}
                    >
                      <Icon size={14} aria-hidden="true" />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="bg-navy text-left">
                    {['Order #', 'Wholesaler', 'Items', 'Status', 'Total', 'Date', 'Actions'].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-white"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-sm text-ink2">
                        No orders match these filters.
                      </td>
                    </tr>
                  ) : (
                    visible.map((row) => (
                      <OrderRow
                        key={row.id}
                        row={row}
                        token={token}
                        onChanged={() => {
                          if (!token) {
                            return;
                          }
                          void loadRetailerOrders(token)
                            .then(setRows)
                            .catch((caught: unknown) => {
                              setError(
                                caught instanceof Error
                                  ? caught.message
                                  : 'Orders could not be loaded',
                              );
                            });
                        }}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink2">
              <p>
                {visible.length} of {visibleRows.length}
              </p>
              <label className="inline-flex items-center gap-2">
                Show
                <select
                  aria-label="Orders per page"
                  value={pageSize}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (next === 10 || next === 20 || next === 30 || next === 40) {
                      setPageSize(next);
                    }
                  }}
                  className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-action"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                  className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink disabled:text-ink3"
                >
                  Next
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function OrderRow({
  row,
  token,
  onChanged,
}: {
  row: RetailerOrderRow;
  token: string | undefined;
  onChanged: () => void;
}): React.ReactElement {
  const products = row.products ?? [];
  const [ask, setAsk] = useState<'cancel' | 'request' | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-2 text-sm font-semibold">
        <Link href={`/retailer/orders/${row.id}`} className="text-action">
          #{row.reference}
        </Link>
      </td>
      <td className="px-3 py-2">
        <p className="text-sm font-medium text-ink">{row.wholesalerName}</p>
        {products.length > 0 ? <p className="text-xs text-ink3">{products.join(', ')}</p> : null}
      </td>
      <td className="px-3 py-2 text-sm text-ink">{row.itemCount}</td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusClass(row.status)}`}
        >
          {orderStatusLabel(row.status)}
        </span>
      </td>
      <td className="px-3 py-2">
        {row.totalValue ? (
          <span className="text-sm font-medium text-ink">{formatRupee(row.totalValue)}</span>
        ) : (
          <span className="inline-flex rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">
            Price on request
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-sm text-ink2">{formatShortDate(row.createdAt)}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <Link
            href={`/retailer/orders/${row.id}`}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-medium text-action"
          >
            <Eye size={14} aria-hidden="true" />
            View
          </Link>
          {row.status === 'PENDING' ? (
            <>
              <Link
                href={`/retailer/orders/${row.id}#edit`}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-medium text-action"
              >
                <Pencil size={14} aria-hidden="true" />
                Edit
              </Link>
              <button
                type="button"
                onClick={() => setAsk('cancel')}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-medium text-danger"
              >
                <Ban size={14} aria-hidden="true" />
                Cancel
              </button>
            </>
          ) : null}
          {row.status === 'CONFIRMED' ? (
            <>
              <Link
                href={`/retailer/orders/${row.id}#propose`}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-medium text-action"
              >
                <Pencil size={14} aria-hidden="true" />
                Propose change
              </Link>
              <button
                type="button"
                onClick={() => setAsk('request')}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-medium text-danger"
              >
                <Ban size={14} aria-hidden="true" />
                Request cancellation
              </button>
            </>
          ) : null}
        </div>
        {note ? <p className="mt-1 text-xs text-ink2">{note}</p> : null}
        {ask && token ? (
          <div
            className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              className="grid w-full max-w-md gap-3 rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
            >
              <h2 className="text-lg font-semibold text-ink">
                {ask === 'cancel' ? 'Cancel this order?' : 'Ask the wholesaler to cancel?'}
              </h2>
              <p className="text-sm text-ink2">
                {ask === 'cancel'
                  ? 'This pending order is cancelled now. The wholesaler sees that in the order chat.'
                  : 'A confirmed order stays in place until the wholesaler accepts. They are asked on WhatsApp to call you and discuss it. They can also keep the current order.'}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAsk(null)}
                  className="min-h-11 flex-1 rounded-lg border border-line text-sm text-ink2"
                >
                  Keep order
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    const action =
                      ask === 'cancel'
                        ? cancelRetailerOrder(token, row.id).then(() => 'The order was cancelled.')
                        : requestRetailerOrderCancellation(token, row.id);
                    void action
                      .then((message) => {
                        setAsk(null);
                        setNote(message);
                        onChanged();
                      })
                      .catch((caught: unknown) => {
                        setNote(
                          caught instanceof Error
                            ? caught.message
                            : 'The order could not be updated',
                        );
                      })
                      .finally(() => setBusy(false));
                  }}
                  className="min-h-11 flex-1 rounded-lg bg-danger text-sm font-medium text-white disabled:opacity-60"
                >
                  {busy ? 'Saving…' : ask === 'cancel' ? 'Cancel order' : 'Request cancellation'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </td>
    </tr>
  );
}

function NewOrderDialog({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}): React.ReactElement {
  const router = useRouter();
  const [rows, setRows] = useState<WholesalerConnection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadWholesalerConnections(token)
      .then((next) => {
        if (!active) {
          return;
        }
        setRows(
          next
            .filter((row) => row.status === 'APPROVED')
            .sort((left, right) => left.wholesalerName.localeCompare(right.wholesalerName)),
        );
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Wholesalers could not be loaded');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const chosen = rows?.find((row) => row.wholesalerOrgId === selected) ?? null;
  const catalogHidden = chosen?.visibilityMode === 'CATALOG_HIDDEN';

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-order-title"
        className="grid max-h-[92vh] w-full max-w-lg gap-3 overflow-y-auto rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!chosen || catalogHidden) {
            return;
          }
          router.push(`/retailer/wholesalers/${chosen.wholesalerOrgId}/catalog`);
        }}
      >
        <div>
          <h2 id="new-order-title" className="text-lg font-semibold text-ink">
            New order
          </h2>
          <p className="mt-1 text-sm text-ink2">
            Choose a connected wholesaler. Their catalog opens next so you can add products and
            submit the order.
          </p>
        </div>
        {error ? (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {rows === null && !error ? (
          <div className="h-24 animate-pulse rounded-xl bg-canvas" aria-busy="true" />
        ) : null}
        {rows && rows.length === 0 ? (
          <p className="rounded-lg border border-line bg-canvas p-3 text-sm text-ink2">
            No connected wholesalers yet.{' '}
            <Link
              href="/retailer/wholesalers"
              className="font-medium text-action"
              onClick={onClose}
            >
              Connect a wholesaler
            </Link>
          </p>
        ) : null}
        {rows && rows.length > 0 ? (
          <div className="grid gap-2" role="radiogroup" aria-label="Wholesaler">
            {rows.map((row) => {
              const active = selected === row.wholesalerOrgId;
              return (
                <button
                  key={row.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`rounded-xl border px-3 py-2 text-left ${active ? 'border-action bg-action-soft' : 'border-line bg-white'}`}
                  onClick={() => setSelected(row.wholesalerOrgId)}
                >
                  <span className="block text-sm font-medium text-ink">{row.wholesalerName}</span>
                  <span className="mt-0.5 block text-xs text-ink2">
                    {[row.city, visibilityLabel(row.visibilityMode)].filter(Boolean).join(' · ')}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        {catalogHidden ? (
          <p className="rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber">
            This wholesaler has hidden the catalog. Contact them directly to place an order.
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-lg border border-line text-sm text-ink2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!chosen || catalogHidden}
            className="min-h-11 flex-1 rounded-lg bg-action text-sm font-medium text-white disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </form>
    </div>
  );
}

function visibilityLabel(mode: WholesalerConnection['visibilityMode']): string {
  if (mode === 'CATALOG_HIDDEN') {
    return 'Catalog hidden';
  }
  if (mode === 'PRICES_HIDDEN') {
    return 'Prices on request';
  }
  return 'Prices visible';
}

function SummaryCard({
  label,
  value,
  detail,
  card,
  mark,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string;
  card: string;
  mark: string;
  icon: typeof LayoutGrid;
}): React.ReactElement {
  return (
    <section className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${card}`}>
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${mark}`}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-ink3">{label}</p>
        <p className="text-md font-semibold leading-tight text-ink">{value}</p>
        {detail ? <p className="text-xs leading-tight text-amber">{detail}</p> : null}
      </div>
    </section>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-xs text-ink2">
      <span className="inline-flex items-center gap-1">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function matches(row: RetailerOrderRow, filters: Filters): boolean {
  const day = row.createdAt.slice(0, 10);
  if (filters.from && day < filters.from) {
    return false;
  }
  if (filters.to && day > filters.to) {
    return false;
  }
  if (filters.status !== 'ALL' && row.status !== filters.status) {
    return false;
  }
  const min = numberOrNull(filters.minAmount);
  const max = numberOrNull(filters.maxAmount);
  if (min !== null || max !== null) {
    if (!row.totalValue) {
      return false;
    }
    const total = Number(row.totalValue);
    if (min !== null && total < min) {
      return false;
    }
    if (max !== null && total > max) {
      return false;
    }
  }
  const query = filters.query.trim().toLowerCase();
  if (!query) {
    return true;
  }
  const haystack = [row.reference, row.wholesalerName, ...(row.products ?? [])]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

const TEAL_CARD =
  'border-teal bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-teal)_18%,white)_0%,white_52%,var(--ow-teal-soft)_100%)]';
const NAVY_CARD =
  'border-navy bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-navy)_10%,white)_0%,white_55%,var(--ow-bg)_100%)]';
const BLUE_CARD =
  'border-action bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-blue)_22%,white)_0%,white_50%,var(--ow-blue-soft)_100%)]';
const AMBER_CARD =
  'border-amber bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-amber)_22%,white)_0%,white_50%,var(--ow-amber-soft)_100%)]';

const inputClass =
  'h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-action';
