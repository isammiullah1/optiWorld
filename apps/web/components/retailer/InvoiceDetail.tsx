'use client';

import type { PosReceipt } from '@optiworld/shared';
import { Mars, UserRound, Venus } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { Fragment, useEffect, useState } from 'react';

import { isShopOwnerRole } from '@/lib/shop-scope';
import { WhatsAppLabel } from '@/components/WhatsAppMark';
import { RecordTrail } from '@/components/RecordTrail';

import { BillSettlement } from './BillSettlement';
import { CostingSummary } from './CostingSummary';
import { formatRupee, formatShortDate } from './dashboard-format';
import { PrescriptionBillPanel } from './PrescriptionBillPanel';
import { loadPosReceipt } from './pos-api';
import { clearInvoiceCredit } from './reports-api';
import {
  SaleBillLines,
  SaleEdit,
  SaleEditColumn,
  SaleEditDock,
  SaleEditFrame,
  SaleEditPanel,
  SaleEditSummary,
  SaleEditWhenClosed,
} from './SaleEdit';
import { resolveBillLogoUrl, ShopMark } from './ShopMark';

export function InvoiceDetail({
  invoiceId,
  editCredit,
  editItems = false,
  editLab = false,
}: {
  invoiceId: string;
  editCredit: boolean;
  editItems?: boolean;
  editLab?: boolean;
}): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const canClear = isShopOwnerRole(session?.user.role);
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    void loadPosReceipt(token, invoiceId)
      .then((next) => {
        if (!active) {
          return;
        }
        setReceipt(next);
        setAmount('');
        setError(null);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Invoice was not found');
        }
      });
    return () => {
      active = false;
    };
  }, [invoiceId, token]);

  async function clearCredit(): Promise<void> {
    if (!token || !receipt) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await clearInvoiceCredit(token, receipt.id, amount);
      const next = await loadPosReceipt(token, receipt.id);
      setReceipt(next);
      setAmount('');
      setNotice('Amount received was saved.');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'The credit could not be cleared');
    } finally {
      setBusy(false);
    }
  }

  if (error && !receipt) {
    return (
      <section className="rounded-xl border border-line bg-white p-4" role="alert">
        <h2 className="text-md font-semibold text-ink">Invoice unavailable</h2>
        <p className="mt-1 text-sm text-ink2">{error}</p>
      </section>
    );
  }

  if (!receipt) {
    return (
      <div className="h-40 animate-pulse rounded-xl border border-line bg-white" aria-busy="true" />
    );
  }

  const heading = receipt.billHeading.trim() || receipt.businessName;
  const contact = [receipt.businessPhone, receipt.businessAddress].filter(
    (part) => part && part.length > 0,
  );
  const owed = Number(receipt.outstanding) > 0;

  return (
    <div className="grid gap-3">
      <article className="w-full min-w-0 rounded-2xl border border-navy bg-action-soft p-2">
        <div className="min-w-0 overflow-hidden rounded-xl border border-action-soft bg-white">
          <header className="flex items-start justify-between gap-4 border-b border-action-soft bg-action-soft px-4 py-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <ShopMark
                name={heading}
                logoUrl={resolveBillLogoUrl(receipt.billLogoUrl)}
                size="lg"
              />
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-ink">{heading}</h2>
                <p className="truncate text-sm italic text-ink2">
                  {receipt.billTagline.trim() || 'Optical bill'}
                </p>
                {contact.length > 0 ? (
                  <p className="truncate text-xs text-ink3">{contact.join(' · ')}</p>
                ) : null}
              </div>
            </div>
            <p className="shrink-0 rounded-lg border border-action-soft bg-white px-3 py-2 text-right text-sm text-ink">
              <span className="block text-xs font-medium uppercase tracking-wide text-ink3">
                Invoice #{receipt.invoiceNumber}
              </span>
              {formatShortDate(receipt.issuedAt)}
            </p>
          </header>
          <div className="grid min-w-0 gap-4 p-4 lg:p-5">
            <SaleEdit
              enabled={Boolean(token) && canClear}
              receipt={receipt}
              token={token ?? ''}
              startOpen={editItems}
              onChanged={async () => {
                if (!token) {
                  return;
                }
                const next = await loadPosReceipt(token, receipt.id);
                setReceipt(next);
              }}
              onNotice={setNotice}
              onError={(message) => setError(message || null)}
            >
              <SaleEditFrame>
                <div className="grid min-w-0 gap-4">
                  <div className="grid gap-3 rounded-lg border border-line bg-canvas p-3 sm:grid-cols-2">
                    <Detail label="Name" value={receipt.customerName} />
                    <Detail
                      label="WhatsApp"
                      value={
                        receipt.customerWhatsapp ? (
                          <WhatsAppLabel>{receipt.customerWhatsapp}</WhatsAppLabel>
                        ) : (
                          '—'
                        )
                      }
                    />
                    <Detail label="Contact" value={receipt.customerPhone ?? '—'} />
                    <Detail label="Gender" value={<GenderText gender={receipt.customerGender} />} />
                    <Detail
                      label="Date of birth"
                      value={
                        receipt.customerDateOfBirth
                          ? formatShortDate(receipt.customerDateOfBirth)
                          : '—'
                      }
                    />
                  </div>
                  <div className="min-w-0 overflow-x-auto rounded-lg border border-action-soft">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-action-soft bg-action-soft text-left">
                          {['No.', 'Item', 'Qty', 'Rate', 'Amount'].map((cell) => (
                            <th
                              key={cell}
                              className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
                            >
                              {cell}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <SaleBillLines
                          fallback={receipt.items.map((item, index) => (
                            <Fragment key={item.id}>
                              <tr className="border-b border-action-soft align-top">
                                <td className="px-3 py-2 text-sm text-ink2">{index + 1}</td>
                                <td className="px-3 py-2">
                                  <p className="text-sm text-ink">
                                    {item.productName} {item.priceCode}
                                  </p>
                                </td>
                                <td className="px-3 py-2 text-sm text-ink">{item.quantity}</td>
                                <td className="px-3 py-2 text-sm text-ink">
                                  {formatRupee(item.unitPrice)}
                                </td>
                                <td className="px-3 py-2 text-sm text-ink">
                                  {formatRupee(item.lineTotal)}
                                </td>
                              </tr>
                              {item.prescriptionSummary ? (
                                <tr className="border-b border-action-soft">
                                  <td colSpan={5} className="px-3 pb-3 text-xs text-ink3">
                                    {item.prescriptionSummary}
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          ))}
                        />
                      </tbody>
                    </table>
                  </div>
                </div>
                <SaleEditColumn>
                  <SaleEditSummary receipt={receipt} />
                  <RecordTrail activity={receipt.activity} />
                  {receipt.costing ? <CostingSummary costing={receipt.costing} /> : null}
                  <SaleEditPanel />
                  <SaleEditWhenClosed>
                    <BillSettlement
                      paymentType={receipt.paymentType}
                      amountPaid={receipt.amountPaid}
                      outstanding={receipt.outstanding}
                      payments={receipt.payments}
                    />
                  </SaleEditWhenClosed>
                  {receipt.labReference ? (
                    <p className="text-xs text-ink3">Lab {receipt.labReference}</p>
                  ) : null}
                  {editCredit && owed && canClear && !receipt.cancelledAt ? (
                    <SaleEditWhenClosed>
                      <label className="grid gap-1 text-xs text-ink2">
                        Amount received
                        <span className="font-normal text-ink3">
                          Record a payment up to the balance. It stays in the history below.
                        </span>
                        <input
                          aria-label="Amount received"
                          inputMode="decimal"
                          value={amount}
                          onChange={(event) => setAmount(event.target.value)}
                          className="h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-action"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void clearCredit();
                          }}
                          className="mt-1 h-11 rounded-lg bg-amber text-sm font-medium text-white disabled:opacity-60"
                        >
                          {busy ? 'Saving…' : 'Record payment'}
                        </button>
                      </label>
                    </SaleEditWhenClosed>
                  ) : null}
                  {editCredit && !owed && !receipt.cancelledAt ? (
                    <p className="text-xs text-teal">This bill has no pending balance.</p>
                  ) : null}
                  <section className="rounded-lg border border-action-soft bg-white px-3 py-3">
                    <h3 className="text-sm italic text-ink">Terms & Conditions</h3>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-ink2">
                      {receipt.billTerms.trim() || 'No terms have been set for this shop.'}
                    </p>
                  </section>
                  <SaleEditDock />
                </SaleEditColumn>
              </SaleEditFrame>
            </SaleEdit>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="text-sm text-teal">
                {notice}
              </p>
            ) : null}
            {token && (editLab || receipt.items.some((item) => item.prescription)) ? (
              <PrescriptionBillPanel
                receipt={receipt}
                token={token}
                canEdit={canClear}
                editLab={editLab}
                onChanged={async () => {
                  const next = await loadPosReceipt(token, receipt.id);
                  setReceipt(next);
                }}
                onNotice={setNotice}
                onError={(message) => setError(message || null)}
              />
            ) : null}
          </div>
        </div>
      </article>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink3">{label}</p>
      <div className="text-sm text-ink">{value}</div>
    </div>
  );
}

function GenderText({ gender }: { gender: PosReceipt['customerGender'] }): React.ReactElement {
  if (gender === 'MALE') {
    return (
      <span className="inline-flex items-center gap-1">
        <Mars size={14} className="text-action" aria-hidden="true" /> Male
      </span>
    );
  }
  if (gender === 'FEMALE') {
    return (
      <span className="inline-flex items-center gap-1">
        <Venus size={14} className="text-danger" aria-hidden="true" /> Female
      </span>
    );
  }
  if (gender === 'OTHER') {
    return (
      <span className="inline-flex items-center gap-1">
        <UserRound size={14} className="text-teal" aria-hidden="true" /> Other
      </span>
    );
  }
  return <span>—</span>;
}
