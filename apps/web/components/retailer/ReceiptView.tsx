'use client';

import type { PosReceipt } from '@optiworld/shared';
import Link from 'next/link';

import { WhatsAppMark } from '@/components/WhatsAppMark';
import { BillSettlement } from './BillSettlement';
import { formatRupee, formatShortDate } from './dashboard-format';
import { resolveBillLogoUrl, ShopMark } from './ShopMark';

export function ReceiptView({
  receipt,
  pending,
  notice,
  sending,
  onWhatsApp,
  onPrint,
}: {
  receipt: PosReceipt;
  pending: boolean;
  notice: string | null;
  sending: boolean;
  onWhatsApp: () => void;
  onPrint: () => void;
}): React.ReactElement {
  const paid = receipt.status === 'PAID';
  const heading = receipt.billHeading.trim() || receipt.businessName;
  const contact = [receipt.businessPhone, receipt.businessAddress].filter(
    (part) => part && part.length > 0,
  );
  return (
    <article className="mx-auto grid max-w-xl gap-4 rounded-xl border border-line bg-white p-4 print:max-w-none print:border-0">
      <header className="flex items-start justify-between gap-3 border-b border-line pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <ShopMark name={heading} logoUrl={resolveBillLogoUrl(receipt.billLogoUrl)} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-ink">{heading}</p>
            {receipt.billTagline.trim() ? (
              <p className="truncate text-sm italic text-ink2">{receipt.billTagline}</p>
            ) : null}
            {contact.length > 0 ? (
              <p className="truncate text-xs text-ink3">{contact.join(' · ')}</p>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold text-ink">
            {receipt.invoiceNumber > 0 ? `Invoice #${receipt.invoiceNumber}` : 'Invoice'}
          </p>
          <p className="text-sm text-ink2">{formatShortDate(receipt.issuedAt)}</p>
        </div>
      </header>
      <div className="grid gap-1 border-b border-line pb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink3">Name</p>
        <p className="text-sm text-ink">{receipt.customerName}</p>
        <p className="text-xs font-medium uppercase tracking-wide text-ink3">Contact</p>
        <p className="text-sm text-ink2">{receipt.customerPhone ?? '—'}</p>
        <span
          className={`mt-1 w-fit rounded-full px-2 py-0.5 text-xs font-medium ${
            paid ? 'bg-teal-soft text-teal' : 'bg-amber-soft text-amber'
          }`}
        >
          {paid ? 'PAID' : 'ON CREDIT'}
        </span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line text-left">
            {['Item', 'Qty', 'Price', 'Total'].map((heading) => (
              <th
                key={heading}
                className="py-2 text-xs font-medium uppercase tracking-wide text-ink3"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {receipt.items.map((item) => (
            <tr key={item.id} className="border-b border-line">
              <td className="py-2 text-sm text-ink">
                {item.productName}
                <span className="block text-xs text-action">{item.priceCode}</span>
                {item.prescriptionSummary ? (
                  <span className="block text-xs text-ink3">{item.prescriptionSummary}</span>
                ) : null}
              </td>
              <td className="py-2 text-sm text-ink2">{item.quantity}</td>
              <td className="py-2 text-sm text-ink2">{formatRupee(item.unitPrice)}</td>
              <td className="py-2 text-sm text-ink">{formatRupee(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="grid gap-1 text-sm">
        <div className="flex justify-between text-ink2">
          <dt>Subtotal</dt>
          <dd>{formatRupee(receipt.subtotal)}</dd>
        </div>
        <div className="flex justify-between text-ink2">
          <dt>Discount</dt>
          <dd>{formatRupee(receipt.discount)}</dd>
        </div>
        {receipt.deliveryAddress ? (
          <div className="flex justify-between text-ink2">
            <dt>Delivery</dt>
            <dd>{formatRupee(receipt.deliveryCharge)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between font-semibold text-ink">
          <dt>Total</dt>
          <dd>{formatRupee(receipt.total)}</dd>
        </div>
        <BillSettlement
          paymentType={receipt.paymentType}
          amountPaid={receipt.amountPaid}
          outstanding={receipt.outstanding}
          payments={receipt.payments}
        />
      </dl>
      {receipt.deliveryAddress ? (
        <p className="text-sm text-ink2">Deliver to {receipt.deliveryAddress}</p>
      ) : null}
      {receipt.labReference ? (
        <p className="text-sm text-ink2">Lab reference {receipt.labReference}</p>
      ) : null}
      <section className="border-t border-line pt-3">
        <h2 className="text-sm italic text-ink">Terms & Conditions</h2>
        <p className="mt-1 whitespace-pre-wrap text-xs text-ink2">
          {receipt.billTerms.trim() || 'No terms have been set for this shop.'}
        </p>
      </section>
      <p className="text-right text-sm text-ink2">Signature</p>
      {pending ? (
        <p className="rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber" role="status">
          Receipt will sync and WhatsApp when back online
        </p>
      ) : null}
      {notice ? (
        <p className="text-sm text-ink2" role="status">
          {notice}
        </p>
      ) : null}
      <div className="grid gap-2 print:hidden sm:grid-cols-3">
        <button
          type="button"
          onClick={onWhatsApp}
          disabled={pending || sending}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#128C7E] text-sm font-medium text-white disabled:opacity-50"
        >
          <WhatsAppMark size={16} />
          {sending ? 'Sending…' : 'Send via WhatsApp'}
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="min-h-[44px] rounded-lg border border-line text-sm text-ink2"
        >
          Print
        </button>
        <Link
          href="/retailer/billing/new"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-action text-sm font-medium text-white"
        >
          New Invoice
        </Link>
      </div>
    </article>
  );
}
