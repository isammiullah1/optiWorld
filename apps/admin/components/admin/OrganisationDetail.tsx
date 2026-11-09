'use client';

import type { AdminOrgDetail } from '@optiworld/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { AdminRequestError, loadOrganisation } from './admin-api';
import { OrgActivity } from './OrgActivity';
import { OrgOverview } from './OrgOverview';
import { OrgSubscriptionPanel } from './OrgSubscriptionPanel';
import { OrgUsersPanel } from './OrgUsersPanel';
import { ErrorCard, SkeletonRows, StatusBadge, TypeBadge } from './ui';
import { useAdminToken } from './use-admin-token';

const TABS = ['Overview', 'Users', 'Subscription', 'Activity'] as const;
type Tab = (typeof TABS)[number];

export function OrganisationDetail({ orgId }: { orgId: string }): React.ReactElement {
  const { token, ready } = useAdminToken();
  const created = useSearchParams().get('created');
  const [org, setOrg] = useState<AdminOrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Overview');

  const load = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    setError(null);
    try {
      setOrg(await loadOrganisation(token, orgId));
    } catch (caught) {
      setError(
        caught instanceof AdminRequestError ? caught.message : 'Something went wrong. Try again.',
      );
    }
  }, [orgId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready || (!org && !error)) {
    return <SkeletonRows />;
  }
  if (error || !org || !token) {
    return (
      <ErrorCard
        message={error ?? 'Something went wrong. Try again.'}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Link href="/organisations" className="text-sm text-purp">
        All organisations
      </Link>
      {created ? (
        <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink2">{created}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold text-ink">{org.name}</h2>
        <TypeBadge type={org.type} />
        <StatusBadge status={org.status} />
      </div>
      <div className="flex gap-2" role="tablist" aria-label="Organisation">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={`min-h-11 rounded-lg px-3 py-2 text-sm ${tab === item ? 'bg-purp text-white' : 'bg-white text-ink2'}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === 'Overview' ? <OrgOverview token={token} org={org} onSaved={setOrg} /> : null}
      {tab === 'Users' ? (
        <OrgUsersPanel token={token} org={org} onChanged={() => void load()} />
      ) : null}
      {tab === 'Subscription' ? (
        <OrgSubscriptionPanel token={token} org={org} onSaved={setOrg} />
      ) : null}
      {tab === 'Activity' ? <OrgActivity org={org} /> : null}
    </div>
  );
}
