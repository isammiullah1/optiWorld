'use client';

import {
  centsToMoney,
  moneyToCents,
  STOCK_ADJUST_REASONS,
  type AdjustStockRequest,
  type CostReceipt,
  type DamagedEntry,
  type InventoryDetail,
} from '@optiworld/shared';
import {
  ArchiveRestore,
  BadgeIndianRupee,
  Boxes,
  CircleDollarSign,
  ClipboardList,
  Minus,
  Package,
  Plus,
  Receipt,
  Scale,
  ShoppingBag,
  TriangleAlert,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { formatRupee, formatShortDate } from './dashboard-format';
import {
  adjustInventoryStock,
  loadInventoryDetail,
  restoreInventoryBatch,
  updateInventoryBatch,
} from './inventory-api';

const REASON_LABELS: Record<(typeof STOCK_ADJUST_REASONS)[number], string> = {
  RECEIVED: 'Received',
  DAMAGED: 'Damaged',
  CORRECTION: 'Correction',
};

const TYPE_LABELS = {
  OPENING: 'Opening',
  SALE: 'Sale',
  RECEIVED: 'Received',
  DAMAGED: 'Damaged',
  LOST: 'Lost',
  CORRECTION: 'Correction',
} as const;

export function BatchDetail({ batchId }: { batchId: string }): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const showCost = session?.user.role === 'OWNER';
  const showMovement = session?.user.role === 'OWNER';
  const [detail, setDetail] = useState<InventoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceSaving, setPriceSaving] = useState(false);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [costOpen, setCostOpen] = useState(false);
  const [damageOpen, setDamageOpen] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockReason, setRestockReason] = useState('');
  const [restockSaving, setRestockSaving] = useState(false);
  const [restockError, setRestockError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDetail(await loadInventoryDetail(token, batchId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'This batch could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [token, batchId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="grid gap-3" aria-busy="true">
        <div className="h-24 rounded-xl bg-white" />
        <div className="h-40 rounded-xl bg-white" />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <p role="alert" className="rounded-xl border border-line bg-white p-4 text-sm text-danger">
        {error ?? 'This batch could not be loaded'}
      </p>
    );
  }
  const { batch } = detail;
  const archived = batch.archivedAt !== null;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/retailer/inventory" className="text-sm text-action">
            Inventory
          </Link>
          <h1 className="text-xl font-semibold text-ink">{batch.productName}</h1>
          <p className="text-sm text-ink2">
            {batch.priceCode}
            {batch.brand ? ` · ${batch.brand}` : ''} · {batch.category}
          </p>
        </div>
        {archived ? (
          <button
            type="button"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal px-4 text-sm font-medium text-white"
            onClick={() => {
              setRestockReason('');
              setRestockError(null);
              setRestockOpen(true);
            }}
          >
            <ArchiveRestore size={16} aria-hidden="true" />
            Restock
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-2 border-teal bg-teal px-4 text-sm font-semibold text-white"
              onClick={() => {
                setPriceError(null);
                setPriceOpen(true);
              }}
            >
              <BadgeIndianRupee size={16} aria-hidden="true" />
              Adjust sale price
            </button>
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-2 border-action bg-action px-4 text-sm font-semibold text-white"
              onClick={() => setAdjustOpen(true)}
            >
              <Boxes size={16} aria-hidden="true" />
              Adjust stock
            </button>
          </div>
        )}
      </div>
      {archived ? (
        <p className="rounded-xl border border-navy bg-white px-4 py-3 text-sm text-ink">
          This product is archived{batch.archiveReason ? `: ${batch.archiveReason}` : ''}
          {batch.archivedBy ? ` · ${batch.archivedBy}` : ''}. Restock puts it back on the live list.
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Current stock"
          value={String(batch.stockQty)}
          icon={Package}
          card={BLUE_CARD}
          mark="bg-action-soft text-action"
          badge={batch.outOfStock}
          low={batch.lowStock}
          aside={
            archived ? undefined : (
              <CardAction
                label="Adjust stock"
                icon={Boxes}
                className="border-action bg-action text-white"
                onClick={() => setAdjustOpen(true)}
              />
            )
          }
        />
        <Stat
          label="Stock acquired"
          value={String(detail.acquiredQty)}
          icon={Boxes}
          card={NAVY_CARD}
          mark="bg-white text-navy"
        />
        <Stat
          label="Damaged stock"
          value={String(detail.damagedQty)}
          icon={TriangleAlert}
          card={DANGER_CARD}
          mark="bg-danger-soft text-danger"
          aside={
            <CardAction
              label="View records"
              icon={ClipboardList}
              className="border-danger bg-danger text-white"
              onClick={() => setDamageOpen(true)}
            />
          }
        />
        <Stat
          label="Total sold items"
          value={String(detail.soldQty)}
          icon={ShoppingBag}
          card={TEAL_CARD}
          mark="bg-teal-soft text-teal"
        />
        {showCost && batch.costPrice ? (
          <Stat
            label="Average cost price"
            value={formatRupee(batch.costPrice)}
            icon={CircleDollarSign}
            card={NAVY_CARD}
            mark="bg-white text-navy"
            aside={
              <CardAction
                label="View receipts"
                icon={Receipt}
                className="border-navy bg-navy text-white"
                onClick={() => setCostOpen(true)}
              />
            }
          />
        ) : null}
        <Stat
          label="Sale price"
          value={formatRupee(batch.salePrice)}
          icon={BadgeIndianRupee}
          card={TEAL_CARD}
          mark="bg-teal-soft text-teal"
          aside={
            archived ? undefined : (
              <CardAction
                label="Adjust price"
                icon={BadgeIndianRupee}
                className="border-teal bg-teal text-white"
                onClick={() => {
                  setPriceError(null);
                  setPriceOpen(true);
                }}
              />
            )
          }
        />
        <Stat
          label="Low stock threshold"
          value={String(batch.lowStockThreshold)}
          icon={TriangleAlert}
          card={batch.lowStock ? AMBER_CARD : NAVY_CARD}
          mark={batch.lowStock ? 'bg-amber-soft text-amber' : 'bg-white text-navy'}
        />
        <section className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 ${AMBER_CARD}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-amber-soft text-amber">
            <Scale size={15} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-ink3">Cost vs sale</p>
            {showCost && detail.costTotal ? (
              <p className="text-sm font-semibold leading-tight text-navy">
                Cost {formatRupee(detail.costTotal)}
              </p>
            ) : null}
            <p className="text-sm font-semibold leading-tight text-teal">
              Sale {formatRupee(detail.saleTotal)}
            </p>
          </div>
        </section>
      </div>
      {detail.wholesalers.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {detail.wholesalers.map((wholesaler) => (
            <Link
              key={wholesaler.orgId}
              href={`/retailer/wholesalers/${wholesaler.orgId}/catalog`}
              className="inline-flex min-h-[44px] items-center rounded-lg border border-line bg-white px-4 text-sm text-action"
            >
              Reorder from {wholesaler.name}
            </Link>
          ))}
        </div>
      ) : null}
      {showMovement ? (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          <h2 className="border-b border-line px-4 py-3 text-md font-semibold text-ink">
            Stock movement
          </h2>
          {detail.movements.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink2">No stock movements yet.</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {['Date', 'Type', 'Changed by', 'Qty change', 'Running balance'].map(
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
                {detail.movements.map((movement) => (
                  <tr key={movement.id} className="border-b border-line last:border-b-0">
                    <td className="px-3 py-3 text-sm text-ink2">
                      {formatMovementDate(movement.occurredAt)}
                    </td>
                    <td className="px-3 py-3 text-sm text-ink">
                      {movement.quantityChange === 0 && movement.note
                        ? 'Price update'
                        : TYPE_LABELS[movement.type]}
                      {movement.note ? (
                        <span className="mt-1 block text-xs text-ink2">{movement.note}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-sm text-ink">{movement.changedBy ?? '—'}</td>
                    <td
                      className={`px-3 py-3 text-sm ${movement.quantityChange < 0 ? 'text-danger' : 'text-teal'}`}
                    >
                      {movement.quantityChange > 0
                        ? `+${movement.quantityChange}`
                        : movement.quantityChange}
                    </td>
                    <td className="px-3 py-3 text-sm text-ink">{movement.balance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
      {damageOpen ? (
        <DamagedStockDialog
          productName={batch.productName}
          total={detail.damagedQty}
          entries={detail.damagedEntries}
          onClose={() => setDamageOpen(false)}
        />
      ) : null}
      {costOpen && showCost && batch.costPrice ? (
        <CostReceiptsDialog
          productName={batch.productName}
          average={batch.costPrice}
          receipts={detail.costReceipts}
          onClose={() => setCostOpen(false)}
        />
      ) : null}
      {restockOpen && token && archived ? (
        <RestockDialog
          productName={batch.productName}
          reason={restockReason}
          saving={restockSaving}
          error={restockError}
          onReason={setRestockReason}
          onClose={() => setRestockOpen(false)}
          onSave={async () => {
            if (restockReason.trim().length === 0) {
              return;
            }
            setRestockSaving(true);
            setRestockError(null);
            try {
              await restoreInventoryBatch(token, batch.id, restockReason.trim());
              setDetail(await loadInventoryDetail(token, batchId));
              setRestockOpen(false);
              setRestockReason('');
            } catch (caught) {
              setRestockError(
                caught instanceof Error ? caught.message : 'The product could not be restocked',
              );
            } finally {
              setRestockSaving(false);
            }
          }}
        />
      ) : null}
      {adjustOpen && token ? (
        <AdjustDialog
          showCost={showCost}
          onClose={() => setAdjustOpen(false)}
          onSave={async (input) => {
            const next = await adjustInventoryStock(token, batchId, input);
            setDetail(next);
            setAdjustOpen(false);
          }}
        />
      ) : null}
      {priceOpen && token ? (
        <SalePriceDialog
          price={batch.salePrice}
          saving={priceSaving}
          error={priceError}
          onClose={() => setPriceOpen(false)}
          onSave={async (salePrice) => {
            setPriceSaving(true);
            setPriceError(null);
            try {
              await updateInventoryBatch(token, batch.id, {
                salePrice,
                lowStockThreshold: batch.lowStockThreshold,
              });
              setDetail(await loadInventoryDetail(token, batchId));
              setPriceOpen(false);
            } catch (caught) {
              setPriceError(
                caught instanceof Error ? caught.message : 'The sale price could not be saved',
              );
            } finally {
              setPriceSaving(false);
            }
          }}
        />
      ) : null}
    </section>
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
const DANGER_CARD =
  'border-danger bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-red)_16%,white)_0%,white_55%,var(--ow-red-soft)_100%)]';

function Stat({
  label,
  value,
  icon: Icon,
  card,
  mark,
  badge = false,
  low = false,
  aside,
}: {
  label: string;
  value: string;
  icon: typeof Package;
  card: string;
  mark: string;
  badge?: boolean;
  low?: boolean;
  aside?: React.ReactNode;
}): React.ReactElement {
  return (
    <section
      className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 rounded-xl border px-3 py-3 ${card}`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${mark}`}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <div className="min-w-0 text-left">
        <p className="truncate text-xs font-medium uppercase tracking-wide text-ink3">{label}</p>
        <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-ink">
          {value}
          {badge ? (
            <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
              Out of stock
            </span>
          ) : null}
          {low && !badge ? (
            <span className="rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">
              Low
            </span>
          ) : null}
        </p>
      </div>
      {aside ? <div className="col-span-2 min-w-0">{aside}</div> : null}
    </section>
  );
}

const DETAIL_RESTOCK_REASONS = [
  'Back in stock',
  'Removed by mistake',
  'Ordered again',
  'Selling it again',
] as const;

function RestockDialog({
  productName,
  reason,
  saving,
  error,
  onReason,
  onClose,
  onSave,
}: {
  productName: string;
  reason: string;
  saving: boolean;
  error: string | null;
  onReason: (value: string) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
}): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="restock-title"
        className="grid w-full max-w-md gap-3 rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave();
        }}
      >
        <h2 id="restock-title" className="text-lg font-semibold text-ink">
          Restock {productName}
        </h2>
        <p className="text-sm text-ink2">
          Write why it is coming back. It returns to the live list with its current stock.
        </p>
        <div className="flex flex-wrap gap-2">
          {DETAIL_RESTOCK_REASONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              aria-pressed={reason === suggestion}
              onClick={() => onReason(suggestion)}
              className={`min-h-11 rounded-full border px-3 text-xs ${reason === suggestion ? 'border-action bg-action-soft text-action' : 'border-line bg-white text-ink2'}`}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <label className="grid gap-1 text-sm text-ink2">
          Reason
          <textarea
            value={reason}
            placeholder="Write the reason"
            onChange={(event) => onReason(event.target.value)}
            rows={2}
            maxLength={500}
            className="rounded-lg border border-line px-3 py-2 text-base text-ink outline-none focus:border-action"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-[44px] flex-1 rounded-lg border border-line text-sm text-ink2"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || reason.trim().length === 0}
            className="min-h-[44px] flex-1 rounded-lg bg-teal text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Restock'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SalePriceDialog({
  price,
  saving,
  error,
  onClose,
  onSave,
}: {
  price: string;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (salePrice: string) => Promise<void>;
}): React.ReactElement {
  const [value, setValue] = useState(price);
  const valid = /^\d{1,10}(\.\d{1,2})?$/.test(value.trim());

  function step(rupees: number): void {
    const current = valid ? moneyToCents(value.trim()) : moneyToCents(price);
    setValue(centsToMoney(Math.max(0, current + rupees * 100)));
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="sale-price-title"
        className="grid w-full max-w-md gap-3 rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) {
            return;
          }
          void onSave(value.trim());
        }}
      >
        <h2 id="sale-price-title" className="text-lg font-semibold text-ink">
          Sale price
        </h2>
        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="Decrease sale price"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line text-ink"
            onClick={() => step(-1)}
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <label className="grid min-w-0 flex-1 gap-1 text-sm text-ink2">
            Amount (₨)
            <input
              value={value}
              inputMode="decimal"
              onChange={(event) => setValue(event.target.value)}
              className="min-h-[44px] rounded-lg border border-line px-3 text-base text-ink outline-none focus:border-action"
            />
          </label>
          <button
            type="button"
            aria-label="Increase sale price"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-teal bg-teal-soft text-teal"
            onClick={() => step(1)}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        </div>
        {valid ? null : (
          <p role="alert" className="text-sm text-danger">
            Enter the sale price as an amount.
          </p>
        )}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-[44px] flex-1 rounded-lg border border-line text-sm text-ink2"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !valid}
            className="min-h-[44px] flex-1 rounded-lg bg-action text-sm font-medium text-white disabled:opacity-60"
          >
            Save price
          </button>
        </div>
      </form>
    </div>
  );
}

function CardAction({
  label,
  icon: Icon,
  className,
  onClick,
}: {
  label: string;
  icon: typeof Package;
  className: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 w-full min-w-0 items-center justify-center gap-1 rounded-lg border px-2 text-xs font-semibold leading-none shadow-none ${className}`}
    >
      <Icon size={14} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function CostReceiptsDialog({
  productName,
  average,
  receipts,
  onClose,
}: {
  productName: string;
  average: string;
  receipts: readonly CostReceipt[];
  onClose: () => void;
}): React.ReactElement {
  const totalQty = receipts.reduce((sum, receipt) => sum + receipt.quantity, 0);
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="average-cost-title"
        className="grid max-h-[92vh] w-full max-w-lg gap-3 overflow-y-auto rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="average-cost-title" className="text-lg font-semibold text-ink">
              Average cost price
            </h2>
            <p className="text-sm text-ink2">{productName}</p>
          </div>
          <button type="button" className="min-h-[44px] px-2 text-sm text-ink2" onClick={onClose}>
            Close
          </button>
        </div>
        {receipts.length === 0 ? (
          <p className="text-sm text-ink2">
            No acquisition cost has been recorded for this product.
          </p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {['Date', 'Quantity', 'Cost price', 'Amount'].map((heading) => (
                  <th
                    key={heading}
                    className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id} className="border-b border-line last:border-b-0">
                  <td className="px-2 py-3 text-sm text-ink">
                    {formatShortDate(receipt.occurredAt)}
                    <span className="mt-1 block text-xs text-ink2">
                      {receipt.kind === 'OPENING' ? 'Opening stock' : 'Received'}
                    </span>
                  </td>
                  <td className="px-2 py-3 text-sm text-ink">{receipt.quantity}</td>
                  <td className="px-2 py-3 text-sm text-ink">
                    {receipt.unitCost ? formatRupee(receipt.unitCost) : '—'}
                  </td>
                  <td className="px-2 py-3 text-sm text-ink">
                    {receipt.lineCost ? formatRupee(receipt.lineCost) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="grid gap-1 rounded-lg border border-navy bg-action-soft px-3 py-3">
          {receipts.length > 0 ? <p className="text-sm text-ink2">{totalQty} acquired</p> : null}
          <p className="text-sm font-semibold text-navy">
            Average cost price {formatRupee(average)}
          </p>
        </div>
      </div>
    </div>
  );
}

function DamagedStockDialog({
  productName,
  total,
  entries,
  onClose,
}: {
  productName: string;
  total: number;
  entries: readonly DamagedEntry[];
  onClose: () => void;
}): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="damaged-stock-title"
        className="grid max-h-[92vh] w-full max-w-lg gap-3 overflow-y-auto rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="damaged-stock-title" className="text-lg font-semibold text-ink">
              Damaged stock
            </h2>
            <p className="text-sm text-ink2">{productName}</p>
          </div>
          <button type="button" className="min-h-[44px] px-2 text-sm text-ink2" onClick={onClose}>
            Close
          </button>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-ink2">No damaged stock has been recorded for this product.</p>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {['When', 'Entered by', 'Quantity', 'Reason'].map((heading) => (
                  <th
                    key={heading}
                    className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-line last:border-b-0">
                  <td className="px-2 py-3 text-sm text-ink">
                    {formatMovementDate(entry.occurredAt)}
                  </td>
                  <td className="px-2 py-3 text-sm text-ink">{entry.enteredBy ?? '—'}</td>
                  <td className="px-2 py-3 text-sm text-ink">{entry.quantity}</td>
                  <td className="px-2 py-3 text-sm text-ink">{entry.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="rounded-lg border border-danger bg-danger-soft px-3 py-3">
          <p className="text-sm font-semibold text-danger">Damaged stock {total}</p>
        </div>
      </div>
    </div>
  );
}

function AdjustDialog({
  showCost,
  onClose,
  onSave,
}: {
  showCost: boolean;
  onClose: () => void;
  onSave: (input: AdjustStockRequest) => Promise<void>;
}): React.ReactElement {
  const [reason, setReason] = useState<(typeof STOCK_ADJUST_REASONS)[number]>('RECEIVED');
  const [quantity, setQuantity] = useState('1');
  const [costPrice, setCostPrice] = useState('');
  const [damageReason, setDamageReason] = useState('');
  const [direction, setDirection] = useState<'ADD' | 'REMOVE'>('ADD');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjust-stock-title"
        className="grid w-full max-w-md gap-3 rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = Number(quantity);
          if (!Number.isInteger(parsed) || parsed <= 0) {
            setError('Enter a quantity greater than zero');
            return;
          }
          if (
            showCost &&
            reason === 'RECEIVED' &&
            !/^\d{1,10}(\.\d{1,2})?$/.test(costPrice.trim())
          ) {
            setError('Enter the cost price for the stock received');
            return;
          }
          setSaving(true);
          setError(null);
          void onSave({
            reason,
            quantity: parsed,
            ...(reason === 'CORRECTION' ? { direction } : {}),
            ...(showCost && reason === 'RECEIVED' ? { costPrice: costPrice.trim() } : {}),
            ...(reason === 'DAMAGED' && damageReason.trim() ? { note: damageReason.trim() } : {}),
          }).catch((caught: unknown) => {
            setError(caught instanceof Error ? caught.message : 'Stock could not be adjusted');
            setSaving(false);
          });
        }}
      >
        <h2 id="adjust-stock-title" className="text-lg font-semibold text-ink">
          Adjust stock
        </h2>
        <label className="grid gap-1 text-sm text-ink2">
          Adjustment
          <select
            value={reason}
            onChange={(event) =>
              setReason(event.target.value as (typeof STOCK_ADJUST_REASONS)[number])
            }
            className="min-h-[44px] rounded-lg border border-line px-3 text-base text-ink"
          >
            {STOCK_ADJUST_REASONS.map((option) => (
              <option key={option} value={option}>
                {REASON_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        {reason === 'CORRECTION' ? (
          <div className="flex gap-2">
            {(['ADD', 'REMOVE'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`min-h-[44px] flex-1 rounded-lg border text-sm ${direction === option ? 'border-action bg-action-soft text-action' : 'border-line text-ink2'}`}
                onClick={() => setDirection(option)}
              >
                {option === 'ADD' ? 'Add' : 'Remove'}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink2">
            {reason === 'RECEIVED' ? 'This adds stock.' : 'This removes stock.'}
          </p>
        )}
        {reason === 'DAMAGED' ? (
          <label className="grid gap-1 text-sm text-ink2">
            Reason
            <input
              value={damageReason}
              maxLength={240}
              onChange={(event) => setDamageReason(event.target.value)}
              placeholder="Optional"
              className="min-h-[44px] rounded-lg border border-line px-3 text-base text-ink outline-none focus:border-action"
            />
          </label>
        ) : null}
        {showCost && reason === 'RECEIVED' ? (
          <label className="grid gap-1 text-sm text-ink2">
            Cost price (₨)
            <input
              value={costPrice}
              inputMode="decimal"
              onChange={(event) => setCostPrice(event.target.value)}
              className="min-h-[44px] rounded-lg border border-line px-3 text-base text-ink outline-none focus:border-action"
            />
          </label>
        ) : null}
        <label className="grid gap-1 text-sm text-ink2">
          Quantity
          <input
            value={quantity}
            inputMode="numeric"
            onChange={(event) => setQuantity(event.target.value)}
            className="min-h-[44px] rounded-lg border border-line px-3 text-base text-ink outline-none focus:border-action"
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            className="min-h-[44px] flex-1 rounded-lg border border-line text-sm text-ink2"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] flex-1 rounded-lg bg-action text-sm font-medium text-white"
          >
            Save adjustment
          </button>
        </div>
      </form>
    </div>
  );
}

function formatMovementDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return formatShortDate(iso);
  }
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
    date,
  );
  return `${formatShortDate(iso)}, ${time}`;
}
