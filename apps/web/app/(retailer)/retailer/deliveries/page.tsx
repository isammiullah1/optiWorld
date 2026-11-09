import { Suspense } from 'react';

import { DeliveriesList } from '@/components/retailer/DeliveriesList';

export default function DeliveriesPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-white" />}>
      <DeliveriesList />
    </Suspense>
  );
}
