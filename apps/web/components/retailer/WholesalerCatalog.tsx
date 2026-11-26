'use client';

import type { CatalogProduct, WholesalerCatalog } from '@optiworld/shared';
import { Building2, Package, Search, ShoppingCart } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { WhatsAppLabel } from '@/components/WhatsAppMark';
import { CatalogRequestError, loadWholesalerCatalog, submitRetailerOrder } from './catalog-api';
import { formatRupee } from './dashboard-format';
import { OrderBuilder, type DraftLine } from './OrderBuilder';

const PAGE_SIZES = [10, 20, 30, 40] as const;

export function WholesalerCatalogView({
  wholesalerId,
}: {
  wholesalerId: string;
}): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const router = useRouter();
  const [catalog, setCatalog] = useState<WholesalerCatalog | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadWholesalerCatalog(token, wholesalerId)
      .then((next) => {
        setCatalog(next);
        setHidden(false);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (caught instanceof CatalogRequestError && caught.code === 'CONNECTION_REQUIRED') {
          router.replace('/retailer/wholesalers');
          return;
        }
        if (caught instanceof CatalogRequestError && caught.code === 'CATALOG_HIDDEN') {
          setHidden(true);
          setError(null);
          return;
        }
        setError(caught instanceof Error ? caught.message : 'This catalog could not be loaded');
      });
  }, [router, token, wholesalerId]);

  const categories = useMemo(() => {
    const names = new Set(catalog?.products.map((product) => product.category) ?? []);
    return ['All', ...names];
  }, [catalog]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (catalog?.products ?? []).filter((product) => {
      if (category !== 'All' && product.category !== category) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return [product.name, product.productCode, product.category]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [catalog, category, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function addProduct(product: CatalogProduct): void {
    setLines((current) => {
      const found = current.find((line) => line.id === product.id);
      if (found) {
        return current.map((line) =>
          line.id === product.id
            ? { ...line, quantity: Math.min(line.quantity + 1, 10_000) }
            : line,
        );
      }
      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          code: product.productCode,
          listedPrice: product.listedPrice,
          quantity: 1,
        },
      ];
    });
  }

  if (hidden) {
    return (
      <section className="rounded-xl border border-line bg-white p-6">
        <h1 className="text-lg font-semibold text-ink">Catalog not available</h1>
        <p className="mt-1 text-sm text-ink2">
          Catalog not available — contact wholesaler directly
        </p>
      </section>
    );
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border-2 border-navy bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-navy)_10%,white)_0%,white_55%,var(--ow-bg)_100%)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-navy">
              <Building2 size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-ink">
                {catalog?.wholesaler.name ?? 'Catalog'}
              </h1>
              <p className="text-sm text-ink2">{catalog?.wholesaler.city ?? 'City not set'}</p>
              {catalog?.wholesaler.phone ? (
                <a className="text-sm text-action" href={`tel:${catalog.wholesaler.phone}`}>
                  {catalog.wholesaler.phone}
                </a>
              ) : (
                <p className="text-sm text-ink3">No contact number</p>
              )}
              {catalog?.wholesaler.whatsappNumber ? (
                <p className="text-sm text-ink2">
                  <WhatsAppLabel>{catalog.wholesaler.whatsappNumber}</WhatsAppLabel>
                </p>
              ) : null}
            </div>
          </div>
          <div className="min-w-[16rem] flex-1 rounded-lg bg-white/80 p-3 sm:max-w-md">
            <p className="text-xs font-medium uppercase tracking-wide text-ink3">About us</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">
              {catalog?.wholesaler.listingProfileNotes?.trim() || '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              document.getElementById('order-builder')?.scrollIntoView({ behavior: 'smooth' })
            }
            className="min-h-[44px] rounded-lg bg-action px-4 text-sm font-medium text-white lg:hidden"
          >
            Place order
          </button>
        </div>
      </section>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]">
        {catalog === null && !error ? (
          <div className="h-40 animate-pulse rounded-xl bg-white" />
        ) : null}
        {catalog ? (
          <section className="min-w-0 overflow-hidden rounded-xl border-2 border-action bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-blue)_26%,white)_0%,white_48%,var(--ow-blue-soft)_100%)]">
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-action-soft text-action">
                <Package size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="text-md font-semibold text-ink">Catalog</h2>
                <p className="text-xs text-ink2">Search a product, then add it to the order.</p>
              </div>
            </div>
            <div className="grid gap-2 px-3 pb-3">
              <label className="grid gap-1 text-xs text-ink2">
                Search catalog
                <span className="flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3">
                  <Search size={16} className="text-action" aria-hidden="true" />
                  <input
                    aria-label="Search catalog"
                    value={query}
                    placeholder="Name, code, or category"
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
                  />
                </span>
              </label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
                {categories.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={category === name}
                    onClick={() => {
                      setCategory(name);
                      setPage(1);
                    }}
                    className={`min-h-[44px] rounded-full px-3 text-sm ${
                      category === name
                        ? 'bg-action text-white'
                        : 'border border-line bg-white text-ink2'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div className="mx-3 mb-3 overflow-hidden rounded-lg border border-line bg-white">
              <table className="w-full table-fixed border-collapse text-left">
                <thead>
                  <tr className="border-b border-line bg-action-soft text-left">
                    {(
                      [
                        ['Product', ''],
                        ['Code', 'w-24'],
                        ['Category', 'w-28'],
                        ['Price', 'w-36'],
                        ['', 'w-14'],
                      ] as const
                    ).map(([heading, width]) => (
                      <th
                        key={heading || 'add'}
                        className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3 ${width}`}
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-sm text-ink2">
                        No products match this search.
                      </td>
                    </tr>
                  ) : (
                    visible.map((product) => (
                      <CatalogRow
                        key={product.id}
                        product={product}
                        quantity={lines.find((line) => line.id === product.id)?.quantity ?? 0}
                        onAdd={() => addProduct(product)}
                      />
                    ))
                  )}
                </tbody>
              </table>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink2">
                <p>
                  {visible.length} of {filtered.length}
                </p>
                <label className="inline-flex items-center gap-2">
                  Show
                  <select
                    aria-label="Products per page"
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]);
                      setPage(1);
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
                    className="min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span>
                    {currentPage} / {pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= pageCount}
                    onClick={() => setPage(currentPage + 1)}
                    className="min-h-11 rounded-lg border border-line px-3 text-sm disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : null}
        <OrderBuilder
          lines={lines}
          pricesVisible={catalog?.pricesVisible ?? false}
          notes={notes}
          busy={busy}
          onNotes={setNotes}
          onRemove={(id) => setLines((current) => current.filter((line) => line.id !== id))}
          onQuantity={(id, quantity) =>
            setLines((current) =>
              current.map((line) => (line.id === id ? { ...line, quantity } : line)),
            )
          }
          onSubmit={() => {
            if (!token || !catalog || lines.length === 0) {
              return;
            }
            setBusy(true);
            setError(null);
            void submitRetailerOrder(token, {
              wholesalerOrgId: catalog.wholesaler.id,
              notes: notes.trim() || undefined,
              items: lines.map((line) => ({ catalogProductId: line.id, quantity: line.quantity })),
            })
              .then((orderId) => router.push(`/retailer/orders/${orderId}`))
              .catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'The order could not be submitted',
                );
                setBusy(false);
              });
          }}
        />
      </div>
    </div>
  );
}

function CatalogRow({
  product,
  quantity,
  onAdd,
}: {
  product: CatalogProduct;
  quantity: number;
  onAdd: () => void;
}): React.ReactElement {
  const unavailable = product.availabilityStatus === 'OUT_OF_STOCK';
  return (
    <tr className="border-b border-line">
      <td className="px-3 py-2 text-sm font-medium text-ink">
        <span className="block truncate">{product.name}</span>
      </td>
      <td className="w-24 px-3 py-2 text-sm text-ink2">
        <span className="block truncate">{product.productCode}</span>
      </td>
      <td className="w-28 px-3 py-2 text-sm text-ink2">
        <span className="block truncate">{product.category}</span>
      </td>
      <td className="w-36 px-3 py-2 text-sm text-ink">
        {product.listedPrice ? (
          <span className="block truncate">{formatRupee(product.listedPrice)}</span>
        ) : (
          <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">
            Price on request
          </span>
        )}
        {unavailable ? (
          <span className="mt-1 block w-fit rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
            Out
          </span>
        ) : null}
      </td>
      <td className="w-14 px-2 py-2 text-right">
        <button
          type="button"
          aria-label={
            unavailable
              ? `${product.name} is out of stock`
              : quantity > 0
                ? `Add to order, ${quantity} already added`
                : 'Add to order'
          }
          title={
            unavailable ? 'Out of stock' : quantity > 0 ? `${quantity} in order` : 'Add to order'
          }
          onClick={onAdd}
          disabled={unavailable}
          className="relative inline-grid h-11 w-11 place-items-center rounded-lg border border-line text-action transition hover:border-action hover:bg-action-soft disabled:text-ink3 disabled:hover:border-line disabled:hover:bg-transparent"
        >
          <ShoppingCart size={16} aria-hidden="true" />
          {quantity > 0 ? (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-action px-1 text-[11px] font-medium leading-none text-white">
              {quantity}
            </span>
          ) : null}
        </button>
      </td>
    </tr>
  );
}
