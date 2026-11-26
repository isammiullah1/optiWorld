'use client';

import type { WholesalerCatalogItem, WholesalerRetailerConnection } from '@optiworld/shared';
import { centsToMoney, moneyToCents } from '@optiworld/shared';
import { Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { formatRupee } from '@/components/retailer/dashboard-format';

import { createWholesalerOrder, loadCatalog } from './wholesaler-api';
import { fieldClass } from './wholesaler-surface';

type Line = {
  id: string;
  name: string;
  code: string;
  price: string;
  quantity: number;
};

export function NewWholesalerOrderDialog({
  token,
  retailers,
  onClose,
  onCreated,
}: {
  token: string;
  retailers: readonly WholesalerRetailerConnection[];
  onClose: () => void;
  onCreated: () => void;
}): React.ReactElement {
  const [retailerOrgId, setRetailerOrgId] = useState(retailers[0]?.retailerOrgId ?? '');
  const [settlement, setSettlement] = useState<'CASH' | 'CREDIT'>('CASH');
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<WholesalerCatalogItem[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadCatalog(token, {})
      .then(setCatalog)
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'The catalog could not be loaded');
      });
  }, [token]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog
      .filter((product) => product.availabilityStatus === 'AVAILABLE')
      .filter((product) => {
        if (!needle) {
          return true;
        }
        return (
          product.name.toLowerCase().includes(needle) ||
          product.productCode.toLowerCase().includes(needle)
        );
      })
      .slice(0, 6);
  }, [catalog, query]);

  const totalCents = lines.reduce((sum, line) => sum + moneyToCents(line.price) * line.quantity, 0);

  function addProduct(product: WholesalerCatalogItem): void {
    if (!product.listedPrice || product.isPriceOnRequest) {
      setError(`${product.name} needs a listed price before it can go on an order.`);
      return;
    }
    setError('');
    setLines((current) => {
      const existing = current.find((line) => line.id === product.id);
      if (existing) {
        return current.map((line) =>
          line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          code: product.productCode,
          price: product.listedPrice ?? '0.00',
          quantity: 1,
        },
      ];
    });
    setQuery('');
  }

  async function submit(): Promise<void> {
    if (!retailerOrgId) {
      setError('Choose a connected retailer.');
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one product.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createWholesalerOrder(token, {
        retailerOrgId,
        settlement,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        items: lines.map((line) => ({ catalogProductId: line.id, quantity: line.quantity })),
      });
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The order could not be opened');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-navy/40 p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-labelledby="new-order-title"
        className="grid max-h-[90vh] w-full max-w-2xl gap-3 overflow-y-auto rounded-xl border border-line bg-white p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="new-order-title" className="text-lg font-semibold text-ink">
              New order
            </h2>
            <p className="text-sm text-ink2">Open an order for a connected retailer.</p>
          </div>
          <button type="button" aria-label="Close" className="text-ink2" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <label className="grid gap-1 text-xs text-ink2">
          Retailer
          <select
            aria-label="Retailer for this order"
            value={retailerOrgId}
            onChange={(event) => setRetailerOrgId(event.target.value)}
            className={fieldClass}
          >
            {retailers.length === 0 ? <option value="">No connected retailers</option> : null}
            {retailers.map((retailer) => (
              <option key={retailer.retailerOrgId} value={retailer.retailerOrgId}>
                {retailer.retailerName}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Settlement">
          <button
            type="button"
            onClick={() => setSettlement('CASH')}
            className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-medium ${
              settlement === 'CASH'
                ? 'border border-teal bg-teal text-white'
                : 'border border-teal bg-teal-soft text-teal'
            }`}
          >
            Cash
          </button>
          <button
            type="button"
            onClick={() => setSettlement('CREDIT')}
            className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-medium ${
              settlement === 'CREDIT'
                ? 'border border-amber bg-amber text-white'
                : 'border border-amber bg-amber-soft text-amber'
            }`}
          >
            Credit
          </button>
        </div>
        <label className="grid gap-1 text-xs text-ink2">
          Catalog
          <span className="flex h-11 items-center gap-2 rounded-lg border border-line px-3">
            <Search size={16} className="text-action" aria-hidden="true" />
            <input
              aria-label="Search catalog"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or code"
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
            />
          </span>
        </label>
        {query.trim() ? (
          <ul className="grid gap-1">
            {matches.length === 0 ? (
              <li className="text-sm text-ink2">No catalog product matches.</li>
            ) : (
              matches.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-left text-sm hover:border-action"
                    onClick={() => addProduct(product)}
                  >
                    <span>
                      {product.name} <span className="text-ink2">{product.productCode}</span>
                    </span>
                    <span className="text-action">
                      {product.listedPrice && !product.isPriceOnRequest
                        ? formatRupee(product.listedPrice)
                        : 'Price on request'}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
        {lines.length === 0 ? (
          <p className="rounded-lg bg-canvas px-3 py-3 text-sm text-ink2">
            Search the catalog and add a product.
          </p>
        ) : (
          <ul className="grid gap-2">
            {lines.map((line) => (
              <li
                key={line.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
              >
                <span className="text-sm text-ink">
                  {line.name} <span className="text-ink2">{line.code}</span>
                </span>
                <span className="flex items-center gap-2">
                  <input
                    aria-label={`Quantity for ${line.name}`}
                    inputMode="numeric"
                    value={String(line.quantity)}
                    onChange={(event) => {
                      const quantity = Number(event.target.value.replace(/\D/g, ''));
                      setLines((current) =>
                        current.map((item) =>
                          item.id === line.id
                            ? {
                                ...item,
                                quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
                              }
                            : item,
                        ),
                      );
                    }}
                    className="h-9 w-16 rounded-lg border border-line text-center text-sm"
                  />
                  <span className="text-sm font-medium text-teal">
                    {formatRupee(centsToMoney(moneyToCents(line.price) * line.quantity))}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${line.name}`}
                    className="grid h-8 w-8 place-items-center rounded-lg bg-danger-soft text-danger"
                    onClick={() =>
                      setLines((current) => current.filter((item) => item.id !== line.id))
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <label className="grid gap-1 text-xs text-ink2">
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink outline-none focus:border-action"
          />
        </label>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-ink">
            {lines.length > 0 ? formatRupee(centsToMoney(totalCents)) : '₨ 0.00'}
          </p>
          <button
            type="button"
            disabled={busy || retailers.length === 0}
            className="inline-flex min-h-11 items-center rounded-lg bg-action px-4 text-sm font-semibold text-white disabled:opacity-60"
            onClick={() => void submit()}
          >
            {busy ? 'Opening…' : 'Open order'}
          </button>
        </div>
      </div>
    </div>
  );
}
