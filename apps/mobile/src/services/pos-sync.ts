import NetInfo from '@react-native-community/netinfo';
import type { Database } from '@nozbe/watermelondb';
import {
  LabPrescriptionSchema,
  SyncPullResponseSchema,
  SyncPushResponseSchema,
  applyPull,
  applyPushResults,
  chunkForPush,
  centsToMoney,
  createCartSale,
  createLocalSale,
  invoicesToPush,
  markInvoicesSyncing,
  moneyToCents,
  restorePendingAfterFailure,
  withCustomerDetails,
  type CustomerCache,
  type InventoryCache,
  type InvoiceStatus,
  type LabPrescription,
  type PosInvoice,
} from '@optiworld/shared';

import {
  LocalCustomer,
  LocalInventoryBatch,
  LocalInvoice,
  LocalInvoiceItem,
  LocalSyncState,
} from '../database/models';
import { getPosDatabase } from '../database';
import { getAccessToken, refreshAccessToken } from './auth-service';

type DeviceSnapshot = {
  customers: CustomerCache[];
  batches: InventoryCache[];
  invoices: PosInvoice[];
  lastSyncedAt: string | null;
};

export function startRetailerPosSync(): () => void {
  return NetInfo.addEventListener((state) => {
    if (state.isConnected === true) {
      void syncPendingInvoices()
        .then(() => pullLatestData())
        .catch((error: unknown) => {
          lastSyncError = error instanceof Error ? error.message : 'Sync could not finish';
        });
    }
  });
}

let lastSyncError: string | null = null;

export function getLastSyncError(): string | null {
  return lastSyncError;
}

export async function recordOfflineSale(input: {
  customerId: string;
  inventoryBatchId: string;
  quantity: number;
  status: InvoiceStatus;
}): Promise<PosInvoice> {
  const database = getPosDatabase();
  const snapshot = await readSnapshot(database);
  const created = createLocalSale({
    ...input,
    customers: snapshot.customers,
    batches: snapshot.batches,
    now: new Date(),
    localId: crypto.randomUUID(),
    localItemId: crypto.randomUUID(),
  });
  if (!created.ok) {
    throw new Error(created.message);
  }
  await writeSnapshot(database, {
    ...snapshot,
    invoices: [...snapshot.invoices, created.invoice],
    batches: created.batches,
  });
  return created.invoice;
}

export async function readLocalCatalog(): Promise<{
  customers: CustomerCache[];
  batches: InventoryCache[];
}> {
  const snapshot = await readSnapshot(getPosDatabase());
  return { customers: snapshot.customers, batches: snapshot.batches };
}

export async function readLocalReceipt(localId: string): Promise<{
  customerName: string;
  status: 'PAID' | 'CREDIT';
  subtotal: string;
  discount: string;
  deliveryCharge: string | null;
  deliveryAddress: string | null;
  total: string;
  items: { id: string; productName: string; quantity: number; lineTotal: string }[];
} | null> {
  const snapshot = await readSnapshot(getPosDatabase());
  const invoice = snapshot.invoices.find((entry) => entry.localId === localId);
  if (!invoice) {
    return null;
  }
  const customer = snapshot.customers.find((entry) => entry.id === invoice.customerId);
  return {
    customerName: customer?.name ?? 'Customer',
    status: invoice.status,
    subtotal: centsToMoney(
      moneyToCents(invoice.total) +
        moneyToCents(invoice.discount) -
        moneyToCents(invoice.deliveryCharge ?? '0'),
    ),
    discount: invoice.discount,
    deliveryCharge: invoice.deliveryAddress ? (invoice.deliveryCharge ?? '0.00') : null,
    deliveryAddress: invoice.deliveryAddress ?? null,
    total: invoice.total,
    items: invoice.items.map((item) => ({
      id: item.localItemId,
      productName: item.productName,
      quantity: item.quantity,
      lineTotal: centsToMoney(moneyToCents(item.unitPrice) * item.quantity),
    })),
  };
}

export async function recordCartSale(input: {
  customerId: string;
  items: ReadonlyArray<{ inventoryBatchId: string; quantity: number; unitPrice: string }>;
  discount: string;
  status: InvoiceStatus;
  localId: string;
  labJob?: LabPrescription;
}): Promise<PosInvoice> {
  const database = getPosDatabase();
  const snapshot = await readSnapshot(database);
  const created = createCartSale({
    customerId: input.customerId,
    items: input.items.map((item) => ({ ...item, localItemId: crypto.randomUUID() })),
    discount: input.discount,
    status: input.status,
    customers: snapshot.customers,
    batches: snapshot.batches,
    now: new Date(),
    localId: input.localId,
    ...(input.labJob ? { labJob: input.labJob } : {}),
  });
  if (!created.ok) {
    throw new Error(created.message);
  }
  await writeSnapshot(database, {
    ...snapshot,
    invoices: [...snapshot.invoices, created.invoice],
    batches: created.batches,
  });
  return created.invoice;
}

export async function syncPos(): Promise<void> {
  await syncPendingInvoices();
  await pullLatestData();
}

export async function syncPendingInvoices(): Promise<void> {
  const database = getPosDatabase();
  const snapshot = await readSnapshot(database);
  const pendingIds = invoicesToPush(snapshot.invoices).map((invoice) => invoice.localId);
  if (pendingIds.length === 0) {
    return;
  }
  let invoices = markInvoicesSyncing(snapshot.invoices, pendingIds);
  await writeSnapshot(database, { ...snapshot, invoices });

  try {
    const token = await tokenForSync();
    for (const batch of chunkForPush(
      withCustomerDetails(invoicesToPush(invoices), snapshot.customers),
    )) {
      const pushed = await postJson(
        '/api/v1/sync/push',
        token,
        { invoices: batch },
        SyncPushResponseSchema,
      );
      invoices = applyPushResults(invoices, pushed.results);
      for (const result of pushed.results) {
        if (result.syncStatus === 'CONFLICT') {
          invoices = handleConflict(
            invoices,
            result.localId,
            result.reviewReason ?? 'Sync conflict',
          );
        }
      }
      await writeSnapshot(database, { ...snapshot, invoices });
    }
    lastSyncError = null;
  } catch (error) {
    const current = await readSnapshot(database);
    await writeSnapshot(database, {
      ...current,
      invoices: restorePendingAfterFailure(current.invoices, pendingIds),
    });
    throw error;
  }
}

export async function pullLatestData(): Promise<void> {
  const database = getPosDatabase();
  const snapshot = await readSnapshot(database);
  const token = await tokenForSync();
  const since = snapshot.lastSyncedAt ? `?since=${encodeURIComponent(snapshot.lastSyncedAt)}` : '';
  const pulled = await getJson(`/api/v1/sync/pull${since}`, token, SyncPullResponseSchema);
  const next = applyPull(
    { customers: snapshot.customers, batches: snapshot.batches, invoices: snapshot.invoices },
    pulled,
  );
  await writeSnapshot(database, { ...next, lastSyncedAt: pulled.changedAt ?? next.serverTime });
  lastSyncError = null;
}

export function handleConflict(
  invoices: PosInvoice[],
  localId: string,
  serverError: string,
): PosInvoice[] {
  return invoices.map((invoice) =>
    invoice.localId === localId
      ? { ...invoice, syncStatus: 'CONFLICT', reviewReason: serverError, needsReview: true }
      : invoice,
  );
}

export async function readSyncCounts(): Promise<{
  pendingCount: number;
  reviewCount: number;
  conflictCount: number;
}> {
  const snapshot = await readSnapshot(getPosDatabase());
  return {
    pendingCount: snapshot.invoices.filter(
      (invoice) => invoice.syncStatus === 'PENDING' || invoice.syncStatus === 'SYNCING',
    ).length,
    reviewCount: snapshot.invoices.filter((invoice) => invoice.needsReview).length,
    conflictCount: snapshot.invoices.filter((invoice) => invoice.syncStatus === 'CONFLICT').length,
  };
}

async function readSnapshot(database: Database): Promise<DeviceSnapshot> {
  const [invoices, items, customers, batches, states] = await Promise.all([
    database.get<LocalInvoice>('local_invoices').query().fetch(),
    database.get<LocalInvoiceItem>('local_invoice_items').query().fetch(),
    database.get<LocalCustomer>('local_customers').query().fetch(),
    database.get<LocalInventoryBatch>('local_inventory').query().fetch(),
    database.get<LocalSyncState>('local_sync_state').query().fetch(),
  ]);
  const state = states[0];
  return {
    customers: customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone || null,
      email: customer.email || null,
      creditLimit: customer.creditLimit,
      updatedAt: new Date(customer.updatedAt).toISOString(),
    })),
    batches: batches.map((batch) => ({
      id: batch.id,
      priceCode: batch.priceCode,
      prefix: batch.prefix,
      productName: batch.productName,
      category: batch.category,
      salePrice: batch.salePrice,
      stockQty: batch.stockQty,
      lowStockThreshold: batch.lowStockThreshold,
      updatedAt: new Date(batch.updatedAt).toISOString(),
    })),
    invoices: invoices.map((invoice) => {
      const labJob = readLabJob(invoice.labJob);
      return {
        localId: invoice.id,
        serverId: invoice.serverId || null,
        invoiceNumber: invoice.invoiceNumber > 0 ? invoice.invoiceNumber : null,
        customerId: invoice.customerId,
        status: invoice.status === 'CREDIT' ? 'CREDIT' : 'PAID',
        paymentType: paymentType(invoice.paymentType),
        total: invoice.total,
        discount: invoice.discount,
        syncStatus: syncStatus(invoice.saleSyncStatus),
        needsReview: invoice.needsReview,
        reviewReason: invoice.reviewReason || null,
        issuedAt: new Date(invoice.issuedAt).toISOString(),
        ...(labJob ? { labJob } : {}),
        items: items
          .filter((item) => item.invoiceId === invoice.id)
          .map((item) => ({
            localItemId: item.id,
            inventoryBatchId: item.inventoryBatchId,
            productName: item.productName,
            priceCode: item.priceCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            salePrice: item.salePrice,
            stockShortfall: item.stockShortfall,
          })),
      };
    }),
    lastSyncedAt: state?.lastSyncedAt || null,
  };
}

async function writeSnapshot(database: Database, snapshot: DeviceSnapshot): Promise<void> {
  const invoices = database.get<LocalInvoice>('local_invoices');
  const items = database.get<LocalInvoiceItem>('local_invoice_items');
  const customers = database.get<LocalCustomer>('local_customers');
  const batches = database.get<LocalInventoryBatch>('local_inventory');
  const states = database.get<LocalSyncState>('local_sync_state');
  await database.write(async () => {
    await destroyAll(invoices);
    await destroyAll(items);
    await destroyAll(customers);
    await destroyAll(batches);
    await destroyAll(states);
    for (const customer of snapshot.customers) {
      await customers.create((record) => {
        record._raw.id = customer.id;
        record.name = customer.name;
        record.phone = customer.phone ?? '';
        record.email = customer.email ?? '';
        record.serverId = customer.id;
        record.creditLimit = customer.creditLimit;
        record.outstandingBalance = '0.00';
        record.updatedAt = Date.parse(customer.updatedAt);
        record.lastSyncedAt = snapshot.lastSyncedAt ?? '';
      });
    }
    for (const batch of snapshot.batches) {
      await batches.create((record) => {
        record._raw.id = batch.id;
        record.serverId = batch.id;
        record.priceCode = batch.priceCode;
        record.prefix = batch.prefix;
        record.productName = batch.productName;
        record.category = batch.category;
        record.salePrice = batch.salePrice;
        record.stockQty = batch.stockQty;
        record.lowStockThreshold = batch.lowStockThreshold;
        record.updatedAt = Date.parse(batch.updatedAt);
        record.lastSyncedAt = snapshot.lastSyncedAt ?? '';
      });
    }
    for (const invoice of snapshot.invoices) {
      const customer = snapshot.customers.find((entry) => entry.id === invoice.customerId);
      await invoices.create((record) => {
        record._raw.id = invoice.localId;
        record.serverId = invoice.serverId ?? '';
        record.orgId = '';
        record.invoiceNumber = invoice.invoiceNumber ?? 0;
        record.customerId = invoice.customerId;
        record.customerName = customer?.name ?? '';
        record.status = invoice.status;
        record.paymentType = invoice.paymentType;
        record.total = invoice.total;
        record.discount = invoice.discount;
        record.saleSyncStatus = invoice.syncStatus;
        record.needsReview = invoice.needsReview;
        record.reviewReason = invoice.reviewReason ?? '';
        record.labJob = invoice.labJob ? JSON.stringify(invoice.labJob) : '';
        record.issuedAt = Date.parse(invoice.issuedAt);
        record.createdAt = Date.parse(invoice.issuedAt);
        record.updatedAt = Date.now();
      });
      for (const item of invoice.items) {
        await items.create((record) => {
          record._raw.id = item.localItemId;
          record.invoiceId = invoice.localId;
          record.inventoryBatchId = item.inventoryBatchId;
          record.productName = item.productName;
          record.priceCode = item.priceCode;
          record.quantity = item.quantity;
          record.unitPrice = item.unitPrice;
          record.salePrice = item.salePrice;
          record.stockShortfall = item.stockShortfall;
        });
      }
    }
    await states.create((record) => {
      record._raw.id = 'state';
      record.lastSyncedAt = snapshot.lastSyncedAt ?? '';
    });
  });
}

async function destroyAll<T extends { destroyPermanently: () => Promise<void> }>(collection: {
  query: () => { fetch: () => Promise<T[]> };
}): Promise<void> {
  const records = await collection.query().fetch();
  for (const record of records) {
    await record.destroyPermanently();
  }
}

function paymentType(value: string): PosInvoice['paymentType'] {
  if (value === 'CARD' || value === 'UPI' || value === 'BANK_TRANSFER' || value === 'CREDIT') {
    return value;
  }
  return 'CASH';
}

function syncStatus(value: string): PosInvoice['syncStatus'] {
  if (value === 'SYNCING' || value === 'SYNCED' || value === 'CONFLICT') {
    return value;
  }
  return 'PENDING';
}

async function tokenForSync(): Promise<string> {
  const current = await getAccessToken();
  if (current) {
    return current;
  }
  return refreshAccessToken();
}

async function postJson<T>(
  path: string,
  accessToken: string,
  body: unknown,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  return readResponse(response, schema);
}

async function getJson<T>(
  path: string,
  accessToken: string,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return readResponse(response, schema);
}

async function readResponse<T>(
  response: Response,
  schema: { parse: (value: unknown) => T },
): Promise<T> {
  const payload: unknown = await response.json();
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    throw new Error(refreshed ? 'Sign in expired. Sync will retry.' : 'Sign in is required');
  }
  if (!response.ok || !isSuccess(payload)) {
    throw new Error(readError(payload));
  }
  return schema.parse(payload.data);
}

function isSuccess(payload: unknown): payload is { success: true; data: unknown } {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'success' in payload &&
    payload.success === true
  );
}

function readError(payload: unknown): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message;
  }
  return 'Sync could not finish. Sales on this device were kept.';
}

function readLabJob(raw: string): LabPrescription | undefined {
  if (!raw) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = LabPrescriptionSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

function apiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
}
