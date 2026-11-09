'use client';

import type { WholesalerCatalog } from '@optiworld/shared';
import { useEffect, useState } from 'react';

import { loadWholesalerCatalog } from './catalog-api';
import { formatRupee } from './dashboard-format';

export function CatalogPicker({
  token,
  wholesalerId,
  chosenIds,
  onPick,
}: {
  token: string;
  wholesalerId: string;
  chosenIds?: ReadonlySet<string>;
  onPick: (product: WholesalerCatalog['products'][number]) => void;
}): React.ReactElement {
  const [catalog, setCatalog] = useState<WholesalerCatalog | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadWholesalerCatalog(token, wholesalerId)
      .then(setCatalog)
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'The catalog could not be loaded');
      });
  }, [token, wholesalerId]);

  const needle = query.trim().toLowerCase();
  const products = (catalog?.products ?? []).filter((product) =>
    needle
      ? product.name.toLowerCase().includes(needle) ||
        product.productCode.toLowerCase().includes(needle)
      : true,
  );

  return (
    <div className="grid gap-2">
      <label className="grid gap-1 text-xs text-ink2">
        Add an item
        <input
          aria-label="Search catalog"
          value={query}
          placeholder="Search this wholesaler's catalog"
          onChange={(event) => setQuery(event.target.value)}
          className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        <ul className="max-h-48 overflow-y-auto rounded-lg border border-line bg-white">
          {products.length === 0 ? (
            <li className="px-3 py-2 text-sm text-ink3">
              {catalog ? 'No item matches that name or code.' : 'Loading the catalog…'}
            </li>
          ) : (
            products.map((product) => {
              const blocked = product.availabilityStatus === 'OUT_OF_STOCK';
              return (
                <li key={product.id} className="border-b border-line last:border-0">
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      onPick(product);
                      setQuery('');
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm disabled:text-ink3"
                  >
                    <span className="text-ink">
                      {product.name} {product.productCode}
                    </span>
                    <span className="shrink-0 text-ink2">
                      {blocked
                        ? 'Out'
                        : chosenIds?.has(product.id)
                          ? 'Add another'
                          : product.listedPrice
                            ? formatRupee(product.listedPrice)
                            : 'Price on request'}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
