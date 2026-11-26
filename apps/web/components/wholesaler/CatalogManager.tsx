'use client';

import type { WholesalerCatalogItem } from '@optiworld/shared';
import { Banknote, Package, PackageX, Search } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatRupee } from '@/components/retailer/dashboard-format';

import { ProductDrawer } from './ProductDrawer';
import { loadCatalog, loadCategories, setAvailability } from './wholesaler-api';
import {
  AMBER_CARD,
  BLUE_CARD,
  fieldClass,
  headCellClass,
  headRowClass,
  ListPager,
  pageWindow,
  TEAL_CARD,
  type PageSize,
} from './wholesaler-surface';

type PreviewMode = 'OFF' | 'FULL' | 'PRICES_HIDDEN';

export function CatalogManager(): React.ReactElement {
  const { data: session } = useSession();
  const [products, setProducts] = useState<WholesalerCatalogItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [availability, setAvailabilityFilter] = useState<'' | 'AVAILABLE' | 'OUT_OF_STOCK'>('');
  const [priceOnRequest, setPriceOnRequest] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewMode>('OFF');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<WholesalerCatalogItem | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const refresh = useCallback((): void => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    setLoading(true);
    void Promise.all([
      loadCatalog(token, {
        q: query.trim() || undefined,
        category: category || undefined,
        availability: availability || undefined,
        priceOnRequest,
      }),
      loadCategories(token),
    ])
      .then(([items, names]) => {
        setProducts(items);
        setCategories(names);
        setSelected((current) => current.filter((id) => items.some((item) => item.id === id)));
        setError('');
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'Could not load the catalog');
      })
      .finally(() => setLoading(false));
  }, [availability, category, priceOnRequest, query, session?.accessToken]);

  useEffect(() => {
    const handle = window.setTimeout(refresh, 200);
    return () => window.clearTimeout(handle);
  }, [refresh]);

  useEffect(() => {
    setPage(1);
  }, [query, category, availability, priceOnRequest, pageSize]);

  const categoryOptions = useMemo(() => {
    return [...new Set([...categories, ...extraCategories])].sort((left, right) =>
      left.localeCompare(right),
    );
  }, [categories, extraCategories]);

  async function applyAvailability(next: 'AVAILABLE' | 'OUT_OF_STOCK'): Promise<void> {
    const token = session?.accessToken;
    if (!token || selected.length === 0) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await setAvailability(token, selected, next);
      setSelected([]);
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update availability');
    } finally {
      setBusy(false);
    }
  }

  const allSelected =
    products.length > 0 && products.every((product) => selected.includes(product.id));

  const windowed = pageWindow(products, page, pageSize);

  return (
    <div className="grid gap-4">
      <section className="overflow-hidden rounded-xl border border-action-soft bg-white">
        <form
          className="grid gap-2 border-b border-action-soft bg-canvas px-3 py-2"
          onSubmit={(event) => event.preventDefault()}
        >
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid min-w-[180px] flex-1 gap-1 text-xs text-ink2">
              Search catalog
              <span className="flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3">
                <Search size={16} className="text-action" aria-hidden="true" />
                <input
                  aria-label="Search catalog"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name"
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
                />
              </span>
            </label>
            <label className="grid gap-1 text-xs text-ink2">
              Category
              <select
                aria-label="Category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className={`${fieldClass} min-w-[10rem]`}
              >
                <option value="">All</option>
                {categoryOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink2"
              onClick={() => setPreview((current) => (current === 'OFF' ? 'FULL' : 'OFF'))}
            >
              Preview as retailer
            </button>
            <button
              type="button"
              className="h-9 rounded-lg bg-action px-4 text-sm font-medium text-white"
              onClick={() => {
                setEditing(null);
                setDrawerOpen(true);
              }}
            >
              Add product
            </button>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Availability">
            <FilterChip
              label="All"
              icon={Package}
              selected={availability === '' && !priceOnRequest}
              idle={BLUE_CARD}
              active="border-action bg-action text-white"
              onClick={() => {
                setAvailabilityFilter('');
                setPriceOnRequest(false);
              }}
            />
            <FilterChip
              label="Available"
              icon={Package}
              selected={availability === 'AVAILABLE'}
              idle={TEAL_CARD}
              active="border-teal bg-teal text-white"
              onClick={() => setAvailabilityFilter('AVAILABLE')}
            />
            <FilterChip
              label="Out of stock"
              icon={PackageX}
              selected={availability === 'OUT_OF_STOCK'}
              idle="border-danger bg-danger-soft text-danger"
              active="border-danger bg-danger text-white"
              onClick={() => setAvailabilityFilter('OUT_OF_STOCK')}
            />
            <FilterChip
              label="Price on request"
              icon={Banknote}
              selected={priceOnRequest}
              idle={AMBER_CARD}
              active="border-amber bg-amber text-white"
              onClick={() => setPriceOnRequest((current) => !current)}
            />
          </div>
        </form>
        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-action-soft bg-action-soft px-3 py-2">
            <span className="text-sm text-action">{selected.length} selected</span>
            <button
              type="button"
              className="h-8 rounded-lg bg-teal px-3 text-sm text-white disabled:opacity-60"
              disabled={busy}
              onClick={() => void applyAvailability('AVAILABLE')}
            >
              Set available
            </button>
            <button
              type="button"
              className="h-8 rounded-lg bg-amber px-3 text-sm text-white disabled:opacity-60"
              disabled={busy}
              onClick={() => void applyAvailability('OUT_OF_STOCK')}
            >
              Set out of stock
            </button>
          </div>
        ) : null}
        {error ? (
          <p className="px-3 pt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {loading ? (
          <div
            className="h-48 animate-pulse bg-white"
            aria-busy="true"
            aria-label="Loading catalog"
          />
        ) : products.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-md font-medium text-ink">No products match</p>
            <p className="mt-1 text-sm text-ink2">Add a product or clear the filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className={headRowClass}>
                  <th className={headCellClass}>
                    <input
                      type="checkbox"
                      aria-label="Select all products"
                      checked={allSelected}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked ? products.map((product) => product.id) : [],
                        )
                      }
                    />
                  </th>
                  {['Product name', 'Category', 'Listed price', 'Availability', 'Actions'].map(
                    (heading) => (
                      <th key={heading} className={headCellClass}>
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {windowed.visible.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-line last:border-0 hover:bg-canvas"
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${product.name}`}
                        checked={selected.includes(product.id)}
                        onChange={(event) =>
                          setSelected((current) =>
                            event.target.checked
                              ? [...current, product.id]
                              : current.filter((id) => id !== product.id),
                          )
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-sm font-medium text-ink">{product.name}</td>
                    <td className="px-3 py-2 text-sm text-ink2">{product.category}</td>
                    <td className="px-3 py-2 text-sm">
                      {product.isPriceOnRequest || !product.listedPrice ? (
                        <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">
                          On request
                        </span>
                      ) : (
                        <span className="font-medium text-action">
                          {formatRupee(product.listedPrice)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {product.availabilityStatus === 'AVAILABLE' ? (
                        <span className="rounded-full bg-teal-soft px-2 py-0.5 text-xs font-medium text-teal">
                          Available
                        </span>
                      ) : (
                        <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                          Out of stock
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="inline-flex h-8 items-center text-xs font-medium text-action"
                        onClick={() => {
                          setEditing(product);
                          setDrawerOpen(true);
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPager
          total={products.length}
          shown={windowed.visible.length}
          page={windowed.current}
          pageCount={windowed.pageCount}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      </section>
      {preview !== 'OFF' ? (
        <section className={`rounded-xl border p-4 ${TEAL_CARD}`}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-md font-semibold text-ink">Retailer preview</h2>
            <button
              type="button"
              className={`min-h-11 rounded-lg px-3 text-sm ${preview === 'FULL' ? 'bg-action text-white' : 'border border-line text-ink2'}`}
              onClick={() => setPreview('FULL')}
            >
              Full prices
            </button>
            <button
              type="button"
              className={`min-h-11 rounded-lg px-3 text-sm ${
                preview === 'PRICES_HIDDEN'
                  ? 'bg-action text-white'
                  : 'border border-line text-ink2'
              }`}
              onClick={() => setPreview('PRICES_HIDDEN')}
            >
              Prices hidden
            </button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {products.map((product) => {
              const hidden =
                preview === 'PRICES_HIDDEN' || product.isPriceOnRequest || !product.listedPrice;
              return (
                <li key={product.id} className="rounded-lg border border-line bg-white p-3">
                  <p className="text-sm font-medium text-ink">{product.name}</p>
                  <p className="text-xs text-ink3">{product.category}</p>
                  <p className="mt-2 text-sm text-ink2">
                    {hidden ? 'Price on request' : formatRupee(product.listedPrice ?? '0')}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <ProductDrawer
        open={drawerOpen}
        product={editing}
        categories={categoryOptions}
        onClose={() => setDrawerOpen(false)}
        onSaved={refresh}
        onCategoryAdded={(name) =>
          setExtraCategories((current) => (current.includes(name) ? current : [...current, name]))
        }
      />
    </div>
  );
}

function FilterChip({
  label,
  icon: Icon,
  selected,
  idle,
  active,
  onClick,
}: {
  label: string;
  icon: typeof Package;
  selected: boolean;
  idle: string;
  active: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium ${selected ? active : idle}`}
    >
      <Icon size={14} aria-hidden="true" />
      {label}
    </button>
  );
}
