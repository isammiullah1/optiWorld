'use client';

import type {
  InventoryBatchRecord,
  InventoryCategoryRule,
  InventoryListQuery,
} from '@optiworld/shared';
import {
  Archive,
  ArchiveRestore,
  CircleMinus,
  Eye,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { CategoryTag, categoryLook } from './category-mark';
import { formatRupee } from './dashboard-format';
import { InventoryDrawer } from './InventoryDrawer';
import {
  createInventoryBatch,
  deleteInventoryBatch,
  loadInventory,
  loadRetailerSettings,
  restoreInventoryBatch,
  updateInventoryBatch,
} from './inventory-api';

const PAGE_SIZES = [10, 20, 30, 40] as const;
const SORTS = [
  { id: 'NAME', label: 'Name' },
  { id: 'STOCK', label: 'Current stock' },
  { id: 'PRICE', label: 'Sale price' },
] as const;

type Filters = {
  q: string;
  category: string;
  lowStock: boolean;
  bestSelling: boolean;
  mostProfitable: boolean;
  archived: boolean;
  minPrice: string;
  maxPrice: string;
  minStock: string;
  maxStock: string;
  sort: InventoryListQuery['sort'];
};

const EMPTY_FILTERS: Filters = {
  q: '',
  category: '',
  lowStock: false,
  bestSelling: false,
  mostProfitable: false,
  archived: false,
  minPrice: '',
  maxPrice: '',
  minStock: '',
  maxStock: '',
  sort: 'NAME',
};

export function InventoryList(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const showCost = session?.user.role === 'OWNER';
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [rows, setRows] = useState<InventoryBatchRecord[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryRules, setCategoryRules] = useState<InventoryCategoryRule[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryBatchRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [defaultThreshold, setDefaultThreshold] = useState(5);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [restockingId, setRestockingId] = useState<string | null>(null);
  const [restockReason, setRestockReason] = useState('');
  const [lowStockNotice, setLowStockNotice] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    setLoading(true);
    void loadInventory(token, toQuery(applied, page, pageSize))
      .then(async (result) => {
        if (!active) {
          return;
        }
        const showFullStock = applied.lowStock && result.total === 0;
        const listed = showFullStock
          ? await loadInventory(token, toQuery({ ...applied, lowStock: false }, page, pageSize))
          : result;
        if (!active) {
          return;
        }
        setRows(listed.rows);
        setCategories(result.categories);
        setCategoryRules(listed.categoryRules);
        setTotal(listed.total);
        setLowStockNotice(showFullStock && listed.total > 0);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Inventory could not be loaded');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token, applied, page, pageSize, reload]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadRetailerSettings(token)
      .then((settings) => setDefaultThreshold(settings.defaultLowStockThreshold))
      .catch(() => setDefaultThreshold(5));
  }, [token]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, pageCount);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  useEffect(() => {
    if (!loading && page > pageCount) {
      setPage(pageCount);
    }
  }, [loading, page, pageCount]);

  async function remove(row: InventoryBatchRecord, reason: string): Promise<void> {
    if (!token || reason.trim().length === 0) {
      return;
    }
    setBusyId(row.id);
    setError(null);
    try {
      await deleteInventoryBatch(token, row.id, reason.trim());
      setRemovingId(null);
      setRemoveReason('');
      setReload((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The product could not be archived');
    } finally {
      setBusyId(null);
    }
  }

  async function restock(row: InventoryBatchRecord, reason: string): Promise<void> {
    if (!token || reason.trim().length === 0) {
      return;
    }
    setBusyId(row.id);
    setError(null);
    try {
      await restoreInventoryBatch(token, row.id, reason.trim());
      setRestockingId(null);
      setRestockReason('');
      setReload((current) => current + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The product could not be restocked');
    } finally {
      setBusyId(null);
    }
  }

  function applyTags(
    patch: Partial<
      Pick<Filters, 'category' | 'lowStock' | 'bestSelling' | 'mostProfitable' | 'archived'>
    >,
  ): void {
    setPage(1);
    setMoreOpen(false);
    setDraft((current) => ({ ...current, ...patch }));
    setApplied((current) => ({ ...current, ...patch }));
  }

  function openEdit(row: InventoryBatchRecord): void {
    setEditing(row);
    setDrawerError(null);
    setDrawerOpen(true);
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Inventory</h1>
          <p className="text-sm text-ink2">
            Product codes, stock, and low-stock thresholds for this shop.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-4 text-sm font-medium text-white"
          onClick={() => {
            setEditing(null);
            setDrawerError(null);
            setDrawerOpen(true);
          }}
        >
          <Plus size={16} aria-hidden="true" />
          Add batch
        </button>
      </div>
      <form
        className="grid gap-2 rounded-xl border border-action-soft bg-white px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setApplied(draft);
        }}
      >
        <div className="flex items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1 text-xs text-ink2">
            Search inventory
            <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3">
              <Search size={16} className="text-action" aria-hidden="true" />
              <input
                aria-label="Search inventory"
                value={draft.q}
                onChange={(event) => {
                  const q = event.target.value;
                  setDraft((current) => ({ ...current, q }));
                  setPage(1);
                  setApplied((current) => ({ ...current, q }));
                }}
                placeholder="Name, product code, or brand"
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
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Filter label="Price from">
            <input
              aria-label="Price from"
              inputMode="decimal"
              value={draft.minPrice}
              onChange={(event) =>
                setDraft((current) => ({ ...current, minPrice: event.target.value }))
              }
              className={inputClass}
            />
          </Filter>
          <Filter label="Price up to">
            <input
              aria-label="Price up to"
              inputMode="decimal"
              value={draft.maxPrice}
              onChange={(event) =>
                setDraft((current) => ({ ...current, maxPrice: event.target.value }))
              }
              className={inputClass}
            />
          </Filter>
          <Filter label="Stock from">
            <input
              aria-label="Stock from"
              inputMode="numeric"
              value={draft.minStock}
              onChange={(event) =>
                setDraft((current) => ({ ...current, minStock: digits(event.target.value) }))
              }
              className={inputClass}
            />
          </Filter>
          <Filter label="Stock up to">
            <input
              aria-label="Stock up to"
              inputMode="numeric"
              value={draft.maxStock}
              onChange={(event) =>
                setDraft((current) => ({ ...current, maxStock: digits(event.target.value) }))
              }
              className={inputClass}
            />
          </Filter>
          <label className="grid gap-1 text-xs text-ink2">
            Sort
            <select
              aria-label="Sort inventory"
              value={draft.sort}
              onChange={(event) => {
                const sort = event.target.value;
                if (sort !== 'NAME' && sort !== 'STOCK' && sort !== 'PRICE') {
                  return;
                }
                setDraft((current) => ({ ...current, sort }));
                setPage(1);
                setApplied((current) => ({ ...current, sort }));
              }}
              className={inputClass}
            >
              {SORTS.map((sort) => (
                <option key={sort.id} value={sort.id}>
                  {sort.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <TagRow
          applied={applied}
          categories={categories}
          moreOpen={moreOpen}
          onApply={applyTags}
          onMore={() => setMoreOpen(true)}
          onCloseMore={() => setMoreOpen(false)}
        />
      </form>
      {error ? (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div
          className="h-40 animate-pulse rounded-xl border border-line bg-white"
          aria-busy="true"
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          {rows.length === 0 ? (
            <div className="p-6">
              <h2 className="text-md font-semibold text-ink">
                {applied.archived ? 'Archived' : 'No batches match'}
              </h2>
              <p className="mt-1 text-sm text-ink2">
                {applied.archived
                  ? 'Removed products stay here. Restock one to put it back on the live list.'
                  : 'Add a batch or change the search and filters.'}
              </p>
            </div>
          ) : (
            <>
              {applied.archived ? (
                <h2 className="border-b border-line px-4 py-3 text-md font-semibold text-ink">
                  Archived
                </h2>
              ) : null}
              {lowStockNotice ? (
                <p className="border-b border-amber bg-amber-soft px-4 py-2 text-sm text-ink">
                  No items are under low stock{applied.category ? ` in ${applied.category}` : ''}.
                  Showing the full stock list.
                </p>
              ) : null}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] border-collapse text-left">
                  <thead>
                    <tr className="bg-navy text-left">
                      {[
                        'Product code',
                        'Product name',
                        'Brand',
                        'Category',
                        'Sale price',
                        'Current stock',
                        ...(applied.bestSelling ? ['Units sold'] : []),
                        ...(showCost && applied.mostProfitable ? ['Profit'] : []),
                        'Threshold',
                        ...(applied.archived ? ['Reason'] : []),
                        'Actions',
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
                    {rows.map((row) => (
                      <InventoryRow
                        key={row.id}
                        row={row}
                        archived={applied.archived}
                        removing={removingId === row.id}
                        restocking={restockingId === row.id}
                        reason={removingId === row.id ? removeReason : restockReason}
                        busy={busyId === row.id}
                        onEdit={() => openEdit(row)}
                        onAskRemove={() => {
                          setRestockingId(null);
                          setRestockReason('');
                          setRemoveReason('');
                          setRemovingId(row.id);
                        }}
                        onAskRestock={() => {
                          setRemovingId(null);
                          setRemoveReason('');
                          setRestockReason('');
                          setRestockingId(row.id);
                        }}
                        onReason={removingId === row.id ? setRemoveReason : setRestockReason}
                        onKeep={() => {
                          setRemovingId(null);
                          setRestockingId(null);
                          setRemoveReason('');
                          setRestockReason('');
                        }}
                        onRemove={() => {
                          void remove(row, removeReason);
                        }}
                        onRestock={() => {
                          void restock(row, restockReason);
                        }}
                        showSold={applied.bestSelling}
                        showProfit={showCost && applied.mostProfitable}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink2">
            <p>
              {rows.length} of {total}
            </p>
            <label className="inline-flex items-center gap-2">
              Show
              <select
                aria-label="Batches per page"
                value={pageSize}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (next === 10 || next === 20 || next === 30 || next === 40) {
                    setPageSize(next);
                    setPage(1);
                  }
                }}
                className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink"
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
        </div>
      )}
      <InventoryDrawer
        open={drawerOpen}
        batch={editing}
        showCost={showCost}
        defaultThreshold={defaultThreshold}
        categoryRules={categoryRules}
        saving={saving}
        error={drawerError}
        onClose={() => setDrawerOpen(false)}
        onCreate={async (input) => {
          if (!token) {
            return;
          }
          setSaving(true);
          setDrawerError(null);
          try {
            await createInventoryBatch(token, input);
            setDrawerOpen(false);
            setReload((current) => current + 1);
          } catch (caught) {
            setDrawerError(
              caught instanceof Error ? caught.message : 'The batch could not be saved',
            );
          } finally {
            setSaving(false);
          }
        }}
        onUpdate={async (batchId, input) => {
          if (!token) {
            return;
          }
          setSaving(true);
          setDrawerError(null);
          try {
            await updateInventoryBatch(token, batchId, input);
            setDrawerOpen(false);
            setReload((current) => current + 1);
          } catch (caught) {
            setDrawerError(
              caught instanceof Error ? caught.message : 'The batch could not be saved',
            );
          } finally {
            setSaving(false);
          }
        }}
      />
    </section>
  );
}

const ARCHIVE_REASONS = [
  'Discontinued',
  'Wrong product',
  'No longer sold',
  'Duplicate item',
] as const;
const RESTOCK_REASONS = [
  'Back in stock',
  'Removed by mistake',
  'Ordered again',
  'Selling it again',
] as const;

function InventoryRow({
  row,
  archived,
  removing,
  restocking,
  reason,
  busy,
  onEdit,
  onAskRemove,
  onAskRestock,
  onReason,
  onKeep,
  onRemove,
  onRestock,
  showSold,
  showProfit,
}: {
  row: InventoryBatchRecord;
  archived: boolean;
  removing: boolean;
  restocking: boolean;
  reason: string;
  busy: boolean;
  onEdit: () => void;
  onAskRemove: () => void;
  onAskRestock: () => void;
  onReason: (value: string) => void;
  onKeep: () => void;
  onRemove: () => void;
  onRestock: () => void;
  showSold: boolean;
  showProfit: boolean;
}): React.ReactElement {
  const columns = 8 + (showSold ? 1 : 0) + (showProfit ? 1 : 0) + (archived ? 1 : 0);
  return (
    <>
      <tr className="border-b border-line last:border-0 hover:bg-canvas">
        <td className="px-3 py-3 text-sm font-semibold">
          <Link href={`/retailer/inventory/${row.id}`} className="text-action">
            {row.priceCode}
          </Link>
        </td>
        <td className="px-3 py-3 text-sm font-medium">
          <Link href={`/retailer/inventory/${row.id}`} className="text-ink">
            {row.productName}
          </Link>
        </td>
        <td className="px-3 py-3 text-sm text-ink2">{row.brand ?? '—'}</td>
        <td className="px-3 py-3">
          <CategoryTag name={row.category} />
        </td>
        <td className="px-3 py-3 text-sm text-ink">{formatRupee(row.salePrice)}</td>
        <td className="px-3 py-3 text-sm">
          <span
            className={`inline-flex items-center gap-1 ${row.outOfStock ? 'text-danger' : row.lowStock ? 'text-amber' : 'text-ink'}`}
          >
            {row.lowStock ? <CircleMinus size={14} aria-hidden="true" /> : null}
            {row.stockQty}
          </span>
          {row.outOfStock ? (
            <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
              Out
            </span>
          ) : null}
        </td>
        {showSold ? (
          <td className="px-3 py-3 text-sm font-medium text-teal">{row.unitsSold}</td>
        ) : null}
        {showProfit ? (
          <td className="px-3 py-3 text-sm font-medium text-teal">
            {row.profit ? formatRupee(row.profit) : '—'}
          </td>
        ) : null}
        <td className="px-3 py-3 text-sm text-ink2">{row.lowStockThreshold}</td>
        {archived ? (
          <td className="px-3 py-3 text-sm text-ink">
            {row.archiveReason ?? '—'}
            {row.archivedBy ? (
              <span className="mt-1 block text-xs text-ink2">{row.archivedBy}</span>
            ) : null}
          </td>
        ) : null}
        <td className="px-3 py-3">
          <div className="flex flex-wrap items-center gap-1">
            <Link
              href={`/retailer/inventory/${row.id}`}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-medium text-action"
            >
              <Eye size={14} aria-hidden="true" />
              Details
            </Link>
            {archived ? (
              <button
                type="button"
                disabled={busy}
                onClick={onAskRestock}
                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-medium text-teal disabled:text-ink3"
              >
                <ArchiveRestore size={14} aria-hidden="true" />
                Restock
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-medium text-amber"
                >
                  <Pencil size={14} aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onAskRemove}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-medium text-danger disabled:text-ink3"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Remove
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
      {removing ? (
        <ReasonRow
          columns={columns}
          tone="danger"
          title={`Remove ${row.productName}? Write why it is leaving the live list. It stays in Archived, and past sales keep the product name.`}
          suggestions={ARCHIVE_REASONS}
          reason={reason}
          busy={busy}
          confirmLabel="Remove"
          onReason={onReason}
          onCancel={onKeep}
          onConfirm={onRemove}
        />
      ) : null}
      {restocking ? (
        <ReasonRow
          columns={columns}
          tone="action"
          title={`Restock ${row.productName}? Write why it is coming back. It returns to the live list with its current stock.`}
          suggestions={RESTOCK_REASONS}
          reason={reason}
          busy={busy}
          confirmLabel="Restock"
          onReason={onReason}
          onCancel={onKeep}
          onConfirm={onRestock}
        />
      ) : null}
    </>
  );
}

function ReasonRow({
  columns,
  tone,
  title,
  suggestions,
  reason,
  busy,
  confirmLabel,
  onReason,
  onCancel,
  onConfirm,
}: {
  columns: number;
  tone: 'danger' | 'action';
  title: string;
  suggestions: readonly string[];
  reason: string;
  busy: boolean;
  confirmLabel: string;
  onReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}): React.ReactElement {
  const panel =
    tone === 'danger'
      ? 'border-b border-danger-soft bg-danger-soft'
      : 'border-b border-action-soft bg-action-soft';
  const selected =
    tone === 'danger' ? 'border-danger bg-white text-danger' : 'border-action bg-white text-action';
  const confirm = tone === 'danger' ? 'bg-danger' : 'bg-action';
  return (
    <tr className={panel}>
      <td colSpan={columns} className="px-3 py-3">
        <p className="text-sm text-ink">{title}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              aria-pressed={reason === suggestion}
              onClick={() => onReason(suggestion)}
              className={`min-h-11 rounded-full border px-3 text-xs ${reason === suggestion ? selected : 'border-line bg-white text-ink2'}`}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <label className="mt-2 grid gap-1 text-xs text-ink2">
          Reason
          <textarea
            value={reason}
            placeholder="Write the reason"
            onChange={(event) => onReason(event.target.value)}
            rows={2}
            maxLength={500}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
          />
        </label>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm text-ink2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || reason.trim().length === 0}
            onClick={onConfirm}
            className={`min-h-11 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-60 ${confirm}`}
          >
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </td>
    </tr>
  );
}

function toQuery(filters: Filters, page: number, limit: number): InventoryListQuery {
  const minStock = numberOrUndefined(filters.minStock);
  const maxStock = numberOrUndefined(filters.maxStock);
  const minPrice = moneyOrUndefined(filters.minPrice);
  const maxPrice = moneyOrUndefined(filters.maxPrice);
  return {
    q: filters.q,
    category: filters.category,
    lowStock: filters.lowStock,
    bestSelling: filters.bestSelling,
    mostProfitable: filters.mostProfitable,
    archived: filters.archived,
    sort: filters.sort,
    page,
    limit,
    ...(minPrice ? { minPrice } : {}),
    ...(maxPrice ? { maxPrice } : {}),
    ...(minStock !== undefined ? { minStock } : {}),
    ...(maxStock !== undefined ? { maxStock } : {}),
  };
}

function digits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 7);
}

function numberOrUndefined(value: string): number | undefined {
  if (value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function moneyOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return /^\d{1,10}(\.\d{1,2})?$/.test(trimmed) ? trimmed : undefined;
}

function Filter({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="grid gap-1 text-xs text-ink2">
      {label}
      {children}
    </label>
  );
}

const MAX_VISIBLE_TAGS = 8;

type TagChip = {
  key: string;
  label: string;
  selected: boolean;
  className: string;
  icon: LucideIcon;
  onClick: () => void;
};

function TagRow({
  applied,
  categories,
  moreOpen,
  onApply,
  onMore,
  onCloseMore,
}: {
  applied: Filters;
  categories: readonly string[];
  moreOpen: boolean;
  onApply: (
    patch: Partial<
      Pick<Filters, 'category' | 'lowStock' | 'bestSelling' | 'mostProfitable' | 'archived'>
    >,
  ) => void;
  onMore: () => void;
  onCloseMore: () => void;
}): React.ReactElement {
  const clear = {
    category: '',
    lowStock: false,
    bestSelling: false,
    mostProfitable: false,
    archived: false,
  };
  const active = applied.archived
    ? 'archived'
    : applied.bestSelling
      ? 'best'
      : applied.mostProfitable
        ? 'profit'
        : applied.lowStock
          ? 'low'
          : applied.category || 'all';
  const chips: TagChip[] = [
    {
      key: 'all',
      label: 'All',
      selected: active === 'all',
      className:
        active === 'all'
          ? 'border border-ink2 bg-ink2 text-white'
          : 'border border-ink3 bg-[color-mix(in_srgb,var(--ow-ink3)_18%,white)] text-ink2',
      icon: LayoutGrid,
      onClick: () => onApply(clear),
    },
    {
      key: 'best',
      label: 'Best selling',
      selected: active === 'best',
      className:
        active === 'best'
          ? 'border border-teal bg-teal text-white'
          : 'border border-teal bg-teal-soft text-teal',
      icon: Trophy,
      onClick: () => onApply({ ...clear, bestSelling: true }),
    },
    {
      key: 'profit',
      label: 'Most profitable',
      selected: active === 'profit',
      className:
        active === 'profit'
          ? 'border border-action bg-action text-white'
          : 'border border-action bg-action-soft text-action',
      icon: TrendingUp,
      onClick: () => onApply({ ...clear, mostProfitable: true }),
    },
    {
      key: 'low',
      label: 'Low stock',
      selected: active === 'low',
      className:
        active === 'low'
          ? 'border border-amber bg-amber text-white'
          : 'border border-amber bg-amber-soft text-amber',
      icon: CircleMinus,
      onClick: () => onApply({ ...clear, lowStock: true }),
    },
    ...categories.map((option) => {
      const look = categoryLook(option);
      const selected = active === option;
      return {
        key: option,
        label: option,
        selected,
        className: selected ? look.active : look.idle,
        icon: look.icon,
        onClick: () => onApply({ ...clear, category: option }),
      };
    }),
    {
      key: 'archived',
      label: 'Archived',
      selected: active === 'archived',
      className:
        active === 'archived'
          ? 'border border-navy bg-navy text-white'
          : 'border border-navy bg-white text-navy',
      icon: Archive,
      onClick: () => onApply({ ...clear, archived: true }),
    },
  ];
  const archivedChip = chips.at(-1);
  const overflowing = chips.length > MAX_VISIBLE_TAGS && archivedChip !== undefined;
  let head = overflowing ? chips.slice(0, MAX_VISIBLE_TAGS - 2) : chips;
  let overflow = overflowing ? chips.slice(MAX_VISIBLE_TAGS - 2, -1) : [];
  const selectedHidden = overflow.find((chip) => chip.selected);
  const displaced = head.at(-1);
  if (selectedHidden && displaced) {
    head = [...head.slice(0, -1), selectedHidden];
    overflow = [displaced, ...overflow.filter((chip) => chip.key !== selectedHidden.key)];
  }
  const visible = overflowing && archivedChip ? [...head, archivedChip] : chips;
  const moreSelected = overflow.some((chip) => chip.selected);
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
        {visible.map((chip) => {
          const Icon = chip.icon;
          return (
            <Pill
              key={chip.key}
              selected={chip.selected}
              className={chip.className}
              onClick={chip.onClick}
            >
              <Icon size={14} aria-hidden="true" />
              {chip.label}
            </Pill>
          );
        })}
        {overflow.length > 0 ? (
          <Pill
            selected={moreSelected}
            className={
              moreSelected
                ? 'border border-action bg-action-soft text-action'
                : 'border border-line bg-white text-ink2'
            }
            onClick={onMore}
          >
            <MoreHorizontal size={14} aria-hidden="true" />
            More
          </Pill>
        ) : null}
      </div>
      {moreOpen && overflow.length > 0 ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 sm:items-center"
          role="presentation"
          onClick={onCloseMore}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="more-tags-title"
            className="grid max-h-[92vh] w-full max-w-lg gap-4 overflow-y-auto rounded-t-xl border-2 border-action bg-white p-5 ring-4 ring-action-soft sm:rounded-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <div>
                <h2 id="more-tags-title" className="text-lg font-semibold text-ink">
                  More categories
                </h2>
                <p className="mt-1 text-sm text-ink2">Choose one of the remaining categories.</p>
              </div>
              <button
                type="button"
                className="min-h-11 shrink-0 rounded-lg border border-line bg-white px-4 text-sm font-medium text-ink2"
                onClick={onCloseMore}
              >
                Close
              </button>
            </div>
            <div className="grid gap-2">
              {overflow.map((chip) => {
                const Icon = chip.icon;
                return (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.onClick}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-lg border-2 px-3 text-left text-sm font-medium ${chip.className}`}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Pill({
  selected,
  onClick,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const tone =
    className ?? (selected ? 'bg-action text-white' : 'border border-line bg-white text-ink2');
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ${tone}`}
    >
      {children}
    </button>
  );
}

const inputClass =
  'h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none focus:border-action';
