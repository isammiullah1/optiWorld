type SyncStatusIconProps = {
  pendingCount: number;
};

export function SyncStatusIcon({ pendingCount }: SyncStatusIconProps): React.ReactElement {
  return (
    <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-xs font-medium text-white">
      POS
      {pendingCount > 0 ? (
        <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-action px-1 text-center text-xs leading-4 text-white">
          {pendingCount}
        </span>
      ) : null}
    </span>
  );
}
