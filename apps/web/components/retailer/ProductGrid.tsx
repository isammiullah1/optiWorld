'use client';

import type { InventorySearchHit } from '@optiworld/shared';

import { formatRupee } from './dashboard-format';

export function ProductGrid({
  products,
  query,
  onQuery,
  onAdd,
  offline,
}: {
  products: readonly InventorySearchHit[];
  query: string;
  onQuery: (value: string) => void;
  onAdd: (product: InventorySearchHit) => void;
  offline: boolean;
}): React.ReactElement {
  return (
    <section className="grid gap-3">
      {offline ? (
        <p className="rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber" role="status">
          Offline — invoice will sync when connected
        </p>
      ) : null}
      <label className="grid gap-1 text-sm text-ink2">
        Search products
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Name, brand, or product code"
          className="rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action"
        />
      </label>
      {products.length === 0 ? (
        <p className="text-sm text-ink2">No products match that search.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => onAdd(product)}
                className="flex h-full w-full flex-col items-start gap-1 rounded-xl border border-line bg-white p-3 text-left"
              >
                <span className="text-md font-semibold text-action">{product.priceCode}</span>
                <span className="text-sm text-ink">{product.productName}</span>
                {product.brand ? <span className="text-xs text-ink3">{product.brand}</span> : null}
                <span className="text-sm text-ink">{formatRupee(product.salePrice)}</span>
                <span className={`text-xs ${product.lowStock ? 'text-amber' : 'text-ink3'}`}>
                  Stock {product.stockQty}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
