'use client';

import type { ConnectedLab, LinePrescriptionInput } from '@optiworld/shared';
import { useEffect, useState } from 'react';

import { formatRupee } from './dashboard-format';
import { prescriptionLabel } from './item-prescription';

const MAX_LINE_QUANTITY = 10_000;

export type CartLine = {
  inventoryBatchId: string;
  priceCode: string;
  productName: string;
  category: string;
  prescriptionRequired: boolean | null;
  unitPrice: string;
  quantity: number;
  prescription: LinePrescriptionInput | null;
};

export function SaleCart({
  customerName,
  creditLimit,
  outstanding,
  lines,
  discountMode,
  discountInput,
  subtotal,
  discount,
  total,
  paymentType,
  labReference,
  labs,
  billLabId,
  busy,
  onOpenCustomer,
  onQuantity,
  onPrice,
  onRemove,
  onLinePrescription,
  onDiscountMode,
  onDiscountInput,
  onPayment,
  onPrescription,
  onBillLab,
  onComplete,
}: {
  customerName: string | null;
  creditLimit: string | null;
  outstanding: string | null;
  lines: readonly CartLine[];
  discountMode: 'AMOUNT' | 'PERCENT';
  discountInput: string;
  subtotal: string;
  discount: string;
  total: string;
  paymentType: 'CASH' | 'CREDIT';
  labReference: string | null;
  labs: readonly ConnectedLab[];
  billLabId: string;
  busy: boolean;
  onOpenCustomer: () => void;
  onQuantity: (id: string, quantity: number) => void;
  onPrice: (id: string, unitPrice: string) => void;
  onRemove: (id: string) => void;
  onLinePrescription: (id: string) => void;
  onDiscountMode: (mode: 'AMOUNT' | 'PERCENT') => void;
  onDiscountInput: (value: string) => void;
  onPayment: (paymentType: 'CASH' | 'CREDIT') => void;
  onPrescription: () => void;
  onBillLab: (labOrgId: string) => void;
  onComplete: () => void;
}): React.ReactElement {
  return (
    <section className="grid gap-3 rounded-xl border border-line bg-white p-4">
      <button
        type="button"
        onClick={onOpenCustomer}
        className="min-h-[44px] rounded-lg border border-line px-3 py-2 text-left"
      >
        <span className="block text-xs uppercase tracking-wide text-ink3">Customer</span>
        <span className="text-sm font-medium text-ink">{customerName ?? 'Select customer'}</span>
        {creditLimit && outstanding ? (
          <span className="block text-xs text-ink2">
            Limit {formatRupee(creditLimit)} · Outstanding {formatRupee(outstanding)}
          </span>
        ) : null}
      </button>
      <ul className="grid gap-3">
        {lines.map((line) => (
          <li key={line.inventoryBatchId} className="grid gap-2 border-b border-line pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm text-ink">{line.productName}</p>
                <p className="text-xs text-action">{line.priceCode}</p>
              </div>
              <button
                type="button"
                aria-label={`Remove ${line.productName}`}
                onClick={() => onRemove(line.inventoryBatchId)}
                className="min-h-[44px] min-w-[44px] text-ink3"
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => onQuantity(line.inventoryBatchId, line.quantity - 1)}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-line"
              >
                −
              </button>
              <QuantityField
                quantity={line.quantity}
                label={`Quantity for ${line.productName}`}
                onChange={(quantity) => onQuantity(line.inventoryBatchId, quantity)}
              />
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => onQuantity(line.inventoryBatchId, line.quantity + 1)}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-line"
              >
                +
              </button>
              <input
                aria-label="Unit price"
                value={line.unitPrice}
                onChange={(event) => onPrice(line.inventoryBatchId, event.target.value)}
                className="w-24 rounded-lg border border-line px-2 py-2 text-sm text-ink"
              />
              <span className="ml-auto text-sm text-ink">
                {formatRupee(lineTotal(line.unitPrice, line.quantity))}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onLinePrescription(line.inventoryBatchId)}
              className="min-h-[44px] rounded-lg border border-line px-3 text-left text-sm text-ink2"
            >
              {prescriptionLabel(line.prescription) ?? 'Add prescription'}
              {line.prescription?.labOrgId ? (
                <span className="mt-1 block text-xs text-ink">
                  Lab:{' '}
                  {labs.find((lab) => lab.id === line.prescription?.labOrgId)?.name ??
                    'Selected lab'}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      <dl className="grid gap-1 text-sm">
        <div className="flex justify-between text-ink2">
          <dt>Subtotal</dt>
          <dd>{formatRupee(subtotal)}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink2">Discount</dt>
          <dd className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDiscountMode(discountMode === 'AMOUNT' ? 'PERCENT' : 'AMOUNT')}
              className="rounded-full bg-action-soft px-2 py-1 text-xs text-action"
            >
              {discountMode === 'AMOUNT' ? 'Amount' : '%'}
            </button>
            <input
              aria-label="Discount"
              value={discountInput}
              onChange={(event) => onDiscountInput(event.target.value)}
              className="w-20 rounded-lg border border-line px-2 py-1 text-sm"
            />
            <span className="text-ink">{formatRupee(discount)}</span>
          </dd>
        </div>
        <div className="flex justify-between font-semibold text-ink">
          <dt>Total</dt>
          <dd>{formatRupee(total)}</dd>
        </div>
      </dl>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onPayment('CASH')}
          className={`min-h-[44px] rounded-lg border text-sm font-medium ${
            paymentType === 'CASH' ? 'border-action bg-action text-white' : 'border-line text-ink2'
          }`}
        >
          Cash
        </button>
        <button
          type="button"
          onClick={() => onPayment('CREDIT')}
          className={`min-h-[44px] rounded-lg border text-sm font-medium ${
            paymentType === 'CREDIT' ? 'border-amber bg-amber text-white' : 'border-line text-ink2'
          }`}
        >
          On Credit
        </button>
      </div>
      <label className="grid gap-1 text-xs text-ink3">
        Send all prescriptions to one lab
        <select
          aria-label="Send all prescriptions to one lab"
          value={billLabId}
          onChange={(event) => onBillLab(event.target.value)}
          className="rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-action"
        >
          <option value="">Do not send</option>
          {labs.map((lab) => (
            <option key={lab.id} value={lab.id}>
              {lab.name}
            </option>
          ))}
        </select>
        <span>Optional. A lab chosen on a prescription is used for that item.</span>
      </label>
      <button
        type="button"
        onClick={onPrescription}
        className="min-h-[44px] rounded-lg border border-line text-sm text-ink2"
      >
        {labReference ? `Prescription ${labReference}` : 'Add Lab Prescription'}
      </button>
      <button
        type="button"
        onClick={onComplete}
        disabled={busy || lines.length === 0 || !customerName}
        className="min-h-[44px] w-full rounded-lg bg-action text-md font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : `Complete Sale · ${formatRupee(total)}`}
      </button>
    </section>
  );
}

function QuantityField({
  quantity,
  label,
  onChange,
}: {
  quantity: number;
  label: string;
  onChange: (quantity: number) => void;
}): React.ReactElement {
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [quantity]);

  return (
    <input
      aria-label={label}
      inputMode="numeric"
      value={draft ?? String(quantity)}
      onFocus={(event) => {
        const input = event.currentTarget;
        requestAnimationFrame(() => input.select());
      }}
      onClick={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '');
        if (digits === '') {
          setDraft('');
          return;
        }
        const parsed = Number(digits);
        if (!Number.isInteger(parsed)) {
          return;
        }
        setDraft(null);
        onChange(Math.min(parsed, MAX_LINE_QUANTITY));
      }}
      onBlur={() => {
        if (draft !== null) {
          const parsed = Number(draft);
          onChange(
            Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_LINE_QUANTITY) : quantity,
          );
        }
        setDraft(null);
      }}
      className="w-16 min-h-[44px] rounded-lg border border-line px-1 text-center text-sm text-ink outline-none focus:border-action"
    />
  );
}

function lineTotal(unitPrice: string, quantity: number): string {
  const amount = Number(unitPrice);
  if (!Number.isFinite(amount)) {
    return '0.00';
  }
  return (amount * quantity).toFixed(2);
}
