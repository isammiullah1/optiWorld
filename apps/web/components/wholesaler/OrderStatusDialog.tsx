'use client';

type OrderStatusDialogProps = {
  label: 'dispatched' | 'delivered';
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function OrderStatusDialog({
  label,
  busy,
  onCancel,
  onConfirm,
}: OrderStatusDialogProps): React.ReactElement {
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-t-xl border border-line bg-white p-4 sm:rounded-xl">
        <h2 className="text-lg font-semibold text-ink">Mark as {label}</h2>
        <p className="mt-1 text-sm text-ink2">
          This updates the order and sends a WhatsApp notification to the retailer.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink2"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Updating' : `Mark ${label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
