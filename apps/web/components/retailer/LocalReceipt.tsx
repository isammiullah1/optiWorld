'use client';

import { centsToMoney, moneyToCents, type PosReceipt } from '@optiworld/shared';
import { useEffect, useState } from 'react';

import { readPosMeta, readPosSnapshot } from '@/lib/offline/pos-db';

import { prescriptionLabel } from './item-prescription';
import { ReceiptView } from './ReceiptView';

export function LocalReceipt({ localId }: { localId: string }): React.ReactElement {
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void Promise.all([readPosSnapshot(), readPosMeta('orgName'), readPosMeta('billPad')]).then(
      ([snapshot, orgName, billPad]) => {
        const invoice = snapshot.invoices.find((entry) => entry.localId === localId);
        const customer = snapshot.customers.find((entry) => entry.id === invoice?.customerId);
        if (!invoice) {
          setMissing(true);
          return;
        }
        const subtotalCents = invoice.items.reduce(
          (sum, item) => sum + Number(item.unitPrice) * item.quantity,
          0,
        );
        const pad = readBillPad(billPad);
        const totalCents = moneyToCents(invoice.total);
        const receivedCents =
          invoice.amountReceived !== undefined
            ? moneyToCents(invoice.amountReceived)
            : invoice.status === 'CREDIT'
              ? 0
              : totalCents;
        const outstandingCents =
          invoice.status === 'CREDIT' ? Math.max(0, totalCents - receivedCents) : 0;
        setReceipt({
          id: invoice.localId,
          invoiceNumber: invoice.invoiceNumber ?? 0,
          issuedAt: invoice.issuedAt,
          businessName: orgName ?? (pad.shopName || 'Shop'),
          billHeading: pad.heading,
          billTagline: pad.tagline,
          billTerms: pad.terms,
          billLogoUrl: pad.logoUrl,
          businessPhone: pad.phone,
          businessAddress: pad.address,
          customerName: customer?.name ?? 'Customer',
          customerPhone: customer?.phone ?? null,
          customerWhatsapp: null,
          customerGender: null,
          customerDateOfBirth: null,
          paymentType: invoice.paymentType,
          outstanding: centsToMoney(outstandingCents),
          amountPaid: centsToMoney(receivedCents),
          payments:
            receivedCents > 0
              ? [
                  {
                    amount: centsToMoney(receivedCents),
                    recordedAt: invoice.issuedAt,
                    notes: invoice.paymentType === 'CREDIT' ? 'Amount received' : null,
                  },
                ]
              : [],
          status: invoice.status,
          subtotal: subtotalCents.toFixed(2),
          discount: invoice.discount,
          deliveryCharge: invoice.deliveryCharge ?? '0.00',
          deliveryAddress: invoice.deliveryAddress ?? null,
          total: invoice.total,
          labReference: invoice.labJob?.referenceNumber ?? null,
          cancelledAt: null,
          labJobs: [],
          items: invoice.items.map((item) => ({
            id: item.localItemId,
            productName: item.productName,
            priceCode: item.priceCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: (Number(item.unitPrice) * item.quantity).toFixed(2),
            prescriptionSummary: prescriptionLabel(item.prescription ?? null),
            prescription: item.prescription
              ? {
                  right: item.prescription.right,
                  left: item.prescription.left,
                  add: item.prescription.add,
                  pd: item.prescription.pd,
                  notes: item.prescription.notes,
                }
              : null,
          })),
        });
      },
    );
  }, [localId]);

  if (missing) {
    return <p className="text-sm text-ink2">This receipt is not on this device.</p>;
  }
  if (!receipt) {
    return <div className="h-40 animate-pulse rounded-xl border border-line bg-white" />;
  }
  return (
    <ReceiptView
      receipt={{ ...receipt, invoiceNumber: receipt.invoiceNumber || 0 }}
      pending
      notice={null}
      sending={false}
      onWhatsApp={() => undefined}
      onPrint={() => window.print()}
    />
  );
}

function readBillPad(raw: string | null): {
  heading: string;
  tagline: string;
  terms: string;
  logoUrl: string | null;
  phone: string | null;
  address: string | null;
  shopName: string;
} {
  const empty = {
    heading: '',
    tagline: '',
    terms: '',
    logoUrl: null,
    phone: null,
    address: null,
    shopName: '',
  };
  if (!raw) {
    return empty;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return empty;
    }
    const record = parsed as Record<string, unknown>;
    return {
      heading: typeof record.heading === 'string' ? record.heading : '',
      tagline: typeof record.tagline === 'string' ? record.tagline : '',
      terms: typeof record.terms === 'string' ? record.terms : '',
      logoUrl: typeof record.logoUrl === 'string' ? record.logoUrl : null,
      phone: typeof record.phone === 'string' ? record.phone : null,
      address: typeof record.address === 'string' ? record.address : null,
      shopName: typeof record.shopName === 'string' ? record.shopName : '',
    };
  } catch {
    return empty;
  }
}
