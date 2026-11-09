'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

import type { InvoiceStatus } from '@optiworld/shared';

import { readPosSnapshot, type PosSnapshot } from '@/lib/offline/pos-db';
import {
  isInvoiceSyncMessage,
  recordOfflineSale,
  registerInvoiceSync,
  syncPos,
} from '@/lib/offline/sync-client';

import { LocalInvoiceList } from './local-invoice-list';
import { OfflineSaleForm } from './offline-sale-form';
import { SyncStatusBanner } from './sync-status-banner';
import { SyncStatusIcon } from './sync-status-icon';

const EMPTY: PosSnapshot = {
  customers: [],
  batches: [],
  invoices: [],
  lastSyncedAt: null,
};

export function RetailerPos(): React.ReactElement {
  const { data: session, status } = useSession();
  const [snapshot, setSnapshot] = useState<PosSnapshot>(EMPTY);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const sync = useCallback(async (): Promise<void> => {
    if (status === 'loading') {
      return;
    }
    const token = session?.accessToken;
    if (!token) {
      setMessage('Sign in again to sync sales.');
      return;
    }
    setSyncing(true);
    setMessage(null);
    try {
      setSnapshot(await syncPos(token));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Sync could not finish. Sales on this device were kept.',
      );
      setSnapshot(await readPosSnapshot());
    } finally {
      setSyncing(false);
    }
  }, [session?.accessToken, status]);

  useEffect(() => {
    let active = true;
    void readPosSnapshot().then((stored) => {
      if (active) {
        setSnapshot(stored);
      }
    });
    setOnline(navigator.onLine);
    const onOnline = (): void => {
      setOnline(true);
      void sync();
    };
    const onOffline = (): void => setOnline(false);
    const onMessage = (event: MessageEvent): void => {
      if (isInvoiceSyncMessage(event.data)) {
        void sync();
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js');
      navigator.serviceWorker.addEventListener('message', onMessage);
    }
    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
    };
  }, [sync]);

  useEffect(() => {
    if (status === 'authenticated' && session?.accessToken && navigator.onLine) {
      void sync();
    }
  }, [session?.accessToken, status, sync]);

  async function saveSale(input: {
    customerId: string;
    inventoryBatchId: string;
    quantity: number;
    status: InvoiceStatus;
  }): Promise<void> {
    setMessage(null);
    try {
      await recordOfflineSale(input);
      setSnapshot(await readPosSnapshot());
      if (navigator.onLine) {
        await sync();
      } else {
        await registerInvoiceSync();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The sale could not be saved.');
      setSnapshot(await readPosSnapshot());
    }
  }

  const pendingCount = snapshot.invoices.filter(
    (invoice) => invoice.syncStatus === 'PENDING' || invoice.syncStatus === 'SYNCING',
  ).length;
  const reviewCount = snapshot.invoices.filter((invoice) => invoice.needsReview).length;
  const conflictCount = snapshot.invoices.filter(
    (invoice) => invoice.syncStatus === 'CONFLICT',
  ).length;

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <SyncStatusIcon pendingCount={pendingCount} />
        <p className="text-md font-medium text-ink">Billing</p>
      </div>
      <div className="grid gap-3">
        <SyncStatusBanner
          online={online}
          syncing={syncing}
          pendingCount={pendingCount}
          reviewCount={reviewCount}
          conflictCount={conflictCount}
          lastSyncedAt={snapshot.lastSyncedAt}
          message={message}
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <OfflineSaleForm
            customers={snapshot.customers}
            batches={snapshot.batches}
            disabled={syncing}
            onSubmit={(input) => {
              void saveSale(input);
            }}
          />
          <LocalInvoiceList invoices={snapshot.invoices} />
        </div>
      </div>
    </div>
  );
}
