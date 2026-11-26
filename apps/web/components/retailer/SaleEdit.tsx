'use client';

import {
  centsToMoney,
  isSameSaleDay,
  moneyToCents,
  resolveDiscountCents,
  type InventorySearchHit,
  type PosReceipt,
} from '@optiworld/shared';
import { Plus, Search } from 'lucide-react';
import { createContext, useContext, useEffect, useState } from 'react';

import { BillSettlement } from './BillSettlement';
import { formatRupee } from './dashboard-format';
import { cancelPosInvoice, editPosInvoice, searchPosInventory } from './pos-api';

type DraftLine = {
  id: string;
  batchId: string | null;
  name: string;
  priceCode: string;
  unitPrice: string;
  originalRate: string;
  original: number;
  quantity: number;
  removed: boolean;
  prescriptionSummary: string | null;
};

type Addition = {
  key: string;
  product: InventorySearchHit;
  quantity: number;
  unitPrice: string;
};

type PaymentChoice = 'CASH' | 'CREDIT';

type ChangeNote = { id: string; text: string };

type EditorContextValue = {
  sameDay: boolean;
  open: boolean;
  toggle: () => void;
  lines: DraftLine[];
  additions: Addition[];
  query: string;
  setQuery: (value: string) => void;
  products: InventorySearchHit[];
  searching: boolean;
  addProduct: (product: InventorySearchHit) => void;
  setLineQuantity: (id: string, quantity: number) => void;
  setLinePrice: (id: string, unitPrice: string) => void;
  toggleRemoved: (id: string) => void;
  setAdditionQuantity: (key: string, quantity: number) => void;
  setAdditionPrice: (key: string, unitPrice: string) => void;
  dropAddition: (key: string) => void;
  discountMode: 'AMOUNT' | 'PERCENT';
  discountInput: string;
  setDiscountMode: (mode: 'AMOUNT' | 'PERCENT') => void;
  setDiscountInput: (value: string) => void;
  paymentType: PaymentChoice;
  choosePayment: (value: PaymentChoice) => void;
  amountReceived: string;
  setAmountReceived: (value: string) => void;
  receivedOk: boolean;
  ratesOk: boolean;
  saving: boolean;
  changed: boolean;
  empty: boolean;
  subtotal: number;
  discountCents: number;
  nextTotal: number;
  refund: number;
  collect: number;
  changes: ChangeNote[];
  askConfirm: () => void;
  cancelAsking: boolean;
  cancelReason: string;
  cancelBusy: boolean;
  askCancel: () => void;
  setCancelReason: (value: string) => void;
  closeCancel: () => void;
  confirmCancel: () => void;
};

const EditorContext = createContext<EditorContextValue | null>(null);

function draftLines(receipt: PosReceipt): DraftLine[] {
  return receipt.items.map((item) => ({
    id: item.id,
    batchId: item.inventoryBatchId ?? null,
    name: item.productName,
    priceCode: item.priceCode,
    unitPrice: item.unitPrice,
    originalRate: item.unitPrice,
    original: item.quantity,
    quantity: item.quantity,
    removed: false,
    prescriptionSummary: item.prescriptionSummary,
  }));
}

function lineLabel(name: string, priceCode: string): string {
  return `${name} ${priceCode}`.trim();
}

function parseMoney(value: string): number | null {
  const trimmed = value.trim();
  return /^\d{1,10}(\.\d{1,2})?$/.test(trimmed) ? moneyToCents(trimmed) : null;
}

function moneyLabel(cents: number): string {
  return formatRupee(centsToMoney(cents));
}

function changeNotes(
  lines: readonly DraftLine[],
  additions: readonly Addition[],
  discountCents: number,
  previousDiscount: number,
  discountMode: 'AMOUNT' | 'PERCENT',
  discountInput: string,
  paymentType: PaymentChoice,
  previousPayment: PaymentChoice,
  receivedCents: number | null,
  previousPaid: number,
): ChangeNote[] {
  const notes: ChangeNote[] = [];
  for (const line of lines) {
    const label = lineLabel(line.name, line.priceCode);
    if (line.removed) {
      notes.push({ id: `removed-${line.id}`, text: `Removed ${label}` });
      continue;
    }
    if (line.quantity !== line.original) {
      notes.push({
        id: `qty-${line.id}`,
        text: `${label} quantity ${line.original} → ${line.quantity}`,
      });
    }
    const next = parseMoney(line.unitPrice);
    const previous = parseMoney(line.originalRate);
    if (next !== null && previous !== null && next !== previous) {
      notes.push({
        id: `rate-${line.id}`,
        text: `${label} rate ${moneyLabel(previous)} → ${moneyLabel(next)}`,
      });
    }
  }
  for (const line of additions) {
    const label = lineLabel(line.product.productName, line.product.priceCode);
    const rate = parseMoney(line.unitPrice);
    const catalog = parseMoney(line.product.salePrice);
    notes.push({
      id: `added-${line.key}`,
      text:
        rate !== null && catalog !== null && rate !== catalog
          ? `Added ${label} × ${line.quantity} at ${moneyLabel(rate)}`
          : `Added ${label} × ${line.quantity}`,
    });
  }
  if (discountCents !== previousDiscount) {
    const typed =
      discountMode === 'PERCENT' && discountInput.trim()
        ? `${discountInput.trim()}% · ${moneyLabel(discountCents)}`
        : moneyLabel(discountCents);
    notes.push({
      id: 'discount',
      text: `Discount ${moneyLabel(previousDiscount)} → ${typed}`,
    });
  }
  if (
    paymentType !== previousPayment ||
    (paymentType === 'CREDIT' && receivedCents !== previousPaid)
  ) {
    notes.push({
      id: 'payment',
      text:
        paymentType === 'CASH'
          ? 'Cash'
          : `On credit${receivedCents === null ? '' : `, received ${moneyLabel(receivedCents)}`}`,
    });
  }
  return notes;
}

function parseQuantity(value: string, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(1, Math.floor(parsed))) : 1;
}

export function SaleEdit({
  enabled,
  receipt,
  token,
  startOpen = false,
  onChanged,
  onNotice,
  onError,
  children,
}: {
  enabled: boolean;
  receipt: PosReceipt;
  token: string;
  startOpen?: boolean;
  onChanged: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  children: React.ReactNode;
}): React.ReactElement {
  if (!enabled || receipt.cancelledAt) {
    return <>{children}</>;
  }
  return (
    <SaleEditLive
      receipt={receipt}
      token={token}
      startOpen={startOpen}
      onChanged={onChanged}
      onNotice={onNotice}
      onError={onError}
    >
      {children}
    </SaleEditLive>
  );
}

function SaleEditLive({
  receipt,
  token,
  startOpen,
  onChanged,
  onNotice,
  onError,
  children,
}: {
  receipt: PosReceipt;
  token: string;
  startOpen: boolean;
  onChanged: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
  children: React.ReactNode;
}): React.ReactElement {
  const sameDay = isSameSaleDay(new Date(receipt.issuedAt));
  const [open, setOpen] = useState(startOpen);
  const [lines, setLines] = useState<DraftLine[]>(() => draftLines(receipt));
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<InventorySearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(false);
  const [discountMode, setDiscountMode] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT');
  const [discountInput, setDiscountInput] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentChoice>('CASH');
  const [amountReceived, setAmountReceived] = useState('');
  const [cancelAsking, setCancelAsking] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setLines(draftLines(receipt));
    setAdditions([]);
    setQuery('');
    setReview(false);
    setDiscountMode('AMOUNT');
    setDiscountInput(moneyToCents(receipt.discount) === 0 ? '' : receipt.discount);
    setPaymentType(receipt.paymentType === 'CREDIT' ? 'CREDIT' : 'CASH');
    setAmountReceived(receipt.amountPaid);
    setCancelAsking(false);
    setCancelReason('');
  }, [open, receipt]);

  useEffect(() => {
    if (!open || !sameDay || query.trim().length < 1) {
      setProducts([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const handle = window.setTimeout(() => {
      void searchPosInventory(token, query.trim())
        .then((rows) => {
          if (active) {
            setProducts(rows);
          }
        })
        .catch(() => {
          if (active) {
            setProducts([]);
          }
        })
        .finally(() => {
          if (active) {
            setSearching(false);
          }
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [open, query, sameDay, token]);

  const kept = lines.filter((line) => !line.removed);
  const subtotal =
    kept.reduce((sum, line) => sum + (parseMoney(line.unitPrice) ?? 0) * line.quantity, 0) +
    additions.reduce((sum, line) => sum + (parseMoney(line.unitPrice) ?? 0) * line.quantity, 0);
  const discountCents = resolveDiscountCents(subtotal, discountMode, discountInput);
  const nextTotal = subtotal - discountCents + moneyToCents(receipt.deliveryCharge);
  const savedPayment: PaymentChoice = receipt.paymentType === 'CREDIT' ? 'CREDIT' : 'CASH';
  const receivedCents = paymentType === 'CREDIT' ? parseMoney(amountReceived) : nextTotal;
  const receivedOk =
    paymentType === 'CASH' || (receivedCents !== null && receivedCents <= nextTotal);
  const ratesOk =
    kept.every((line) => parseMoney(line.unitPrice) !== null) &&
    additions.every((line) => parseMoney(line.unitPrice) !== null);
  const paidCents = moneyToCents(receipt.amountPaid);
  const targetPaid =
    paymentType === 'CASH' ? nextTotal : Math.min(nextTotal, receivedCents ?? paidCents);
  const refund = receivedOk ? Math.max(0, paidCents - targetPaid) : 0;
  const collect = receivedOk ? Math.max(0, targetPaid - paidCents) : 0;
  const changed =
    additions.length > 0 ||
    lines.some(
      (line) =>
        line.removed ||
        line.quantity !== line.original ||
        (!line.removed && parseMoney(line.unitPrice) !== parseMoney(line.originalRate)),
    ) ||
    additions.some((line) => parseMoney(line.unitPrice) !== parseMoney(line.product.salePrice)) ||
    discountCents !== moneyToCents(receipt.discount) ||
    paymentType !== savedPayment ||
    (paymentType === 'CREDIT' && receivedCents !== paidCents);
  const empty = kept.length + additions.length === 0;
  const changes = changeNotes(
    lines,
    additions,
    discountCents,
    moneyToCents(receipt.discount),
    discountMode,
    discountInput,
    paymentType,
    savedPayment,
    receivedCents,
    paidCents,
  );

  function addProduct(product: InventorySearchHit): void {
    setQuery('');
    setProducts([]);
    const existing = lines.find(
      (line) =>
        (line.batchId !== null && line.batchId === product.id) ||
        (line.name === product.productName && line.priceCode === product.priceCode),
    );
    if (existing) {
      setLines((current) =>
        current.map((line) => {
          if (line.id !== existing.id) {
            return line;
          }
          if (line.removed) {
            return { ...line, removed: false };
          }
          return { ...line, quantity: Math.min(999, line.quantity + 1) };
        }),
      );
      return;
    }
    setAdditions((current) => {
      const found = current.find((line) => line.product.id === product.id);
      if (found) {
        return current.map((line) =>
          line.product.id === product.id
            ? { ...line, quantity: Math.min(99, line.quantity + 1) }
            : line,
        );
      }
      return [...current, { key: product.id, product, quantity: 1, unitPrice: product.salePrice }];
    });
  }

  function choosePayment(next: PaymentChoice): void {
    setPaymentType(next);
    if (next === 'CREDIT') {
      setAmountReceived((current) => (current.trim() ? current : receipt.amountPaid));
    }
  }

  function confirmCancel(): void {
    if (cancelReason.trim().length === 0 || cancelBusy) {
      return;
    }
    setCancelBusy(true);
    onError('');
    void cancelPosInvoice(token, receipt.id, cancelReason.trim())
      .then(async (result) => {
        onNotice(result.message);
        setCancelAsking(false);
        setOpen(false);
        await onChanged();
      })
      .catch((caught: unknown) => {
        onError(caught instanceof Error ? caught.message : 'The bill could not be cancelled.');
      })
      .finally(() => setCancelBusy(false));
  }

  function save(): void {
    if (!ratesOk || !receivedOk || receivedCents === null) {
      return;
    }
    setSaving(true);
    onError('');
    void editPosInvoice(token, receipt.id, {
      items: kept.map((line) => ({
        itemId: line.id,
        quantity: line.quantity,
        unitPrice: line.unitPrice.trim(),
      })),
      additions: additions.map((line) => ({
        inventoryBatchId: line.product.id,
        quantity: line.quantity,
        unitPrice: line.unitPrice.trim(),
      })),
      discount: centsToMoney(discountCents),
      paymentType,
      ...(paymentType === 'CREDIT' ? { amountReceived: centsToMoney(receivedCents) } : {}),
    })
      .then(async (result) => {
        onNotice(result.message);
        setReview(false);
        setOpen(false);
        await onChanged();
      })
      .catch((caught: unknown) => {
        setReview(false);
        onError(caught instanceof Error ? caught.message : 'The bill could not be updated.');
      })
      .finally(() => setSaving(false));
  }

  const value: EditorContextValue = {
    sameDay,
    open,
    toggle: () => setOpen((current) => !current),
    lines,
    additions,
    query,
    setQuery,
    products,
    searching,
    addProduct,
    setLineQuantity: (id, quantity) =>
      setLines((current) =>
        current.map((line) =>
          line.id === id
            ? { ...line, quantity: sameDay ? quantity : Math.min(quantity, line.original) }
            : line,
        ),
      ),
    setLinePrice: (id, unitPrice) =>
      setLines((current) =>
        current.map((line) => (line.id === id ? { ...line, unitPrice } : line)),
      ),
    toggleRemoved: (id) =>
      setLines((current) =>
        current.map((line) => (line.id === id ? { ...line, removed: !line.removed } : line)),
      ),
    setAdditionQuantity: (key, quantity) =>
      setAdditions((current) =>
        current.map((line) => (line.key === key ? { ...line, quantity } : line)),
      ),
    setAdditionPrice: (key, unitPrice) =>
      setAdditions((current) =>
        current.map((line) => (line.key === key ? { ...line, unitPrice } : line)),
      ),
    dropAddition: (key) => setAdditions((current) => current.filter((line) => line.key !== key)),
    discountMode,
    discountInput,
    setDiscountMode,
    setDiscountInput,
    paymentType,
    choosePayment,
    amountReceived,
    setAmountReceived,
    receivedOk,
    ratesOk,
    saving,
    changed,
    empty,
    subtotal,
    discountCents,
    nextTotal,
    refund,
    collect,
    changes,
    askConfirm: () => {
      if (ratesOk && receivedOk) {
        setReview(true);
      }
    },
    cancelAsking,
    cancelReason,
    cancelBusy,
    askCancel: () => {
      setCancelReason('');
      setCancelAsking(true);
    },
    setCancelReason,
    closeCancel: () => {
      if (!cancelBusy) {
        setCancelAsking(false);
      }
    },
    confirmCancel,
  };

  return (
    <EditorContext.Provider value={value}>
      {children}
      {review ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="presentation"
          onClick={() => {
            if (!saving) {
              setReview(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bill-edit-title"
            className="grid w-full max-w-md gap-3 rounded-xl border border-line bg-white p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="bill-edit-title" className="text-md font-semibold text-ink">
              Save these changes?
            </h3>
            <p className="text-sm text-ink2">Invoice #{receipt.invoiceNumber}</p>
            <ul className="grid gap-1 text-sm text-ink">
              {changes.map((note) => (
                <li key={note.id}>{note.text}</li>
              ))}
            </ul>
            <p className="text-sm font-medium text-ink">
              Total {formatRupee(receipt.total)} → {formatRupee(centsToMoney(nextTotal))}
            </p>
            {refund > 0 ? (
              <p className="text-sm text-ink2">
                {formatRupee(centsToMoney(refund))} already received will be brought in line with
                the new total.
              </p>
            ) : null}
            {collect > 0 ? (
              <p className="text-sm text-ink2">
                {formatRupee(centsToMoney(collect))} will be recorded as received.
              </p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setReview(false)}
                className="h-11 flex-1 rounded-lg border border-line bg-white text-sm font-medium text-ink2 disabled:opacity-60"
              >
                Go back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="h-11 flex-1 rounded-lg bg-action text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </EditorContext.Provider>
  );
}

export function SaleEditPanel(): React.ReactElement | null {
  const editor = useContext(EditorContext);
  if (!editor) {
    return null;
  }
  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={editor.toggle}
        className="h-11 rounded-lg border border-action bg-white text-sm font-medium text-action"
      >
        {editor.open ? 'Close edit' : 'Edit bill'}
      </button>
      {editor.open ? (
        <div className="grid gap-2 rounded-lg border border-line bg-white p-3">
          <p className="text-xs text-ink2">
            {editor.sameDay
              ? 'This bill is from today. Change a rate, the discount, cash or credit, or the items.'
              : 'This bill is from an earlier day. Change a rate, the discount, or cash and credit. A quantity can only go down.'}
          </p>
          {!editor.ratesOk ? (
            <p className="text-xs text-danger">Enter a rate for each item.</p>
          ) : null}
          {editor.empty ? (
            <p className="text-xs text-amber">Keep at least one item, or cancel the bill.</p>
          ) : null}
          <button
            type="button"
            disabled={
              editor.saving ||
              !editor.changed ||
              editor.empty ||
              !editor.ratesOk ||
              !editor.receivedOk
            }
            onClick={editor.askConfirm}
            className="h-11 rounded-lg bg-action text-sm font-medium text-white disabled:opacity-60"
          >
            Save bill
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function SaleBillLines({ fallback }: { fallback: React.ReactNode }): React.ReactElement {
  const editor = useContext(EditorContext);
  if (!editor?.open) {
    return <>{fallback}</>;
  }
  let number = 0;
  return (
    <>
      {editor.lines.map((line) => {
        if (!line.removed) {
          number += 1;
        }
        const visibleNumber = number;
        const priced = parseMoney(line.unitPrice);
        const amount = centsToMoney((priced ?? 0) * line.quantity);
        return (
          <LineRows
            key={line.id}
            number={line.removed ? '—' : String(visibleNumber)}
            name={lineLabel(line.name, line.priceCode)}
            removed={line.removed}
            quantity={line.quantity}
            max={editor.sameDay ? 999 : line.original}
            unitPrice={line.unitPrice}
            amount={line.removed ? '—' : formatRupee(amount)}
            summary={line.prescriptionSummary}
            onQuantity={(quantity) => editor.setLineQuantity(line.id, quantity)}
            onPrice={(unitPrice) => editor.setLinePrice(line.id, unitPrice)}
            onToggle={() => editor.toggleRemoved(line.id)}
          />
        );
      })}
      {editor.additions.map((line) => {
        number += 1;
        const priced = parseMoney(line.unitPrice);
        const amount = centsToMoney((priced ?? 0) * line.quantity);
        const name = lineLabel(line.product.productName, line.product.priceCode);
        return (
          <LineRows
            key={line.key}
            number={String(number)}
            name={name}
            removed={false}
            quantity={line.quantity}
            max={99}
            unitPrice={line.unitPrice}
            amount={formatRupee(amount)}
            summary={null}
            onQuantity={(quantity) => editor.setAdditionQuantity(line.key, quantity)}
            onPrice={(unitPrice) => editor.setAdditionPrice(line.key, unitPrice)}
            onToggle={() => editor.dropAddition(line.key)}
          />
        );
      })}
      {editor.sameDay ? (
        <tr className="border-t border-action bg-action-soft">
          <td className="px-3 py-3">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-action text-white"
              aria-hidden="true"
            >
              <Plus size={16} />
            </span>
          </td>
          <td className="px-3 py-3" colSpan={4}>
            <label className="grid gap-1">
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-action">
                <Search size={14} aria-hidden="true" />
                Add an item
              </span>
              <input
                aria-label="Add an item by name or code"
                value={editor.query}
                placeholder="Search by name or code, then choose it"
                onChange={(event) => editor.setQuery(event.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-action bg-white px-3 text-sm text-ink outline-none focus:border-action"
              />
            </label>
            {editor.query.trim().length > 0 ? (
              <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-white">
                {editor.searching ? (
                  <li className="px-3 py-2 text-sm text-ink3">Searching…</li>
                ) : editor.products.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-ink3">
                    No item matches that name or code.
                  </li>
                ) : (
                  editor.products.map((product) => (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => editor.addProduct(product)}
                        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 text-left text-sm hover:bg-action-soft"
                      >
                        <span className="inline-flex min-w-0 items-center gap-2 text-ink">
                          <Plus size={16} className="shrink-0 text-action" aria-hidden="true" />
                          <span className="min-w-0">
                            {product.productName} {product.priceCode}
                          </span>
                        </span>
                        <span className="shrink-0 text-ink2">
                          {formatRupee(product.salePrice)} · {product.stockQty}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function LineRows({
  number,
  name,
  removed,
  quantity,
  max,
  unitPrice,
  amount,
  summary,
  onQuantity,
  onPrice,
  onToggle,
}: {
  number: string;
  name: string;
  removed: boolean;
  quantity: number;
  max: number;
  unitPrice: string;
  amount: string;
  summary: string | null;
  onQuantity: (quantity: number) => void;
  onPrice: (unitPrice: string) => void;
  onToggle: () => void;
}): React.ReactElement {
  return (
    <>
      <tr className="border-b border-action-soft align-top">
        <td className="px-3 py-2 text-sm text-ink2">{number}</td>
        <td className="px-3 py-2">
          <p className={`text-sm text-ink ${removed ? 'line-through' : ''}`}>{name}</p>
          <button type="button" onClick={onToggle} className="text-xs font-medium text-danger">
            {removed ? 'Keep' : 'Remove'}
          </button>
        </td>
        <td className="px-3 py-2">
          {removed ? (
            <span className="text-sm text-ink2">—</span>
          ) : (
            <input
              inputMode="numeric"
              aria-label={`${name} quantity`}
              value={String(quantity)}
              onChange={(event) => onQuantity(parseQuantity(event.target.value, max))}
              className="w-20 min-h-[44px] rounded-lg border border-line px-2 text-sm text-ink outline-none focus:border-action"
            />
          )}
        </td>
        <td className="px-3 py-2 text-sm text-ink">
          {removed ? (
            '—'
          ) : (
            <input
              aria-label={`Rate for ${name}`}
              value={unitPrice}
              onChange={(event) => onPrice(event.target.value)}
              className="w-24 min-h-[44px] rounded-lg border border-line px-2 text-sm text-ink outline-none focus:border-action"
            />
          )}
        </td>
        <td className="px-3 py-2 text-sm text-ink">{amount}</td>
      </tr>
      {summary && !removed ? (
        <tr className="border-b border-action-soft">
          <td colSpan={5} className="px-3 pb-3 text-xs text-ink3">
            {summary}
          </td>
        </tr>
      ) : null}
    </>
  );
}

const billColumnClass =
  'min-w-0 gap-3 rounded-lg border border-action-soft bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-blue)_28%,white)_0%,white_42%,var(--ow-blue-soft)_100%)] p-4 text-sm';

export function SaleEditFrame({ children }: { children: React.ReactNode }): React.ReactElement {
  const editor = useContext(EditorContext);
  return (
    <div
      className={`grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] ${
        editor?.open ? 'lg:items-stretch' : 'items-start'
      }`}
    >
      {children}
    </div>
  );
}

export function SaleEditColumn({ children }: { children: React.ReactNode }): React.ReactElement {
  const editor = useContext(EditorContext);
  return (
    <div
      className={`${billColumnClass} ${editor?.open ? 'flex h-full flex-col' : 'grid content-start'}`}
    >
      {children}
    </div>
  );
}

export function SaleEditWhenClosed({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const editor = useContext(EditorContext);
  if (editor?.open) {
    return <></>;
  }
  return <>{children}</>;
}

export function SaleEditSummary({ receipt }: { receipt: PosReceipt }): React.ReactElement {
  const editor = useContext(EditorContext);
  if (!editor?.open) {
    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink2">Subtotal</span>
          <span className="text-ink">{formatRupee(receipt.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink2">Discount</span>
          <span className="text-ink">{formatRupee(receipt.discount)}</span>
        </div>
        {receipt.deliveryAddress ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-ink2">Delivery</span>
            <span className="text-ink">{formatRupee(receipt.deliveryCharge)}</span>
          </div>
        ) : null}
        {receipt.deliveryAddress ? (
          <p className="text-xs text-ink2">Deliver to {receipt.deliveryAddress}</p>
        ) : null}
        <div className="flex items-center justify-between gap-3 border-t border-action-soft pt-3 font-semibold text-ink">
          <span>Total</span>
          <span>{formatRupee(receipt.total)}</span>
        </div>
        <span
          className={`w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
            receipt.cancelledAt
              ? 'bg-danger-soft text-danger'
              : receipt.status === 'PAID'
                ? 'bg-teal-soft text-teal'
                : 'bg-amber-soft text-amber'
          }`}
        >
          {receipt.cancelledAt ? 'Cancelled' : receipt.status === 'PAID' ? 'Paid' : 'On credit'}
        </span>
      </>
    );
  }
  const previewPaid =
    editor.paymentType === 'CREDIT' && editor.receivedOk
      ? (parseMoney(editor.amountReceived) ?? 0)
      : 0;
  const previewBalance = Math.max(0, editor.nextTotal - previewPaid);
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-ink2">Subtotal</span>
        <span className="text-ink">{formatRupee(centsToMoney(editor.subtotal))}</span>
      </div>
      <div className="grid gap-2 text-ink2">
        <span>Discount</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              editor.setDiscountMode(editor.discountMode === 'AMOUNT' ? 'PERCENT' : 'AMOUNT')
            }
            className="rounded-full bg-action-soft px-2 py-1 text-xs text-action"
          >
            {editor.discountMode === 'AMOUNT' ? 'Amount' : '%'}
          </button>
          <input
            aria-label="Discount"
            value={editor.discountInput}
            onChange={(event) => editor.setDiscountInput(event.target.value)}
            className="min-w-0 w-20 flex-1 rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink"
          />
          <span className="text-ink">{formatRupee(centsToMoney(editor.discountCents))}</span>
        </div>
      </div>
      {receipt.deliveryAddress ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-ink2">Delivery</span>
          <span className="text-ink">{formatRupee(receipt.deliveryCharge)}</span>
        </div>
      ) : null}
      {receipt.deliveryAddress ? (
        <p className="text-xs text-ink2">Deliver to {receipt.deliveryAddress}</p>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-t border-action-soft pt-3 font-semibold text-ink">
        <span>Total</span>
        <span>{formatRupee(centsToMoney(editor.nextTotal))}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => editor.choosePayment('CASH')}
          className={`min-h-[44px] rounded-lg border text-sm font-medium ${
            editor.paymentType === 'CASH'
              ? 'border-action bg-action text-white'
              : 'border-line bg-white text-ink2'
          }`}
        >
          Cash
        </button>
        <button
          type="button"
          onClick={() => editor.choosePayment('CREDIT')}
          className={`min-h-[44px] rounded-lg border text-sm font-medium ${
            editor.paymentType === 'CREDIT'
              ? 'border-amber bg-amber text-white'
              : 'border-line bg-white text-ink2'
          }`}
        >
          On Credit
        </button>
      </div>
      {editor.paymentType === 'CREDIT' ? (
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs text-ink2">
            Amount received
            <input
              aria-label="Amount received"
              inputMode="decimal"
              value={editor.amountReceived}
              onChange={(event) => editor.setAmountReceived(event.target.value)}
              className="h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
            />
          </label>
          {editor.receivedOk ? (
            <BillSettlement
              paymentType="CREDIT"
              amountPaid={centsToMoney(previewPaid)}
              outstanding={centsToMoney(previewBalance)}
            />
          ) : (
            <p className="text-xs text-danger">Enter an amount from zero up to the bill total.</p>
          )}
        </div>
      ) : null}
    </>
  );
}

export function SaleEditDock(): React.ReactElement | null {
  const editor = useContext(EditorContext);
  if (!editor?.open) {
    return null;
  }
  if (editor.cancelAsking) {
    return (
      <div className="mt-auto grid gap-2 rounded-lg bg-danger-soft p-3">
        <label className="grid gap-1 text-xs text-ink2">
          Why is this bill being cancelled?
          <textarea
            aria-label="Why is this bill being cancelled?"
            value={editor.cancelReason}
            onChange={(event) => editor.setCancelReason(event.target.value)}
            rows={3}
            maxLength={500}
            className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={editor.cancelBusy}
            onClick={editor.closeCancel}
            className="h-11 flex-1 rounded-lg border border-line bg-white text-sm text-ink2"
          >
            Keep
          </button>
          <button
            type="button"
            disabled={editor.cancelBusy || editor.cancelReason.trim().length === 0}
            onClick={editor.confirmCancel}
            className="h-11 flex-1 rounded-lg bg-danger text-sm font-medium text-white disabled:opacity-60"
          >
            Cancel bill
          </button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={editor.cancelBusy || editor.saving}
      onClick={editor.askCancel}
      className="mt-auto h-11 rounded-lg bg-danger text-sm font-medium text-white disabled:opacity-60"
    >
      Cancel bill
    </button>
  );
}
