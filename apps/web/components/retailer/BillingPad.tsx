'use client';

import {
  centsToMoney,
  moneyToCents,
  type ConnectedLab,
  type InventorySearchHit,
} from '@optiworld/shared';
import { Fragment } from 'react';
import { Eye, EyeOff, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';

import { formatRupee, formatShortDate } from './dashboard-format';
import { needsPrescription, prescriptionLabel } from './item-prescription';
import { BillSettlement } from './BillSettlement';
import { ShopMark } from './ShopMark';
import type { CartLine } from './SaleCart';

export function BillingPad({
  shopName,
  billHeading,
  billTagline,
  billTerms,
  billLogoUrl,
  headerContact,
  customer,
  lines,
  labs,
  query,
  products,
  discountMode,
  discountInput,
  subtotal,
  discount,
  total,
  paymentType,
  amountReceived,
  makeDelivery,
  deliveryAddress,
  deliveryCharge,
  assignAllToLab,
  billLabId,
  busy,
  canComplete,
  prescriptionLineId,
  prescriptionPanel,
  onQuery,
  onAdd,
  onQuantity,
  onPrice,
  onRemove,
  onLinePrescription,
  onDiscountMode,
  onDiscountInput,
  onPayment,
  onAmountReceived,
  onMakeDelivery,
  onDeliveryAddress,
  onDeliveryCharge,
  onAssignAll,
  onBillLab,
  onComplete,
}: {
  shopName: string;
  billHeading: string;
  billTagline: string;
  billTerms: string;
  billLogoUrl: string | null;
  headerContact: string | null;
  customer: React.ReactNode;
  lines: readonly CartLine[];
  labs: readonly ConnectedLab[];
  query: string;
  products: readonly InventorySearchHit[];
  discountMode: 'AMOUNT' | 'PERCENT';
  discountInput: string;
  subtotal: string;
  discount: string;
  total: string;
  paymentType: 'CASH' | 'CREDIT';
  amountReceived: string;
  makeDelivery: boolean;
  deliveryAddress: string;
  deliveryCharge: string;
  assignAllToLab: boolean;
  billLabId: string;
  busy: boolean;
  canComplete: boolean;
  prescriptionLineId: string | null;
  prescriptionPanel: React.ReactNode;
  onQuery: (value: string) => void;
  onAdd: (product: InventorySearchHit) => void;
  onQuantity: (id: string, quantity: number) => void;
  onPrice: (id: string, unitPrice: string) => void;
  onRemove: (id: string) => void;
  onLinePrescription: (id: string | null) => void;
  onDiscountMode: (mode: 'AMOUNT' | 'PERCENT') => void;
  onDiscountInput: (value: string) => void;
  onPayment: (paymentType: 'CASH' | 'CREDIT') => void;
  onAmountReceived: (value: string) => void;
  onMakeDelivery: (value: boolean) => void;
  onDeliveryAddress: (value: string) => void;
  onDeliveryCharge: (value: string) => void;
  onAssignAll: (value: boolean) => void;
  onBillLab: (labOrgId: string) => void;
  onComplete: () => void;
}): React.ReactElement {
  const heading = billHeading.trim() || shopName || 'Shop';
  const needle = query.trim().toLowerCase();
  const matches = needle
    ? products.filter(
        (product) =>
          product.productName.toLowerCase().includes(needle) ||
          product.priceCode.toLowerCase().includes(needle),
      )
    : [];
  const showResults = needle.length > 0;
  const labLines = lines.filter((line) =>
    needsPrescription(line.category, line.productName, line.prescriptionRequired),
  );
  const receivedText = amountReceived.trim();
  const receivedCents = /^\d{1,10}(\.\d{1,2})?$/.test(receivedText)
    ? moneyToCents(receivedText)
    : null;
  const totalCents = /^\d{1,10}(\.\d{1,2})?$/.test(total) ? moneyToCents(total) : 0;
  const receivedOk = receivedCents !== null && receivedCents <= totalCents;
  const previewPaid =
    paymentType === 'CREDIT' && receivedOk && receivedCents !== null ? receivedCents : 0;
  const previewBalance = Math.max(0, totalCents - previewPaid);
  return (
    <article className="w-full min-w-0 max-w-full rounded-2xl border border-navy bg-action-soft p-2">
      <div className="min-w-0 overflow-hidden rounded-xl border border-action-soft bg-white">
        <header className="flex items-start justify-between gap-4 border-b border-action-soft bg-action-soft px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <ShopMark name={heading} logoUrl={billLogoUrl} size="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold text-ink">{heading}</h2>
              <p className="truncate text-sm italic text-ink2">
                {billTagline.trim() || 'Optical bill'}
              </p>
              {headerContact ? <p className="truncate text-xs text-ink3">{headerContact}</p> : null}
            </div>
          </div>
          <p className="shrink-0 rounded-lg border border-action-soft bg-white px-3 py-2 text-right text-sm text-ink">
            <span className="block text-xs font-medium uppercase tracking-wide text-ink3">
              Date
            </span>
            {formatShortDate(new Date().toISOString())}
          </p>
        </header>

        <div className="grid min-w-0 items-start gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:p-5">
          <div className="grid min-w-0 gap-4">
            {customer}

            <div className="min-w-0 overflow-x-auto rounded-lg border border-action-soft">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-action-soft bg-action-soft text-left">
                    {['No.', 'Item', 'Qty', 'Rate', 'Amount'].map((headingCell) => (
                      <th
                        key={headingCell}
                        className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                      >
                        {headingCell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <Fragment key={line.inventoryBatchId}>
                      <tr className="border-b border-action-soft align-top">
                        <td className="px-3 py-2 text-sm text-ink2">{index + 1}</td>
                        <td className="px-3 py-2">
                          <p className="text-sm text-ink">
                            {line.productName} {line.priceCode}
                          </p>
                          {line.prescription ? (
                            <p className="mt-1 text-xs text-ink2">
                              {prescriptionLabel(line.prescription)}
                            </p>
                          ) : null}
                          {line.prescription?.labOrgId ? (
                            <span className="block text-xs text-ink3">
                              Lab:{' '}
                              {labs.find((lab) => lab.id === line.prescription?.labOrgId)?.name ??
                                'Selected lab'}
                            </span>
                          ) : null}
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {needsPrescription(
                              line.category,
                              line.productName,
                              line.prescriptionRequired,
                            ) ? (
                              <>
                                <button
                                  type="button"
                                  title={
                                    prescriptionLineId === line.inventoryBatchId ? 'Hide' : 'View'
                                  }
                                  aria-expanded={prescriptionLineId === line.inventoryBatchId}
                                  onClick={() =>
                                    onLinePrescription(
                                      prescriptionLineId === line.inventoryBatchId
                                        ? null
                                        : line.inventoryBatchId,
                                    )
                                  }
                                  className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-medium text-action"
                                >
                                  {prescriptionLineId === line.inventoryBatchId ? (
                                    <EyeOff size={14} aria-hidden="true" />
                                  ) : (
                                    <Eye size={14} aria-hidden="true" />
                                  )}
                                  {prescriptionLineId === line.inventoryBatchId ? 'Hide' : 'View'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onLinePrescription(line.inventoryBatchId)}
                                  className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-medium text-action"
                                >
                                  {line.prescription ? (
                                    <Pencil size={14} aria-hidden="true" />
                                  ) : (
                                    <Plus size={14} aria-hidden="true" />
                                  )}
                                  {line.prescription ? 'Edit' : 'Add prescription'}
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              aria-label={`Remove ${line.productName}`}
                              onClick={() => onRemove(line.inventoryBatchId)}
                              className="inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-xs font-medium text-danger"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              Remove
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            aria-label={`Quantity for ${line.productName}`}
                            inputMode="numeric"
                            value={String(line.quantity)}
                            onChange={(event) => {
                              const parsed = Number(event.target.value.replace(/\D/g, ''));
                              onQuantity(
                                line.inventoryBatchId,
                                Number.isInteger(parsed) && parsed > 0 ? parsed : 1,
                              );
                            }}
                            className="w-16 min-h-[44px] rounded-lg border border-line px-2 text-center text-sm text-ink outline-none focus:border-action"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            aria-label={`Rate for ${line.productName}`}
                            value={line.unitPrice}
                            onChange={(event) => onPrice(line.inventoryBatchId, event.target.value)}
                            className="w-24 min-h-[44px] rounded-lg border border-line px-2 text-sm text-ink outline-none focus:border-action"
                          />
                        </td>
                        <td className="px-3 py-2 text-sm text-ink">
                          {formatRupee(lineTotal(line.unitPrice, line.quantity))}
                        </td>
                      </tr>
                      {prescriptionLineId === line.inventoryBatchId ? (
                        <tr className="border-b border-action-soft">
                          <td colSpan={5} className="px-3 pb-3">
                            {prescriptionPanel}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
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
                          value={query}
                          placeholder="Search by name or code, then choose it"
                          onChange={(event) => onQuery(event.target.value)}
                          className="w-full min-h-[44px] rounded-lg border border-action bg-white px-3 text-sm text-ink outline-none focus:border-action"
                        />
                      </label>
                      {showResults ? (
                        <ul className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line bg-white">
                          {matches.length === 0 ? (
                            <li className="px-3 py-2 text-sm text-ink3">
                              No item matches that name or code.
                            </li>
                          ) : (
                            matches.map((product) => (
                              <li key={product.id}>
                                <button
                                  type="button"
                                  onClick={() => onAdd(product)}
                                  className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 text-left text-sm hover:bg-action-soft"
                                >
                                  <span className="inline-flex min-w-0 items-center gap-2 text-ink">
                                    <Plus
                                      size={16}
                                      className="shrink-0 text-action"
                                      aria-hidden="true"
                                    />
                                    {product.productName} {product.priceCode}
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
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid min-w-0 content-start gap-3 rounded-lg border border-action-soft bg-[linear-gradient(165deg,color-mix(in_srgb,var(--ow-blue)_28%,white)_0%,white_42%,var(--ow-blue-soft)_100%)] p-4">
            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-ink2">Subtotal</span>
                <span className="text-ink">{formatRupee(subtotal)}</span>
              </div>
              <div className="grid gap-2 text-ink2">
                <span>Discount</span>
                <div className="flex flex-wrap items-center gap-2">
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
                    className="min-w-0 w-20 flex-1 rounded-lg border border-line bg-white px-2 py-1 text-sm text-ink"
                  />
                  <span className="text-ink">{formatRupee(discount)}</span>
                </div>
              </div>
              {makeDelivery ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-ink2">Delivery</span>
                  <span className="text-ink">
                    {formatRupee(
                      /^\d{1,10}(\.\d{1,2})?$/.test(deliveryCharge.trim())
                        ? deliveryCharge.trim()
                        : '0.00',
                    )}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-action-soft pt-3">
                <span className="font-semibold text-ink">Total</span>
                <span className="font-semibold text-ink">{formatRupee(total)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onPayment('CASH')}
                className={`min-h-[44px] rounded-lg border text-sm font-medium ${
                  paymentType === 'CASH'
                    ? 'border-action bg-action text-white'
                    : 'border-line text-ink2'
                }`}
              >
                Cash
              </button>
              <button
                type="button"
                onClick={() => onPayment('CREDIT')}
                className={`min-h-[44px] rounded-lg border text-sm font-medium ${
                  paymentType === 'CREDIT'
                    ? 'border-amber bg-amber text-white'
                    : 'border-line text-ink2'
                }`}
              >
                On Credit
              </button>
            </div>
            {paymentType === 'CREDIT' ? (
              <div className="grid gap-2">
                <label className="grid gap-1 text-xs text-ink2">
                  Amount received
                  <input
                    aria-label="Amount received"
                    inputMode="decimal"
                    value={amountReceived}
                    onChange={(event) => onAmountReceived(event.target.value)}
                    className="h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
                  />
                </label>
                {receivedOk ? (
                  <BillSettlement
                    paymentType="CREDIT"
                    amountPaid={centsToMoney(previewPaid)}
                    outstanding={centsToMoney(previewBalance)}
                  />
                ) : (
                  <p className="text-xs text-danger">
                    Enter an amount from zero up to the bill total.
                  </p>
                )}
              </div>
            ) : null}
            <label
              className={`flex min-h-[44px] items-center gap-2 text-sm ${labLines.length > 0 ? 'text-ink' : 'text-ink3'}`}
            >
              <input
                type="checkbox"
                checked={labLines.length > 0 && assignAllToLab}
                disabled={labLines.length === 0}
                onChange={(event) => onAssignAll(event.target.checked)}
                className="h-4 w-4 accent-action disabled:accent-ink3"
              />
              Send every prescription on this bill to one lab
            </label>
            {labLines.length > 0 && assignAllToLab ? (
              <label className="grid gap-1 text-xs text-ink3">
                Laboratory
                <select
                  aria-label="Laboratory for this bill"
                  value={billLabId}
                  onChange={(event) => onBillLab(event.target.value)}
                  className="min-h-[44px] rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
                >
                  <option value="">Choose a laboratory</option>
                  {labs.map((lab) => (
                    <option key={lab.id} value={lab.id}>
                      {lab.name}
                    </option>
                  ))}
                </select>
                <span>This laboratory receives every prescription on the bill.</span>
              </label>
            ) : (
              <p className="text-xs text-ink3">
                Each prescription keeps the laboratory chosen on that line.
              </p>
            )}
            <div className="grid gap-2">
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={makeDelivery}
                  onChange={(event) => onMakeDelivery(event.target.checked)}
                  className="h-4 w-4 accent-action"
                />
                Make Delivery
              </label>
              {makeDelivery ? (
                <div className="grid gap-2">
                  <label className="grid gap-1 text-xs text-ink2">
                    Address
                    <input
                      aria-label="Delivery address"
                      value={deliveryAddress}
                      maxLength={300}
                      onChange={(event) => onDeliveryAddress(event.target.value)}
                      className="h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-ink2">
                    Delivery charges
                    <input
                      aria-label="Delivery charges"
                      aria-required="true"
                      required
                      inputMode="decimal"
                      value={deliveryCharge}
                      onChange={(event) => onDeliveryCharge(event.target.value)}
                      className="h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
                    />
                    {/^\d{1,10}(\.\d{1,2})?$/.test(deliveryCharge.trim()) ? null : (
                      <span className="text-danger">Enter the delivery charges.</span>
                    )}
                  </label>
                </div>
              ) : null}
            </div>
            <section className="rounded-lg border border-action-soft bg-white px-3 py-3">
              <h3 className="text-sm italic text-ink">Terms & Conditions</h3>
              {billTerms.trim() ? (
                <p className="mt-1 whitespace-pre-wrap text-xs text-ink2">{billTerms}</p>
              ) : (
                <p className="mt-1 text-xs text-ink3">
                  No terms yet.{' '}
                  <Link href="/retailer/bill-pad" className="text-action">
                    Set them on the bill pad
                  </Link>
                  . They are added to every printed bill and WhatsApp receipt.
                </p>
              )}
            </section>
            <button
              type="button"
              onClick={onComplete}
              disabled={busy || lines.length === 0 || !canComplete}
              className="flex min-h-11 w-full flex-col items-center justify-center rounded-lg bg-action px-3 py-2 text-sm font-medium leading-tight text-white disabled:opacity-50"
            >
              <span>{busy ? 'Saving…' : 'Complete sale'}</span>
              {busy ? null : <span>{formatRupee(total)}</span>}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function lineTotal(unitPrice: string, quantity: number): string {
  const amount = Number(unitPrice);
  if (!Number.isFinite(amount)) {
    return '0.00';
  }
  return (amount * quantity).toFixed(2);
}
