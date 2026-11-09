const STATIC_CACHE = 'optiworld-static-v2';
const DB_NAME = 'optiworld-pos';
const DB_VERSION = 2;
const SYNC_TAG = 'sync-invoices';
const PUSH_BATCH_SIZE = 20;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }
  // Next chunk URLs stay stable in dev. Cache-first would keep a stale bundle
  // after the page source changes. Network first, with the cache as the offline copy.
  if (url.pathname.startsWith('/_next/') || url.pathname === '/sw.js') {
    event.respondWith(networkFirstUpdatingCache(request));
    return;
  }
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag !== SYNC_TAG) {
    return;
  }
  event.waitUntil(pushPendingInvoices());
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function networkFirstUpdatingCache(request) {
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

async function cacheFirst(request) {
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

function isStaticAsset(pathname) {
  return /\.(?:js|css|png|svg|ico|woff2)$/.test(pathname);
}

async function pushPendingInvoices() {
  const db = await openDatabase();
  const tokenRow = await readAll(db, 'meta');
  const token = tokenRow.find((row) => row.key === 'accessToken');
  const apiBaseRow = tokenRow.find((row) => row.key === 'apiBase');
  const invoices = await readAll(db, 'local_invoices');
  const items = await readAll(db, 'local_invoice_items');
  db.close();
  const pending = invoices.filter(
    (invoice) => invoice.syncStatus === 'PENDING' || invoice.syncStatus === 'SYNCING',
  );
  if (!token || !apiBaseRow || pending.length === 0) {
    await notifyOpenPages();
    return;
  }
  const apiBase = new URL('/api/v1/sync/push', apiBaseRow.value);
  for (let index = 0; index < pending.length; index += PUSH_BATCH_SIZE) {
    const batch = pending.slice(index, index + PUSH_BATCH_SIZE).map((invoice) => ({
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
    }));
    const response = await fetch(apiBase, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token.value}`,
      },
      body: JSON.stringify({ invoices: batch }),
    });
    if (!response.ok) {
      throw new Error('Pending invoices stayed on this device');
    }
  }
  await notifyOpenPages();
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local sales'));
  });
}

function readAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not read local sales'));
  });
}

async function notifyOpenPages() {
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  await Promise.all(pages.map((page) => page.postMessage({ type: SYNC_TAG })));
}
