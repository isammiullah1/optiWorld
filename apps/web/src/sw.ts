/**
 * Source for the retailer POS service worker.
 * The browser loads apps/web/public/sw.js, which keeps the same cache rules,
 * IndexedDB name, and sync-invoices tag. This file stays out of the Next.js
 * typecheck because service-worker globals are not part of the DOM lib.
 */
const STATIC_CACHE = 'optiworld-static-v2';
const DB_NAME = 'optiworld-pos';
const DB_VERSION = 2;
const SYNC_TAG = 'sync-invoices';

type SyncEvent = Event & { tag: string; waitUntil: (work: Promise<unknown>) => void };

const worker = self as unknown as ServiceWorkerGlobalScope & {
  addEventListener: (type: string, listener: (event: Event) => void) => void;
};

worker.addEventListener('fetch', (event) => {
  const fetchEvent = event as FetchEvent;
  const request = fetchEvent.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/')) {
    fetchEvent.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/_next/') || url.pathname === '/sw.js') {
    fetchEvent.respondWith(networkFirstUpdatingCache(request));
    return;
  }
  if (/\.(?:js|css|png|svg|ico|woff2)$/.test(url.pathname)) {
    fetchEvent.respondWith(cacheFirst(request));
  }
});

worker.addEventListener('sync', (event) => {
  const syncEvent = event as SyncEvent;
  if (syncEvent.tag !== SYNC_TAG) {
    return;
  }
  syncEvent.waitUntil(pushPendingInvoices());
});

async function networkFirst(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function networkFirstUpdatingCache(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function pushPendingInvoices(): Promise<void> {
  const database = await indexedDB.databases?.();
  void database;
  const db = await openLocalDb();
  const meta = await getAll<{ key: string; value: string }>(db, 'meta');
  const token = meta.find((row) => row.key === 'accessToken');
  const invoices = await getAll<LocalInvoice>(db, 'local_invoices');
  const items = await getAll<LocalItem>(db, 'local_invoice_items');
  db.close();
  const pending = invoices.filter(
    (invoice) => invoice.syncStatus === 'PENDING' || invoice.syncStatus === 'SYNCING',
  );
  if (!token || pending.length === 0) {
    return;
  }
  for (let index = 0; index < pending.length; index += 20) {
    const batch = pending.slice(index, index + 20);
    const response = await fetch('/api/v1/sync/push', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({
        invoices: batch.map((invoice) => ({
          localId: invoice.localId,
          customerId: invoice.customerId,
          status: invoice.status,
          paymentType: invoice.paymentType,
          discount: invoice.discount,
          issuedAt: invoice.issuedAt,
          items: items
            .filter((item) => item.invoiceId === invoice.id)
            .map((item) => ({
              inventoryBatchId: item.inventoryBatchId,
              productName: item.productName,
              priceCode: item.priceCode,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              salePrice: item.salePrice,
            })),
        })),
      }),
    });
    if (!response.ok) {
      throw new Error('Pending invoices stayed on this device');
    }
  }
}

type LocalInvoice = {
  id: string;
  localId: string;
  customerId: string;
  status: string;
  paymentType: string;
  discount: string;
  issuedAt: string;
  syncStatus: string;
};

type LocalItem = {
  invoiceId: string;
  inventoryBatchId: string;
  productName: string;
  priceCode: string;
  quantity: number;
  unitPrice: string;
  salePrice: string;
};

function openLocalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local sales'));
  });
}

function getAll<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error('Could not read local sales'));
  });
}

export {};
