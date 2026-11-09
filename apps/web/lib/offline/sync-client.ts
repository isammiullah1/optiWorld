import {
  SyncPullResponseSchema,
  SyncPushResponseSchema,
  applyPull,
  applyPushResults,
  chunkForPush,
  createCartSale,
  createLocalSale,
  invoicesToPush,
  withCustomerDetails,
  markInvoicesSyncing,
  restorePendingAfterFailure,
  type CartLineInput,
  type InvoiceStatus,
  type LabPrescription,
  type PosInvoice,
} from '@optiworld/shared';

import { readPosSnapshot, rememberSyncToken, writePosSnapshot, type PosSnapshot } from './pos-db';

const SYNC_TAG = 'sync-invoices';

export async function recordOfflineSale(input: {
  customerId: string;
  inventoryBatchId: string;
  quantity: number;
  status: InvoiceStatus;
}): Promise<PosInvoice> {
  const snapshot = await readPosSnapshot();
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

  await writePosSnapshot({
    ...snapshot,
    invoices: [...snapshot.invoices, created.invoice],
    batches: created.batches,
  });
  return created.invoice;
}

export async function recordCartSale(input: {
  customerId: string;
  items: ReadonlyArray<{
    inventoryBatchId: string;
    quantity: number;
    unitPrice: string;
    prescription?: CartLineInput['prescription'];
  }>;
  discount: string;
  status: InvoiceStatus;
  paymentType?: 'CASH' | 'CREDIT';
  amountReceived?: string;
  deliveryAddress?: string;
  deliveryCharge?: string;
  localId: string;
  labJob?: LabPrescription;
  billLabOrgId?: string;
  assignAllToLab?: boolean;
}): Promise<PosInvoice> {
  const snapshot = await readPosSnapshot();
  const created = createCartSale({
    customerId: input.customerId,
    items: input.items.map((item) => ({ ...item, localItemId: crypto.randomUUID() })),
    discount: input.discount,
    status: input.status,
    ...(input.paymentType ? { paymentType: input.paymentType } : {}),
    ...(input.amountReceived !== undefined ? { amountReceived: input.amountReceived } : {}),
    ...(input.deliveryAddress
      ? { deliveryAddress: input.deliveryAddress, deliveryCharge: input.deliveryCharge ?? '0.00' }
      : {}),
    customers: snapshot.customers,
    batches: snapshot.batches,
    now: new Date(),
    localId: input.localId,
    ...(input.labJob ? { labJob: input.labJob } : {}),
    ...(input.billLabOrgId ? { billLabOrgId: input.billLabOrgId } : {}),
    ...(input.assignAllToLab ? { assignAllToLab: true } : {}),
  });
  if (!created.ok) {
    throw new Error(created.message);
  }
  await writePosSnapshot({
    ...snapshot,
    invoices: [...snapshot.invoices, created.invoice],
    batches: created.batches,
  });
  return created.invoice;
}

let inFlight: Promise<PosSnapshot> | null = null;

export function syncPos(accessToken: string): Promise<PosSnapshot> {
  if (inFlight) {
    return inFlight;
  }
  inFlight = runSync(accessToken).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runSync(accessToken: string): Promise<PosSnapshot> {
  const snapshot = await readPosSnapshot();
  const pendingIds = invoicesToPush(snapshot.invoices).map((invoice) => invoice.localId);
  let invoices = markInvoicesSyncing(snapshot.invoices, pendingIds);
  await writePosSnapshot({ ...snapshot, invoices });

  try {
    await rememberSyncToken(accessToken, apiBaseUrl());
    if (pendingIds.length > 0) {
      for (const batch of chunkForPush(
        withCustomerDetails(invoicesToPush(invoices), snapshot.customers),
      )) {
        const pushed = await postJson(
          '/api/v1/sync/push',
          accessToken,
          { invoices: batch },
          SyncPushResponseSchema,
        );
        invoices = applyPushResults(invoices, pushed.results);
        await writePosSnapshot({ ...snapshot, invoices });
      }
    }

    const since = snapshot.lastSyncedAt
      ? `?since=${encodeURIComponent(snapshot.lastSyncedAt)}`
      : '';
    const pulled = await getJson(`/api/v1/sync/pull${since}`, accessToken, SyncPullResponseSchema);
    const next = applyPull(
      { customers: snapshot.customers, batches: snapshot.batches, invoices },
      pulled,
    );
    const saved: PosSnapshot = { ...next, lastSyncedAt: pulled.changedAt ?? next.serverTime };
    await writePosSnapshot(saved);
    return saved;
  } catch (error) {
    const current = await readPosSnapshot();
    await writePosSnapshot({
      ...current,
      invoices: restorePendingAfterFailure(current.invoices, pendingIds),
    });
    throw error;
  }
}

export async function registerInvoiceSync(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  const registration = await navigator.serviceWorker.ready;
  const syncManager = (
    registration as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    }
  ).sync;
  if (!syncManager) {
    return;
  }
  await syncManager.register(SYNC_TAG);
}

export function isInvoiceSyncMessage(data: unknown): boolean {
  return typeof data === 'object' && data !== null && 'type' in data && data.type === SYNC_TAG;
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

function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}
