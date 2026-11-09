import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyPull,
  applyPushResults,
  createLocalSale,
  invoicesToPush,
  restorePendingAfterFailure,
  type CustomerCache,
  type InventoryCache,
  type PosInvoice,
  type ServerInvoice,
} from '@optiworld/shared';

const customer: CustomerCache = {
  id: '30000000-0000-4000-8000-000000000002',
  name: 'Bilal Hussain',
  phone: null,
  email: null,
  creditLimit: '0.00',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const batch: InventoryCache = {
  id: '40000000-0000-4000-8000-000000000002',
  priceCode: '2201',
  prefix: 'SV',
  productName: 'Single Vision CR-39',
  category: 'Lenses',
  salePrice: '10.00',
  stockQty: 5,
  lowStockThreshold: 1,
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('offline sale merge', () => {
  it('keeps an oversold local invoice and reserves the stock that was available', () => {
    const created = createLocalSale({
      customerId: customer.id,
      inventoryBatchId: batch.id,
      quantity: 8,
      status: 'PAID',
      customers: [customer],
      batches: [batch],
      now: new Date('2026-09-29T12:00:00.000Z'),
      localId: '50000000-0000-4000-8000-000000000099',
      localItemId: '50000000-0000-4000-8000-000000000098',
    });
    assert.equal(created.ok, true);
    if (!created.ok) {
      return;
    }
    assert.equal(created.invoice.syncStatus, 'PENDING');
    assert.equal(created.invoice.needsReview, true);
    assert.equal(created.invoice.items[0]?.stockShortfall, 3);
    assert.equal(created.batches[0]?.stockQty, 0);
    assert.equal(invoicesToPush([created.invoice]).length, 1);
  });

  it('lets the server catalogue win and keeps a pending sale reserved', () => {
    const pending: PosInvoice = {
      localId: '50000000-0000-4000-8000-000000000099',
      serverId: null,
      invoiceNumber: null,
      customerId: customer.id,
      status: 'PAID',
      paymentType: 'CASH',
      total: '20.00',
      discount: '0.00',
      syncStatus: 'PENDING',
      needsReview: false,
      reviewReason: null,
      issuedAt: '2026-09-29T12:00:00.000Z',
      items: [
        {
          localItemId: '50000000-0000-4000-8000-000000000098',
          inventoryBatchId: batch.id,
          productName: batch.productName,
          priceCode: batch.priceCode,
          quantity: 2,
          unitPrice: '10.00',
          salePrice: '10.00',
          stockShortfall: 0,
        },
      ],
    };
    const remoteBatch: InventoryCache = { ...batch, stockQty: 9, productName: 'Server lens name' };
    const next = applyPull(
      { customers: [], batches: [{ ...batch, stockQty: 3 }], invoices: [pending] },
      {
        serverTime: '2026-09-29T13:00:00.000Z',
        customers: { upserted: [customer], deletedIds: [] },
        inventoryBatches: { upserted: [remoteBatch], deletedIds: [] },
        invoices: [],
      },
    );
    assert.equal(next.batches[0]?.productName, 'Server lens name');
    assert.equal(next.batches[0]?.stockQty, 7);
    assert.equal(next.invoices[0]?.syncStatus, 'PENDING');
    assert.equal(next.customers[0]?.id, customer.id);
  });

  it('adopts a server copy after a lost sync response and restores pending after a failed push', () => {
    const pending: PosInvoice = {
      localId: '50000000-0000-4000-8000-000000000099',
      serverId: null,
      invoiceNumber: null,
      customerId: customer.id,
      status: 'PAID',
      paymentType: 'CASH',
      total: '10.00',
      discount: '0.00',
      syncStatus: 'SYNCING',
      needsReview: false,
      reviewReason: null,
      issuedAt: '2026-09-29T12:00:00.000Z',
      items: [],
    };
    const serverInvoice: ServerInvoice = {
      id: '50000000-0000-4000-8000-000000000077',
      localId: pending.localId,
      clientLocalId: pending.localId,
      serverId: '50000000-0000-4000-8000-000000000077',
      invoiceNumber: 12,
      customerId: customer.id,
      status: 'PAID',
      paymentType: 'CASH',
      total: '10.00',
      discount: '0.00',
      needsReview: false,
      reviewReason: null,
      issuedAt: pending.issuedAt,
      updatedAt: '2026-09-29T13:00:00.000Z',
      items: [],
    };
    const merged = applyPull(
      { customers: [], batches: [], invoices: [pending] },
      {
        serverTime: '2026-09-29T13:00:00.000Z',
        customers: { upserted: [], deletedIds: [] },
        inventoryBatches: { upserted: [], deletedIds: [] },
        invoices: [serverInvoice],
      },
    );
    assert.equal(merged.invoices[0]?.syncStatus, 'SYNCED');
    assert.equal(merged.invoices[0]?.invoiceNumber, 12);

    const restored = restorePendingAfterFailure([pending], [pending.localId]);
    assert.equal(restored[0]?.syncStatus, 'PENDING');

    const conflicted = applyPushResults(
      [pending],
      [
        {
          localId: pending.localId,
          syncStatus: 'CONFLICT',
          serverId: null,
          invoiceNumber: null,
          needsReview: false,
          reviewReason: 'Still on this device',
          stockShortfalls: [],
        },
      ],
    );
    assert.equal(conflicted[0]?.syncStatus, 'CONFLICT');
    assert.equal(conflicted[0]?.reviewReason, 'Still on this device');
  });
});
