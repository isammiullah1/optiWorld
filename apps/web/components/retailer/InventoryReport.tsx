'use client';

import { moneyToCents, type InventoryReport as InventoryReportData } from '@optiworld/shared';
import {
  AlertTriangle,
  ArrowLeftRight,
  Calendar,
  Layers,
  PackagePlus,
  Search,
  ShoppingBag,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { formatRupee, formatShortDate } from './dashboard-format';
import { defaultReportRange, downloadReport, loadInventoryReport } from './reports-api';

const PAGE_SIZES = [10, 20, 30, 40] as const;

const MOVEMENT_FILTERS = [
  {
    id: 'ALL',
    label: 'All',
    icon: Layers,
    idle: 'border border-ink3 bg-[color-mix(in_srgb,var(--ow-ink3)_18%,white)] text-ink2',
    active: 'border border-ink2 bg-ink2 text-white',
  },
  {
    id: 'SOLD',
    label: 'Sold',
    icon: ShoppingBag,
    idle: 'border border-amber bg-amber-soft text-amber',
    active: 'border border-amber bg-amber text-white',
  },
  {
    id: 'ADDED',
    label: 'Added',
    icon: PackagePlus,
    idle: 'border border-teal bg-teal-soft text-teal',
    active: 'border border-teal bg-teal text-white',
  },
  {
    id: 'BEST',
    label: 'Best selling',
    icon: Trophy,
    idle: 'border border-teal bg-teal-soft text-teal',
    active: 'border border-teal bg-teal text-white',
  },
  {
    id: 'PROFIT',
    label: 'Most profitable',
    icon: TrendingUp,
    idle: 'border border-action bg-action-soft text-action',
    active: 'border border-action bg-action text-white',
  },
  {
    id: 'LOW',
    label: 'Low stock',
    icon: AlertTriangle,
    idle: 'border border-danger bg-danger-soft text-danger',
    active: 'border border-danger bg-danger text-white',
  },
] as const;

type Movement = (typeof MOVEMENT_FILTERS)[number]['id'];

type ReportRow = InventoryReportData['rows'][number];
type DetailKind = 'SOLD' | 'MOVED' | 'LOW';

export function InventoryReport(): React.ReactElement {
  const { data: session, status } = useSession();
  const token = session?.accessToken;
  const isOwner = session?.user.role === 'OWNER';
  const initial = defaultReportRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [draftFrom, setDraftFrom] = useState(initial.from);
  const [draftTo, setDraftTo] = useState(initial.to);
  const [query, setQuery] = useState('');
  const [movement, setMovement] = useState<Movement>('ALL');
  const [report, setReport] = useState<InventoryReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [detail, setDetail] = useState<DetailKind | null>(null);

  useEffect(() => {
    if (!token || !isOwner || from > to) {
      return;
    }
    setReport(null);
    void loadInventoryReport(token, from, to)
      .then((next) => {
        setReport(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : 'The inventory report could not be loaded',
        );
      });
  }, [from, to, isOwner, token]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const lowStock = new Set(
      (report?.lowStockItems ?? []).flatMap((item) => (item.batchId ? [item.batchId] : [])),
    );
    const matched = (report?.rows ?? []).filter((row) => {
      if (movement === 'SOLD' && row.sold === 0) {
        return false;
      }
      if (movement === 'ADDED' && row.added === 0) {
        return false;
      }
      if (movement === 'BEST' && row.sold === 0) {
        return false;
      }
      if (movement === 'PROFIT' && moneyToCents(row.profit) <= 0) {
        return false;
      }
      if (movement === 'LOW' && !lowStock.has(row.batchId)) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        row.productName.toLowerCase().includes(needle) ||
        row.priceCode.toLowerCase().includes(needle)
      );
    });
    if (movement === 'BEST') {
      return [...matched].sort(
        (left, right) =>
          right.sold - left.sold || left.productName.localeCompare(right.productName),
      );
    }
    if (movement === 'PROFIT') {
      return [...matched].sort(
        (left, right) =>
          moneyToCents(right.profit) - moneyToCents(left.profit) ||
          left.productName.localeCompare(right.productName),
      );
    }
    return matched;
  }, [movement, query, report]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * pageSize;
  const visible = filtered.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, movement, pageSize, from, to]);

  if (status !== 'loading' && !isOwner) {
    return <p className="text-sm text-ink2">Stock movement is visible to the owner.</p>;
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold text-ink">Inventory movement</h1>
        <p className="text-sm text-ink2">
          Items sold, stock added, and low-stock events for this shop.
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {report === null && !error ? (
        <div className="grid gap-2 sm:grid-cols-3" aria-busy="true">
          <div className="h-14 animate-pulse rounded-xl border border-line bg-white" />
          <div className="h-14 animate-pulse rounded-xl border border-line bg-white" />
          <div className="h-14 animate-pulse rounded-xl border border-line bg-white" />
        </div>
      ) : null}
      {report ? (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <SummaryCard
              label="Items sold"
              value={String(report.itemsSold)}
              icon={ShoppingBag}
              card={TEAL_CARD}
              mark="bg-teal-soft text-teal"
              pressed={detail === 'SOLD'}
              onPress={() => setDetail('SOLD')}
            />
            <SummaryCard
              label="Units moved"
              value={String(report.unitsMoved)}
              icon={ArrowLeftRight}
              card={BLUE_CARD}
              mark="bg-action-soft text-action"
              pressed={detail === 'MOVED'}
              onPress={() => setDetail('MOVED')}
            />
            <SummaryCard
              label="Low stock events"
              value={String(report.lowStockEvents)}
              icon={AlertTriangle}
              card={report.lowStockEvents > 0 ? AMBER_CARD : NAVY_CARD}
              mark={report.lowStockEvents > 0 ? 'bg-amber-soft text-amber' : 'bg-white text-navy'}
              pressed={detail === 'LOW'}
              onPress={() => setDetail('LOW')}
            />
          </div>
          {detail ? (
            <MovementDetail report={report} kind={detail} onClose={() => setDetail(null)} />
          ) : null}
          <section className="overflow-hidden rounded-xl border border-line bg-white">
            <form
              className="grid gap-2 border-b border-action-soft bg-canvas px-3 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (draftFrom && draftTo && draftFrom <= draftTo) {
                  setFrom(draftFrom);
                  setTo(draftTo);
                }
              }}
            >
              <div className="flex items-end gap-2">
                <label className="grid min-w-0 flex-1 gap-1 text-xs text-ink2">
                  Search movement
                  <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3">
                    <Search size={16} className="text-action" aria-hidden="true" />
                    <input
                      aria-label="Search movement"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Product name or product code"
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
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => {
                    if (!token) {
                      return;
                    }
                    setExporting(true);
                    void downloadReport(token, 'INVENTORY', from, to, 'xlsx')
                      .catch((caught: unknown) => {
                        setError(
                          caught instanceof Error
                            ? caught.message
                            : 'The workbook could not be downloaded',
                        );
                      })
                      .finally(() => setExporting(false));
                  }}
                  className="h-9 shrink-0 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink2 disabled:opacity-50"
                >
                  {exporting ? 'Exporting…' : 'Export Excel'}
                </button>
                <button
                  type="button"
                  disabled={exporting}
                  onClick={() => {
                    if (!token) {
                      return;
                    }
                    setExporting(true);
                    void downloadReport(token, 'INVENTORY', from, to, 'pdf')
                      .catch((caught: unknown) => {
                        setError(
                          caught instanceof Error
                            ? caught.message
                            : 'The PDF could not be downloaded',
                        );
                      })
                      .finally(() => setExporting(false));
                  }}
                  className="h-9 shrink-0 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink2 disabled:opacity-50"
                >
                  {exporting ? 'Exporting…' : 'Export PDF'}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field
                  label="From"
                  icon={<Calendar size={14} className="text-teal" aria-hidden="true" />}
                >
                  <input
                    aria-label="From"
                    type="date"
                    value={draftFrom}
                    onChange={(event) => setDraftFrom(event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="To"
                  icon={<Calendar size={14} className="text-teal" aria-hidden="true" />}
                >
                  <input
                    aria-label="To"
                    type="date"
                    value={draftTo}
                    onChange={(event) => setDraftTo(event.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Movement">
                {MOVEMENT_FILTERS.map((filter) => {
                  const Icon = filter.icon;
                  const active = movement === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setMovement(filter.id)}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${active ? filter.active : filter.idle}`}
                    >
                      <Icon size={14} aria-hidden="true" />
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </form>
            {filtered.length === 0 ? (
              <div className="p-6">
                <h2 className="text-md font-semibold text-ink">No stock matches</h2>
                <p className="mt-1 text-sm text-ink2">
                  Change the search, the dates, or the movement filter.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead>
                    <tr className="bg-navy text-left">
                      {[
                        'Product',
                        'Opening',
                        'Added',
                        'Sold',
                        ...(movement === 'PROFIT' ? ['Profit'] : []),
                        'Closing',
                      ].map((heading) => (
                        <th
                          key={heading}
                          className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-white"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <MovementRow key={row.batchId} row={row} showProfit={movement === 'PROFIT'} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink2">
              <p>
                {visible.length} of {filtered.length}
              </p>
              <label className="inline-flex items-center gap-2">
                Show
                <select
                  aria-label="Rows per page"
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

function MovementRow({
  row,
  showProfit,
}: {
  row: ReportRow;
  showProfit: boolean;
}): React.ReactElement {
  return (
    <tr className="border-b border-line last:border-0 hover:bg-canvas">
      <td className="px-3 py-2">
        <Link
          href={`/retailer/inventory/${row.batchId}`}
          className="text-sm font-medium text-action"
        >
          {row.productName}
        </Link>
        <p className="text-xs text-ink3">{row.priceCode}</p>
      </td>
      <td className="px-3 py-2 text-sm text-ink2">{row.opening}</td>
      <td className="px-3 py-2 text-sm font-medium text-teal">{row.added}</td>
      <td className="px-3 py-2 text-sm font-medium text-amber">{row.sold}</td>
      {showProfit ? (
        <td className="px-3 py-2 text-sm font-medium text-action">{formatRupee(row.profit)}</td>
      ) : null}
      <td
        className={`px-3 py-2 text-sm font-semibold ${row.closing <= 0 ? 'text-danger' : 'text-ink'}`}
      >
        {row.closing}
      </td>
    </tr>
  );
}

const TEAL_CARD =
  'border-teal bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-teal)_18%,white)_0%,white_52%,var(--ow-teal-soft)_100%)]';
const NAVY_CARD =
  'border-navy bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-navy)_10%,white)_0%,white_55%,var(--ow-bg)_100%)]';
const BLUE_CARD =
  'border-action bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-blue)_22%,white)_0%,white_50%,var(--ow-blue-soft)_100%)]';
const AMBER_CARD =
  'border-amber bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-amber)_22%,white)_0%,white_50%,var(--ow-amber-soft)_100%)]';

function SummaryCard({
  label,
  value,
  icon: Icon,
  card,
  mark,
  pressed,
  onPress,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  card: string;
  mark: string;
  pressed: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left ${card} ${pressed ? 'ring-2 ring-navy' : ''}`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${mark}`}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-ink3">{label}</p>
        <p className="text-md font-semibold leading-tight text-ink">{value}</p>
      </div>
    </button>
  );
}

function MovementDetail({
  report,
  kind,
  onClose,
}: {
  report: InventoryReportData;
  kind: DetailKind;
  onClose: () => void;
}): React.ReactElement {
  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sold = report.rows
    .filter((row) => row.sold > 0)
    .sort((left, right) => right.sold - left.sold);
  const moved = report.rows
    .filter((row) => row.units > 0)
    .sort((left, right) => right.units - left.units);
  const copy = DETAIL_COPY[kind];
  const frame = DETAIL_FRAME[kind];

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-navy/75 p-3 sm:items-center sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="movement-detail-title"
        className={`grid max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-xl border-4 bg-white ${frame.border}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`flex items-start justify-between gap-3 px-4 py-3 ${frame.bar}`}>
          <div>
            <h2 id="movement-detail-title" className={`text-lg font-semibold ${frame.title}`}>
              {copy.title}
            </h2>
            <p className={`mt-1 text-sm ${frame.message}`}>{copy.message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`min-h-11 shrink-0 rounded-lg border px-3 text-sm font-medium ${frame.close}`}
          >
            Close
          </button>
        </div>
        <div className="grid gap-3 overflow-y-auto bg-canvas p-4">
          {kind === 'SOLD' ? <SoldDetail rows={sold} /> : null}
          {kind === 'MOVED' ? <MovedDetail rows={moved} total={report.unitsMoved} /> : null}
          {kind === 'LOW' ? <LowStockDetail items={report.lowStockItems} /> : null}
        </div>
      </div>
    </div>
  );
}

const DETAIL_FRAME: Record<
  DetailKind,
  { border: string; bar: string; title: string; message: string; close: string }
> = {
  SOLD: {
    border: 'border-teal',
    bar: 'bg-teal-soft',
    title: 'text-ink',
    message: 'text-ink2',
    close: 'border-teal bg-white text-teal',
  },
  MOVED: {
    border: 'border-action',
    bar: 'bg-action-soft',
    title: 'text-ink',
    message: 'text-ink2',
    close: 'border-action bg-white text-action',
  },
  LOW: {
    border: 'border-amber',
    bar: 'bg-navy',
    title: 'text-white',
    message: 'text-white/80',
    close: 'border-white/40 text-white',
  },
};

const DETAIL_COPY: Record<DetailKind, { title: string; message: string }> = {
  SOLD: {
    title: 'Items sold',
    message: 'Each product below had at least one sale in this date range.',
  },
  MOVED: {
    title: 'Units moved',
    message:
      'Stock added, sold, damaged, lost, or corrected in this date range. Units moved is the total quantity that changed.',
  },
  LOW: {
    title: 'Low stock events',
    message: 'Alerts raised in this date range when a product reached its low-stock threshold.',
  },
};

function SoldDetail({ rows }: { rows: ReportRow[] }): React.ReactElement {
  if (rows.length === 0) {
    return <p className="text-sm text-ink2">No products were sold in this date range.</p>;
  }
  return (
    <DetailTable headings={['Product', 'Units sold', 'Closing']}>
      {rows.map((row) => (
        <tr key={row.batchId} className="border-b border-line last:border-0">
          <ProductCell row={row} />
          <td className="px-3 py-2 text-sm font-medium text-amber">{row.sold}</td>
          <td
            className={`px-3 py-2 text-sm font-semibold ${row.closing <= 0 ? 'text-danger' : 'text-ink'}`}
          >
            {row.closing}
          </td>
        </tr>
      ))}
    </DetailTable>
  );
}

function MovedDetail({ rows, total }: { rows: ReportRow[]; total: number }): React.ReactElement {
  if (rows.length === 0) {
    return <p className="text-sm text-ink2">No stock moved in this date range.</p>;
  }
  return (
    <>
      <p className="text-sm font-medium text-ink">
        {total} units across {rows.length} products
      </p>
      <DetailTable headings={['Product', 'Added', 'Sold', 'Other', 'Units']}>
        {rows.map((row) => (
          <tr key={row.batchId} className="border-b border-line last:border-0">
            <ProductCell row={row} />
            <td className="px-3 py-2 text-sm font-medium text-teal">{row.added}</td>
            <td className="px-3 py-2 text-sm font-medium text-amber">{row.sold}</td>
            <td className="px-3 py-2 text-sm text-ink2">{row.units - row.added - row.sold}</td>
            <td className="px-3 py-2 text-sm font-semibold text-ink">{row.units}</td>
          </tr>
        ))}
      </DetailTable>
    </>
  );
}

function LowStockDetail({
  items,
}: {
  items: InventoryReportData['lowStockItems'];
}): React.ReactElement {
  if (items.length === 0) {
    return <p className="text-sm text-ink2">No low-stock alerts were raised in this date range.</p>;
  }
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="grid gap-1 rounded-lg border-2 border-amber bg-amber-soft px-3 py-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            {item.batchId ? (
              <Link
                href={`/retailer/inventory/${item.batchId}`}
                className="text-sm font-semibold text-ink"
              >
                {item.title}
              </Link>
            ) : (
              <p className="text-sm font-semibold text-ink">{item.title}</p>
            )}
            <p className="text-xs font-medium text-amber">{formatShortDate(item.createdAt)}</p>
          </div>
          <p className="text-sm text-ink">{item.body}</p>
        </li>
      ))}
    </ul>
  );
}

function ProductCell({ row }: { row: ReportRow }): React.ReactElement {
  return (
    <td className="px-3 py-2">
      <Link href={`/retailer/inventory/${row.batchId}`} className="text-sm font-medium text-action">
        {row.productName}
      </Link>
      <p className="text-xs text-ink3">{row.priceCode}</p>
    </td>
  );
}

function DetailTable({
  headings,
  children,
}: {
  headings: string[];
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr className="bg-navy text-left">
            {headings.map((heading) => (
              <th
                key={heading}
                className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-white"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
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

const inputClass =
  'h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action';
