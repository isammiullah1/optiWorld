type OfflineBannerProps = {
  online: boolean;
  pendingCount: number;
  syncingLabel: string | null;
};

export function OfflineBanner({
  online,
  pendingCount,
  syncingLabel,
}: OfflineBannerProps): React.ReactElement | null {
  if (syncingLabel) {
    return (
      <p
        className="bg-amber-soft px-5 py-2 text-sm text-amber print:hidden"
        role="status"
        aria-live="polite"
      >
        {syncingLabel}
      </p>
    );
  }
  if (online) {
    return null;
  }
  return (
    <p
      className="bg-amber-soft px-5 py-2 text-sm text-amber print:hidden"
      role="status"
      aria-live="polite"
    >
      Offline — invoices saving locally · {pendingCount} pending sync
    </p>
  );
}
