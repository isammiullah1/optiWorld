import { Suspense } from 'react';

import { PosBilling } from '@/components/retailer/PosBilling';

export default function NewInvoicePage(): React.ReactElement {
  return (
    <Suspense
      fallback={<div className="h-40 animate-pulse rounded-xl border border-line bg-white" />}
    >
      <PosBilling />
    </Suspense>
  );
}
