'use client';

import type { AdminHealth } from '@optiworld/shared';
import { useCallback, useEffect, useState } from 'react';

import { AdminRequestError, loadHealth } from './admin-api';
import { formatWhen } from './format';
import { ErrorCard, SkeletonRows } from './ui';
import { useAdminToken } from './use-admin-token';

export function PlatformHealth(): React.ReactElement {
  const { token, ready } = useAdminToken();
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }
    setError(null);
    try {
      setHealth(await loadHealth(token));
    } catch (caught) {
      setError(
        caught instanceof AdminRequestError ? caught.message : 'Something went wrong. Try again.',
      );
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready || (!health && !error)) {
    return <SkeletonRows />;
  }
  if (error || !health) {
    return (
      <ErrorCard
        message={error ?? 'Something went wrong. Try again.'}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HealthCard
          title="Database"
          status={health.database.status}
          detail={health.database.detail}
        />
        <HealthCard title="Redis" status={health.redis.status} detail={health.redis.detail} />
        <HealthCard
          title="WhatsApp API"
          status={health.whatsapp.status}
          detail={health.whatsapp.detail}
        />
        <HealthCard
          title="Socket.io"
          status={health.socket.status}
          detail={`${health.socket.detail}. ${health.socket.connections} active connections.`}
        />
      </section>
      <section className="rounded-xl border border-line bg-white p-4">
        <h2 className="text-lg font-semibold text-ink">Recent errors</h2>
        {health.errors.length === 0 ? (
          <p className="mt-3 text-sm text-ink2">No recent errors.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {health.errors.map((entry) => (
              <li key={`${entry.at}-${entry.message}`} className="py-2">
                <p className="text-xs text-ink3">{formatWhen(entry.at)}</p>
                <p className="text-sm text-ink">{entry.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function HealthCard({
  title,
  status,
  detail,
}: {
  title: string;
  status: 'UP' | 'DEGRADED' | 'DOWN';
  detail: string;
}): React.ReactElement {
  const tone = status === 'UP' ? 'bg-teal' : status === 'DEGRADED' ? 'bg-amber' : 'bg-danger';
  const label =
    status === 'UP' ? 'Operational' : status === 'DEGRADED' ? 'Needs attention' : 'Down';
  return (
    <article className="rounded-xl border border-line bg-white p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${tone}`} aria-hidden="true" />
        <h2 className="text-md font-semibold text-ink">{title}</h2>
      </div>
      <p className="mt-2 text-sm font-medium text-ink">{label}</p>
      <p className="mt-1 text-sm text-ink2">{detail}</p>
    </article>
  );
}
