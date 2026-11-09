import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { CustomerCache, InventoryCache, PosInvoice, PosInvoiceItem } from '@optiworld/shared';

const DB_NAME = 'optiworld-pos';
export const POS_CHANGED_EVENT = 'optiworld-pos-changed';
const DB_VERSION = 2;

export type PosSnapshot = {
  customers: CustomerCache[];
  batches: InventoryCache[];
  invoices: PosInvoice[];
  lastSyncedAt: string | null;
};

type LocalInvoiceRow = Omit<PosInvoice, 'items'> & {
  id: string;
  customerName: string;
  createdAt: string;
  updatedAt: string;
};

type LocalItemRow = PosInvoiceItem & {
  id: string;
  invoiceId: string;
};

type LocalCustomerRow = CustomerCache & {
  serverId: string;
  outstandingBalance: string;
  lastSyncedAt: string | null;
};

type LocalInventoryRow = InventoryCache & {
  serverId: string;
  lastSyncedAt: string | null;
};

type MetaRow = { key: string; value: string };

interface PosDatabase extends DBSchema {
  local_invoices: { key: string; value: LocalInvoiceRow };
  local_invoice_items: { key: string; value: LocalItemRow; indexes: { invoiceId: string } };
  local_customers: { key: string; value: LocalCustomerRow };
  local_inventory: { key: string; value: LocalInventoryRow };
  meta: { key: string; value: MetaRow };
}

function openPosDb(): Promise<IDBPDatabase<PosDatabase>> {
  return openDB<PosDatabase>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      if (!db.objectStoreNames.contains('local_invoices')) {
        db.createObjectStore('local_invoices', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('local_invoice_items')) {
        const items = db.createObjectStore('local_invoice_items', { keyPath: 'id' });
        items.createIndex('invoiceId', 'invoiceId');
      }
      if (!db.objectStoreNames.contains('local_customers')) {
        db.createObjectStore('local_customers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('local_inventory')) {
        db.createObjectStore('local_inventory', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (oldVersion === 1) {
        return migrateLegacyStores(transaction as unknown as IDBTransaction);
      }
      return undefined;
    },
  });
}

async function migrateLegacyStores(transaction: IDBTransaction): Promise<void> {
  const invoices = await requestToPromise<Array<Omit<PosInvoice, 'items'>>>(
    transaction.objectStore('invoices').getAll(),
  );
  const items = await requestToPromise<Array<PosInvoiceItem & { invoiceLocalId: string }>>(
    transaction.objectStore('invoiceItems').getAll(),
  );
  const customers = await requestToPromise<CustomerCache[]>(
    transaction.objectStore('customers').getAll(),
  );
  const batches = await requestToPromise<InventoryCache[]>(
    transaction.objectStore('inventoryBatches').getAll(),
  );
  const meta = await requestToPromise<MetaRow[]>(transaction.objectStore('meta').getAll());
  const lastSyncedAt = meta.find((entry) => entry.key === 'lastSyncedAt')?.value ?? null;
  const invoiceStore = transaction.objectStore('local_invoices');
  const itemStore = transaction.objectStore('local_invoice_items');
  const customerStore = transaction.objectStore('local_customers');
  const inventoryStore = transaction.objectStore('local_inventory');
  for (const invoice of invoices) {
    invoiceStore.put(toInvoiceRow(invoice, customers, lastSyncedAt));
  }
  for (const item of items) {
    itemStore.put(toItemRow(item));
  }
  for (const customer of customers) {
    customerStore.put(toCustomerRow(customer, lastSyncedAt));
  }
  for (const batch of batches) {
    inventoryStore.put(toInventoryRow(batch, lastSyncedAt));
  }
}

export async function readPosSnapshot(): Promise<PosSnapshot> {
  const db = await openPosDb();
  const [invoices, items, customers, batches, meta] = await Promise.all([
    db.getAll('local_invoices'),
    db.getAll('local_invoice_items'),
    db.getAll('local_customers'),
    db.getAll('local_inventory'),
    db.getAll('meta'),
  ]);
  const lastSynced = meta.find((entry) => entry.key === 'lastSyncedAt');
  return {
    customers: customers.map(fromCustomerRow),
    batches: batches.map(fromInventoryRow),
    invoices: invoices.map((invoice) => ({
      ...fromInvoiceRow(invoice),
      items: items.filter((item) => item.invoiceId === invoice.id).map(fromItemRow),
    })),
    lastSyncedAt: lastSynced?.value ?? null,
  };
}

export async function writePosSnapshot(snapshot: PosSnapshot): Promise<void> {
  const db = await openPosDb();
  const tx = db.transaction(
    ['local_invoices', 'local_invoice_items', 'local_customers', 'local_inventory', 'meta'],
    'readwrite',
  );
  await Promise.all([
    tx.objectStore('local_invoices').clear(),
    tx.objectStore('local_invoice_items').clear(),
    tx.objectStore('local_customers').clear(),
    tx.objectStore('local_inventory').clear(),
  ]);
  await Promise.all([
    ...snapshot.invoices.map((invoice) =>
      tx
        .objectStore('local_invoices')
        .put(toInvoiceRow(invoice, snapshot.customers, snapshot.lastSyncedAt)),
    ),
    ...snapshot.invoices.flatMap((invoice) =>
      invoice.items.map((item) =>
        tx
          .objectStore('local_invoice_items')
          .put(toItemRow({ ...item, invoiceLocalId: invoice.localId })),
      ),
    ),
    ...snapshot.customers.map((customer) =>
      tx.objectStore('local_customers').put(toCustomerRow(customer, snapshot.lastSyncedAt)),
    ),
    ...snapshot.batches.map((batch) =>
      tx.objectStore('local_inventory').put(toInventoryRow(batch, snapshot.lastSyncedAt)),
    ),
  ]);
  const meta = tx.objectStore('meta');
  const kept = (await meta.getAll()).filter((row) => row.key !== 'lastSyncedAt');
  await meta.clear();
  if (snapshot.lastSyncedAt) {
    await meta.put({ key: 'lastSyncedAt', value: snapshot.lastSyncedAt });
  }
  await Promise.all(kept.map((row) => meta.put(row)));
  await tx.done;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(POS_CHANGED_EVENT));
  }
}

export async function readPosMeta(key: string): Promise<string | null> {
  const db = await openPosDb();
  const row = await db.get('meta', key);
  return row?.value ?? null;
}

export async function writePosMeta(key: string, value: string): Promise<void> {
  const db = await openPosDb();
  await db.put('meta', { key, value });
}

export async function rememberSyncToken(accessToken: string, apiBase: string): Promise<void> {
  const db = await openPosDb();
  const tx = db.transaction('meta', 'readwrite');
  await Promise.all([
    tx.store.put({ key: 'accessToken', value: accessToken }),
    tx.store.put({ key: 'apiBase', value: apiBase }),
    tx.done,
  ]);
}

function toInvoiceRow(
  invoice: Omit<PosInvoice, 'items'>,
  customers: readonly CustomerCache[],
  lastSyncedAt: string | null,
): LocalInvoiceRow {
  const customer = customers.find((entry) => entry.id === invoice.customerId);
  return {
    ...invoice,
    id: invoice.localId,
    customerName: customer?.name ?? '',
    createdAt: invoice.issuedAt,
    updatedAt: lastSyncedAt ?? invoice.issuedAt,
  };
}

function fromInvoiceRow(row: LocalInvoiceRow): Omit<PosInvoice, 'items'> {
  return {
    localId: row.localId,
    serverId: row.serverId,
    invoiceNumber: row.invoiceNumber,
    customerId: row.customerId,
    status: row.status,
    paymentType: row.paymentType,
    total: row.total,
    discount: row.discount,
    syncStatus: row.syncStatus,
    needsReview: row.needsReview,
    reviewReason: row.reviewReason,
    issuedAt: row.issuedAt,
    ...(row.labJob ? { labJob: row.labJob } : {}),
    ...(row.billLabOrgId ? { billLabOrgId: row.billLabOrgId } : {}),
    ...(row.assignAllToLab ? { assignAllToLab: true } : {}),
  };
}

function toItemRow(item: PosInvoiceItem & { invoiceLocalId: string }): LocalItemRow {
  return {
    ...item,
    id: item.localItemId,
    invoiceId: item.invoiceLocalId,
  };
}

function fromItemRow(row: LocalItemRow): PosInvoiceItem {
  return {
    localItemId: row.localItemId,
    inventoryBatchId: row.inventoryBatchId,
    productName: row.productName,
    priceCode: row.priceCode,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    salePrice: row.salePrice,
    stockShortfall: row.stockShortfall,
    ...(row.prescription ? { prescription: row.prescription } : {}),
  };
}

function toCustomerRow(customer: CustomerCache, lastSyncedAt: string | null): LocalCustomerRow {
  return {
    ...customer,
    serverId: customer.id,
    outstandingBalance: '0.00',
    lastSyncedAt,
  };
}

function fromCustomerRow(row: LocalCustomerRow): CustomerCache {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    creditLimit: row.creditLimit,
    updatedAt: row.updatedAt,
  };
}

function toInventoryRow(batch: InventoryCache, lastSyncedAt: string | null): LocalInventoryRow {
  return {
    ...batch,
    serverId: batch.id,
    lastSyncedAt,
  };
}

function fromInventoryRow(row: LocalInventoryRow): InventoryCache {
  return {
    id: row.id,
    priceCode: row.priceCode,
    prefix: row.prefix,
    productName: row.productName,
    category: row.category,
    prescriptionRequired: row.prescriptionRequired ?? null,
    salePrice: row.salePrice,
    stockQty: row.stockQty,
    lowStockThreshold: row.lowStockThreshold,
    updatedAt: row.updatedAt,
  };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not read local sales'));
  });
}
