'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import type { PosReceipt } from '@optiworld/shared';

import { loadPosReceipt, sendPosReceipt } from './pos-api';
import { ReceiptView } from './ReceiptView';

export function ServerReceipt({ invoiceId }: { invoiceId: string }): React.ReactElement {
  const { data: session } = useSession();
  const [receipt, setReceipt] = useState<PosReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    void loadPosReceipt(token, invoiceId)
      .then(setReceipt)
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'The receipt could not be loaded.');
      });
  }, [invoiceId, session?.accessToken]);

  if (error) {
    return (
      <p className="rounded-xl border border-line bg-white p-4 text-sm text-danger" role="alert">
        {error}
      </p>
    );
  }
  if (!receipt) {
    return <div className="h-40 animate-pulse rounded-xl border border-line bg-white" />;
  }

  return (
    <ReceiptView
      receipt={receipt}
      pending={false}
      notice={notice}
      sending={sending}
      onPrint={() => window.print()}
      onWhatsApp={() => {
        const token = session?.accessToken;
        if (!token) {
          return;
        }
        setSending(true);
        void sendPosReceipt(token, invoiceId)
          .then((result) => setNotice(result.message))
          .catch((reason: unknown) => {
            setNotice(
              reason instanceof Error ? reason.message : 'WhatsApp could not send the receipt.',
            );
          })
          .finally(() => setSending(false));
      }}
    />
  );
}
