type SyncStatusBannerProps = {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  reviewCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
  message: string | null;
};

export function SyncStatusBanner({
  online,
  syncing,
  pendingCount,
  reviewCount,
  conflictCount,
  lastSyncedAt,
  message,
}: SyncStatusBannerProps): React.ReactElement {
  const tone =
    !online || pendingCount > 0
      ? 'border-amber bg-amber-soft text-amber'
      : 'border-teal bg-teal-soft text-teal';
  const label = syncing
    ? `Back online — syncing ${pendingCount} invoices...`
    : online
      ? 'Online'
      : `Offline — invoices saving locally | ${pendingCount} pending sync`;

  return (
    <section className={`rounded-xl border px-4 py-3 ${tone}`} role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-md font-medium">{label}</p>
        <StatusPill label={`${pendingCount} waiting`} />
        <StatusPill label={`${reviewCount} to review`} />
        {conflictCount > 0 ? <StatusPill label={`${conflictCount} need attention`} /> : null}
      </div>
      <p className="mt-2 text-sm text-ink2">
        {online
          ? 'Sales recorded here sync when the connection is available.'
          : `Offline — invoices saving locally | ${pendingCount} pending sync`}
      </p>
      <p className="mt-1 text-xs text-ink3">
        {lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : 'Not synced yet'}
      </p>
      {message ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function StatusPill({ label }: { label: string }): React.ReactElement {
  return <span className="rounded-full bg-white px-2 py-1 text-xs text-ink2">{label}</span>;
}
