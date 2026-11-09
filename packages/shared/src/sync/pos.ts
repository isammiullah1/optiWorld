import { SYNC_PUSH_BATCH_SIZE } from '../constants/index.js';
import type { InvoiceStatus, PaymentMethod } from '../enums/index.js';
import type {
  CustomerCache,
  InventoryCache,
  OfflineInvoice,
  PosInvoice,
  ServerInvoice,
  SyncInvoiceResult,
  SyncPullResponse,
} from '../schemas/sync.js';

export function moneyToCents(value: string): number {
  const [whole = '0', fraction = ''] = value.split('.');
  const padded = `${fraction}00`.slice(0, 2);
  return Number(whole) * 100 + Number(padded);
}

export function centsToMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}

export function paymentTypeForStatus(status: InvoiceStatus): PaymentMethod {
  return status === 'CREDIT' ? 'CREDIT' : 'CASH';
}

export const LAB_REFERENCE_PATTERN = /^(?:OW-\d{4}-\d{3}|OW-LAB-\d{4}-[A-Z0-9]{5})$/;

export function labDayMonth(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    day: '2-digit',
    month: '2-digit',
  }).formatToParts(now);
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  return `${day}${month}`;
}

export function makeLabReference(now: Date = new Date()): string {
  const sequence = Math.floor(Math.random() * 1000);
  return `OW-${labDayMonth(now)}-${String(sequence).padStart(3, '0')}`;
}

export function productTagLabel(reference: string): string {
  const match = /^OW-(\d{4}-\d{3})$/.exec(reference);
  return match?.[1] ?? reference;
}

export function nextProductTag(taken: ReadonlySet<string>, now: Date = new Date()): string {
  const dayMonth = labDayMonth(now);
  for (let sequence = 1; sequence <= 999; sequence += 1) {
    const reference = `OW-${dayMonth}-${String(sequence).padStart(3, '0')}`;
    if (!taken.has(reference)) {
      return reference;
    }
  }
  throw new Error('No product tag is left for today');
}

export function resolveDiscountCents(
  subtotalCents: number,
  mode: 'AMOUNT' | 'PERCENT',
  value: string,
): number {
  const trimmed = value.trim();
  if (!trimmed || subtotalCents <= 0) {
    return 0;
  }
  if (mode === 'PERCENT') {
    const percent = Number(trimmed);
    if (!Number.isFinite(percent) || percent <= 0) {
      return 0;
    }
    return Math.min(subtotalCents, Math.round((subtotalCents * percent) / 100));
  }
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(trimmed)) {
    return 0;
  }
  return Math.min(subtotalCents, moneyToCents(trimmed));
}

export type CartLineInput = {
  inventoryBatchId: string;
  quantity: number;
  unitPrice: string;
  localItemId: string;
  prescription?: PosInvoice['items'][number]['prescription'];
};

export type CartSaleInput = {
  customerId: string;
  items: readonly CartLineInput[];
  discount: string;
  status: InvoiceStatus;
  customers: readonly CustomerCache[];
  batches: readonly InventoryCache[];
  now: Date;
  localId: string;
  paymentType?: PaymentMethod;
  amountReceived?: string;
  deliveryAddress?: string;
  deliveryCharge?: string;
  labJob?: PosInvoice['labJob'];
  billLabOrgId?: string;
  assignAllToLab?: boolean;
};

export type LocalSaleInput = {
  customerId: string;
  inventoryBatchId: string;
  quantity: number;
  status: InvoiceStatus;
  customers: readonly CustomerCache[];
  batches: readonly InventoryCache[];
  now: Date;
  localId: string;
  localItemId: string;
};

export type LocalSaleResult =
  { ok: true; invoice: PosInvoice; batches: InventoryCache[] } | { ok: false; message: string };

/** Records a sale on the device and deducts cached stock. The sale is kept even when stock is short. */
export function createLocalSale(input: LocalSaleInput): LocalSaleResult {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    return { ok: false, message: 'Quantity must be at least 1' };
  }

  const customer = input.customers.find((entry) => entry.id === input.customerId);
  if (!customer) {
    return { ok: false, message: 'Choose a customer that is saved on this device' };
  }

  const batch = input.batches.find((entry) => entry.id === input.inventoryBatchId);
  if (!batch) {
    return { ok: false, message: 'Choose a product that is saved on this device' };
  }

  const deducted = Math.min(batch.stockQty, input.quantity);
  const shortfall = input.quantity - deducted;
  const unitPrice = centsToMoney(moneyToCents(batch.salePrice));
  const total = centsToMoney(moneyToCents(unitPrice) * input.quantity);
  const issuedAt = input.now.toISOString();

  const invoice: PosInvoice = {
    localId: input.localId,
    serverId: null,
    invoiceNumber: null,
    customerId: customer.id,
    status: input.status,
    paymentType: paymentTypeForStatus(input.status),
    total,
    discount: '0.00',
    syncStatus: 'PENDING',
    needsReview: shortfall > 0,
    reviewReason:
      shortfall > 0
        ? `This device only had ${deducted} in stock. The sale was kept for the owner to review.`
        : null,
    issuedAt,
    items: [
      {
        localItemId: input.localItemId,
        inventoryBatchId: batch.id,
        productName: batch.productName,
        priceCode: batch.priceCode,
        quantity: input.quantity,
        unitPrice,
        salePrice: unitPrice,
        stockShortfall: shortfall,
      },
    ],
  };

  const batches = input.batches.map((entry) =>
    entry.id === batch.id ? { ...entry, stockQty: entry.stockQty - deducted } : entry,
  );

  return { ok: true, invoice, batches };
}

/** Records a multi-line sale on the device. Stock shortfalls are kept with the sale. */
export function createCartSale(input: CartSaleInput): LocalSaleResult {
  if (input.items.length === 0) {
    return { ok: false, message: 'Add a product before completing the sale' };
  }
  const customer = input.customers.find((entry) => entry.id === input.customerId);
  if (!customer) {
    return { ok: false, message: 'Choose a customer that is saved on this device' };
  }

  const working = input.batches.map((batch) => ({ ...batch }));
  const lines: PosInvoice['items'] = [];
  let shortUnits = 0;
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return { ok: false, message: 'Quantity must be at least 1' };
    }
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(item.unitPrice)) {
      return { ok: false, message: 'Enter a valid unit price' };
    }
    const batch = working.find((entry) => entry.id === item.inventoryBatchId);
    if (!batch) {
      return { ok: false, message: 'Choose a product that is saved on this device' };
    }
    const deducted = Math.min(batch.stockQty, item.quantity);
    const shortfall = item.quantity - deducted;
    batch.stockQty -= deducted;
    shortUnits += shortfall;
    const unitPrice = centsToMoney(moneyToCents(item.unitPrice));
    lines.push({
      localItemId: item.localItemId,
      inventoryBatchId: batch.id,
      productName: batch.productName,
      priceCode: batch.priceCode,
      quantity: item.quantity,
      unitPrice,
      salePrice: centsToMoney(moneyToCents(batch.salePrice)),
      stockShortfall: shortfall,
      ...(item.prescription ? { prescription: item.prescription } : {}),
    });
  }

  const subtotal = lines.reduce(
    (sum, line) => sum + moneyToCents(line.unitPrice) * line.quantity,
    0,
  );
  const discount = moneyToCents(input.discount);
  if (discount > subtotal) {
    return { ok: false, message: 'The discount is larger than the sale total' };
  }
  const deliveryAddress = input.deliveryAddress?.trim() ?? '';
  if (
    deliveryAddress &&
    (!input.deliveryCharge || !/^\d{1,10}(\.\d{1,2})?$/.test(input.deliveryCharge))
  ) {
    return { ok: false, message: 'Enter the delivery charges' };
  }
  const deliveryCents = deliveryAddress ? moneyToCents(input.deliveryCharge ?? '0') : 0;
  const totalCents = subtotal - discount + deliveryCents;
  const receivedCents =
    input.paymentType === 'CREDIT'
      ? input.amountReceived
        ? moneyToCents(input.amountReceived)
        : 0
      : totalCents;
  if (receivedCents > totalCents) {
    return { ok: false, message: 'Enter an amount from zero up to the bill total' };
  }
  const status =
    input.paymentType === 'CREDIT' && receivedCents < totalCents ? 'CREDIT' : input.status;

  const invoice: PosInvoice = {
    localId: input.localId,
    serverId: null,
    invoiceNumber: null,
    customerId: customer.id,
    status,
    paymentType: input.paymentType ?? paymentTypeForStatus(status),
    ...(input.paymentType === 'CREDIT' ? { amountReceived: centsToMoney(receivedCents) } : {}),
    ...(deliveryAddress ? { deliveryAddress, deliveryCharge: centsToMoney(deliveryCents) } : {}),
    total: centsToMoney(totalCents),
    discount: centsToMoney(discount),
    syncStatus: 'PENDING',
    needsReview: shortUnits > 0,
    reviewReason:
      shortUnits > 0
        ? `This device was short by ${shortUnits} units. The sale was kept for the owner to review.`
        : null,
    issuedAt: input.now.toISOString(),
    items: lines,
    ...(input.labJob ? { labJob: input.labJob } : {}),
    ...(input.billLabOrgId ? { billLabOrgId: input.billLabOrgId } : {}),
    ...(input.assignAllToLab ? { assignAllToLab: true } : {}),
  };

  return { ok: true, invoice, batches: working };
}

export function applyCustomerPull(
  local: readonly CustomerCache[],
  upserted: readonly CustomerCache[],
  deletedIds: readonly string[],
): CustomerCache[] {
  const next = new Map(local.map((customer) => [customer.id, customer]));
  for (const id of deletedIds) {
    next.delete(id);
  }
  for (const customer of upserted) {
    next.set(customer.id, customer);
  }
  return [...next.values()];
}

export function pendingDeductions(invoices: readonly PosInvoice[]): ReadonlyMap<string, number> {
  const totals = new Map<string, number>();
  for (const invoice of invoices) {
    const stillOnDevice =
      invoice.syncStatus === 'PENDING' ||
      invoice.syncStatus === 'SYNCING' ||
      (invoice.syncStatus === 'CONFLICT' && invoice.serverId === null);
    if (!stillOnDevice) {
      continue;
    }
    for (const item of invoice.items) {
      const reserved = Math.max(0, item.quantity - item.stockShortfall);
      totals.set(item.inventoryBatchId, (totals.get(item.inventoryBatchId) ?? 0) + reserved);
    }
  }
  return totals;
}

/** Server stock replaces the cache, then unsynced local sales are reserved again. */
export function applyInventoryPull(
  local: readonly InventoryCache[],
  upserted: readonly InventoryCache[],
  deletedIds: readonly string[],
  invoices: readonly PosInvoice[],
): InventoryCache[] {
  const reserved = pendingDeductions(invoices);
  const next = new Map(local.map((batch) => [batch.id, batch]));
  for (const id of deletedIds) {
    next.delete(id);
  }
  for (const batch of upserted) {
    const held = reserved.get(batch.id) ?? 0;
    next.set(batch.id, {
      ...batch,
      stockQty: Math.max(0, batch.stockQty - held),
    });
  }
  return [...next.values()];
}

export function mergeInvoices(
  local: readonly PosInvoice[],
  remote: readonly ServerInvoice[],
): PosInvoice[] {
  const next = new Map(local.map((invoice) => [invoice.localId, invoice]));

  for (const serverInvoice of remote) {
    const localId = serverInvoice.clientLocalId ?? serverInvoice.id;
    const existing = next.get(localId);
    if (existing?.syncStatus === 'CONFLICT') {
      continue;
    }
    if (
      existing &&
      (existing.syncStatus === 'PENDING' || existing.syncStatus === 'SYNCING') &&
      serverInvoice.clientLocalId !== existing.localId
    ) {
      continue;
    }
    next.set(localId, serverInvoiceToLocal(serverInvoice));
  }

  return [...next.values()];
}

export function applyPushResults(
  local: readonly PosInvoice[],
  results: readonly SyncInvoiceResult[],
): PosInvoice[] {
  const byLocalId = new Map(results.map((result) => [result.localId, result]));
  return local.map((invoice) => {
    const result = byLocalId.get(invoice.localId);
    if (!result) {
      return invoice.syncStatus === 'SYNCING' ? { ...invoice, syncStatus: 'PENDING' } : invoice;
    }
    if (result.syncStatus === 'CONFLICT') {
      return {
        ...invoice,
        syncStatus: 'CONFLICT',
        serverId: result.serverId,
        invoiceNumber: result.invoiceNumber,
        needsReview: result.needsReview,
        reviewReason: result.reviewReason,
      };
    }

    const shortfallByBatch = new Map(
      result.stockShortfalls.map((entry) => [entry.inventoryBatchId, entry.shortfall]),
    );
    return {
      ...invoice,
      syncStatus: 'SYNCED',
      serverId: result.serverId,
      invoiceNumber: result.invoiceNumber,
      needsReview: result.needsReview,
      reviewReason: result.reviewReason,
      items: invoice.items.map((item) => ({
        ...item,
        stockShortfall: shortfallByBatch.get(item.inventoryBatchId) ?? item.stockShortfall,
      })),
    };
  });
}

export function markInvoicesSyncing(
  local: readonly PosInvoice[],
  localIds: readonly string[],
): PosInvoice[] {
  const selected = new Set(localIds);
  return local.map((invoice) =>
    selected.has(invoice.localId) ? { ...invoice, syncStatus: 'SYNCING' } : invoice,
  );
}

export function restorePendingAfterFailure(
  local: readonly PosInvoice[],
  localIds: readonly string[],
): PosInvoice[] {
  const selected = new Set(localIds);
  return local.map((invoice) =>
    selected.has(invoice.localId) && invoice.syncStatus === 'SYNCING'
      ? { ...invoice, syncStatus: 'PENDING' }
      : invoice,
  );
}

export function chunkForPush<T>(items: readonly T[], size = SYNC_PUSH_BATCH_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function withCustomerDetails(
  invoices: readonly OfflineInvoice[],
  customers: readonly CustomerCache[],
): OfflineInvoice[] {
  return invoices.map((invoice) => {
    const customer = customers.find((entry) => entry.id === invoice.customerId);
    if (!customer) {
      return invoice;
    }
    return {
      ...invoice,
      customerName: customer.name,
      customerPhone: customer.phone,
    };
  });
}

export function invoicesToPush(local: readonly PosInvoice[]): OfflineInvoice[] {
  return local
    .filter((invoice) => invoice.syncStatus === 'PENDING' || invoice.syncStatus === 'SYNCING')
    .map((invoice) => ({
      localId: invoice.localId,
      customerId: invoice.customerId,
      status: invoice.status,
      paymentType: invoice.paymentType,
      discount: invoice.discount,
      issuedAt: invoice.issuedAt,
      items: invoice.items.map((item) => ({
        localItemId: item.localItemId,
        inventoryBatchId: item.inventoryBatchId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        ...(item.prescription ? { prescription: item.prescription } : {}),
      })),
      ...(invoice.labJob ? { labJob: invoice.labJob } : {}),
      ...(invoice.billLabOrgId ? { billLabOrgId: invoice.billLabOrgId } : {}),
      ...(invoice.assignAllToLab ? { assignAllToLab: true } : {}),
    }));
}

export function acceptServerInvoice(
  local: readonly PosInvoice[],
  serverInvoice: ServerInvoice,
): PosInvoice[] {
  const localId = serverInvoice.clientLocalId ?? serverInvoice.id;
  const next = local.filter(
    (invoice) => invoice.localId !== localId && invoice.serverId !== serverInvoice.id,
  );
  next.push(serverInvoiceToLocal(serverInvoice));
  return next;
}

export function applyPull(
  local: {
    customers: readonly CustomerCache[];
    batches: readonly InventoryCache[];
    invoices: readonly PosInvoice[];
  },
  remote: SyncPullResponse,
): {
  customers: CustomerCache[];
  batches: InventoryCache[];
  invoices: PosInvoice[];
  serverTime: string;
} {
  const invoices = mergeInvoices(local.invoices, remote.invoices);
  return {
    customers: applyCustomerPull(
      local.customers,
      remote.customers.upserted,
      remote.customers.deletedIds,
    ),
    batches: applyInventoryPull(
      local.batches,
      remote.inventoryBatches.upserted,
      remote.inventoryBatches.deletedIds,
      invoices,
    ),
    invoices,
    serverTime: remote.serverTime,
  };
}

function serverInvoiceToLocal(serverInvoice: ServerInvoice): PosInvoice {
  return {
    localId: serverInvoice.clientLocalId ?? serverInvoice.id,
    serverId: serverInvoice.id,
    invoiceNumber: serverInvoice.invoiceNumber,
    customerId: serverInvoice.customerId,
    status: serverInvoice.status,
    paymentType: serverInvoice.paymentType,
    total: serverInvoice.total,
    discount: serverInvoice.discount,
    syncStatus: 'SYNCED',
    needsReview: serverInvoice.needsReview,
    reviewReason: serverInvoice.reviewReason,
    issuedAt: serverInvoice.issuedAt,
    items: serverInvoice.items,
  };
}
