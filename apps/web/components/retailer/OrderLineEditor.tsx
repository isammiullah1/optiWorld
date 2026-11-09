'use client';

import type { RetailerOrderDetail, WholesalerCatalog } from '@optiworld/shared';
import { useState } from 'react';

import { updateRetailerOrderItems } from './catalog-api';
import { CatalogPicker } from './CatalogPicker';

type DraftLine = {
  catalogProductId: string;
  productName: string;
  quantity: number;
};

export function OrderLineEditor({
  token,
  order,
  onClose,
  onSaved,
}: {
  token: string;
  order: RetailerOrderDetail;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const [lines, setLines] = useState<DraftLine[]>(
    order.items.flatMap((item) =>
      item.catalogProductId
        ? [
            {
              catalogProductId: item.catalogProductId,
              productName: item.productName,
              quantity: item.quantity,
            },
          ]
        : [],
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setQuantity(catalogProductId: string, quantity: number): void {
    const next = Math.max(1, Math.min(10_000, quantity));
    setLines((current) =>
      current.map((entry) =>
        entry.catalogProductId === catalogProductId ? { ...entry, quantity: next } : entry,
      ),
    );
  }

  function addProduct(product: WholesalerCatalog['products'][number]): void {
    if (product.availabilityStatus === 'OUT_OF_STOCK') {
      return;
    }
    setLines((current) => {
      const existing = current.find((line) => line.catalogProductId === product.id);
      if (existing) {
        return current.map((line) =>
          line.catalogProductId === product.id
            ? { ...line, quantity: Math.min(10_000, line.quantity + 1) }
            : line,
        );
      }
      return [...current, { catalogProductId: product.id, productName: product.name, quantity: 1 }];
    });
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (lines.length === 0) {
          setError('An order needs at least one item. Cancel the order to remove it.');
          return;
        }
        setBusy(true);
        setError(null);
        void updateRetailerOrderItems(
          token,
          order.id,
          lines.map((line) => ({
            catalogProductId: line.catalogProductId,
            quantity: line.quantity,
          })),
        )
          .then(() => onSaved())
          .catch((caught: unknown) => {
            setError(caught instanceof Error ? caught.message : 'The order could not be saved');
          })
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-ink">Edit order</h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-lg px-2 text-sm text-ink2"
        >
          Close
        </button>
      </div>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lines.map((line) => (
          <li
            key={line.catalogProductId}
            className="grid gap-2 rounded-lg border border-line bg-canvas p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-sm font-medium text-ink">{line.productName}</span>
              <button
                type="button"
                onClick={() =>
                  setLines((current) =>
                    current.filter((entry) => entry.catalogProductId !== line.catalogProductId),
                  )
                }
                className="shrink-0 text-sm font-medium text-danger"
              >
                Remove
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={`Decrease ${line.productName}`}
                disabled={line.quantity <= 1}
                onClick={() => setQuantity(line.catalogProductId, line.quantity - 1)}
                className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-line bg-white text-ink disabled:text-ink3"
              >
                −
              </button>
              <input
                aria-label={`Quantity for ${line.productName}`}
                inputMode="numeric"
                value={String(line.quantity)}
                onChange={(event) => {
                  const quantity = Number(event.target.value.replace(/\D/g, ''));
                  setQuantity(
                    line.catalogProductId,
                    Number.isInteger(quantity) && quantity > 0 ? quantity : 1,
                  );
                }}
                className="w-16 min-h-[44px] rounded-lg border border-line bg-white px-2 text-center text-sm text-ink outline-none focus:border-action"
              />
              <button
                type="button"
                aria-label={`Increase ${line.productName}`}
                disabled={line.quantity >= 10_000}
                onClick={() => setQuantity(line.catalogProductId, line.quantity + 1)}
                className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-line bg-white text-ink disabled:text-ink3"
              >
                +
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="grid items-start gap-3 border-t border-line pt-3 lg:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="grid gap-2">
          <CatalogPicker
            token={token}
            wholesalerId={order.wholesaler.id}
            chosenIds={new Set(lines.map((line) => line.catalogProductId))}
            onPick={addProduct}
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={busy || lines.length === 0}
          className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Save order'}
        </button>
      </div>
    </form>
  );
}
