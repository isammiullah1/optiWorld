'use client';

import type { RetailerAlert, RetailerFeature } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { Suspense, useEffect, useState } from 'react';

import { AlertsPanel } from './AlertsPanel';
import { ALERTS_CHANGED_EVENT } from './alerts-api';
import { loadDashboardAlerts } from './dashboard-api';
import { firstName, greeting } from './dashboard-format';
import { PosBilling } from './PosBilling';
import { loadRetailerProfile } from './retailer-account-api';

export function RetailerDashboard({ userName }: { userName: string }): React.ReactElement {
  const { data: session } = useSession();
  const [alerts, setAlerts] = useState<RetailerAlert[] | null>(null);
  const [features, setFeatures] = useState<RetailerFeature[] | null>(null);
  const [alertTick, setAlertTick] = useState(0);
  const isOwner = session?.user.role === 'OWNER';
  const canBill = isOwner || features?.includes('billing') === true;

  useEffect(() => {
    const refresh = (): void => setAlertTick((current) => current + 1);
    window.addEventListener(ALERTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(ALERTS_CHANGED_EVENT, refresh);
  }, []);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    let active = true;
    void loadRetailerProfile(token)
      .then((profile) => {
        if (active) {
          setFeatures(profile.features);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [session?.accessToken]);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    let active = true;
    void loadDashboardAlerts(token)
      .then((next) => {
        if (active) {
          setAlerts(next);
        }
      })
      .catch(() => {
        if (active) {
          setAlerts([]);
        }
      });
    return () => {
      active = false;
    };
  }, [session?.accessToken, alertTick]);

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-4">
      <div className="min-w-0">
        <p className="text-sm text-ink2">
          {greeting(new Date())}, {firstName(userName)}
        </p>
        <h2 className="text-lg font-semibold text-ink">New bill</h2>
        <p className="text-sm text-ink2">
          Search a product, choose the customer, and complete the sale.
        </p>
      </div>
      {canBill ? (
        <Suspense
          fallback={
            <div
              className="h-96 animate-pulse rounded-2xl border border-line bg-white"
              aria-busy="true"
            />
          }
        >
          <PosBilling />
        </Suspense>
      ) : features === null && !isOwner ? (
        <div
          className="h-96 animate-pulse rounded-2xl border border-line bg-white"
          aria-busy="true"
        />
      ) : (
        <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink2">
          Billing is not included on this account.
        </p>
      )}
      {alerts ? (
        <AlertsPanel alerts={alerts} />
      ) : (
        <div
          className="h-24 animate-pulse rounded-xl border border-line bg-white"
          aria-busy="true"
        />
      )}
    </div>
  );
}
