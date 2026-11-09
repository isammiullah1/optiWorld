'use client';

import { Unlink } from 'lucide-react';

type DisconnectButtonProps = {
  onClick: () => void;
};

export function DisconnectButton({ onClick }: DisconnectButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-danger bg-danger-soft px-3 text-xs font-semibold text-danger hover:bg-danger hover:text-white"
      onClick={onClick}
    >
      <Unlink size={14} aria-hidden="true" />
      Disconnect
    </button>
  );
}
