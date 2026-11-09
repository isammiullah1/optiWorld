'use client';

import type { WholesalerCatalogItem } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { formatRupee } from '@/components/retailer/dashboard-format';

import { ProductDrawer } from './ProductDrawer';
import { loadCatalog, loadCategories, setAvailability } from './wholesaler-api';

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[180px] flex-1 text-xs text-ink2">
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="text-xs text-ink2">
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="mt-1 block min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink"
          >
            <option value="">All</option>
            {categoryOptions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink2">
          Availability
          <select
            value={availability}
            onChange={(event) =>
              setAvailabilityFilter(event.target.value as '' | 'AVAILABLE' | 'OUT_OF_STOCK')
            }
            className="mt-1 block min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink"
          >
            <option value="">All</option>
            <option value="AVAILABLE">Available</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={priceOnRequest}
            onChange={(event) => setPriceOnRequest(event.target.checked)}
          />
          Price on request
        </label>
        <button
          type="button"
          className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink2"
          onClick={() => setPreview((current) => (current === 'OFF' ? 'FULL' : 'OFF'))}
        >
          Preview as retailer
        </button>
        <button
          type="button"
          className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white"
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          Add product
        </button>
      </div>
      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
          <span className="text-sm text-ink2">{selected.length} selected</span>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-teal px-3 text-sm text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void applyAvailability('AVAILABLE')}
          >
            Set available
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-amber px-3 text-sm text-white disabled:opacity-60"
            disabled={busy}
            onClick={() => void applyAvailability('OUT_OF_STOCK')}
          >
            Set out of stock
          </button>
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div
          className="h-48 animate-pulse rounded-xl border border-line bg-white"
          aria-busy="true"
          aria-label="Loading catalog"
        />
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-6 text-center">
          <p className="text-md font-medium text-ink">No products match</p>
          <p className="mt-1 text-sm text-ink2">Add a product or clear the filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all products"
                    checked={allSelected}
                    onChange={(event) =>
                      setSelected(event.target.checked ? products.map((product) => product.id) : [])
                    }
                  />
                </th>
                {['Product name', 'Category', 'Listed price', 'Availability', 'Actions'].map(
                  (heading) => (
                    <th
                      key={heading}
                      className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                    >
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-line last:border-0 hover:bg-canvas">
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
                  <td className="px-3 py-2 text-xs font-medium text-ink">{product.name}</td>
                  <td className="px-3 py-2 text-xs text-ink2">{product.category}</td>
                  <td className="px-3 py-2 text-xs">
                    {product.isPriceOnRequest || !product.listedPrice ? (
                      <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">
                        On request
                      </span>
                    ) : (
                      <span className="text-ink">{formatRupee(product.listedPrice)}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
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
                      className="min-h-11 text-xs font-medium text-action"
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
      {preview !== 'OFF' ? (
        <section className="rounded-xl border border-line bg-white p-4">
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
                <li key={product.id} className="rounded-lg border border-line p-3">
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
