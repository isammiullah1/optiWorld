import { Suspense } from 'react';

import { LabJobsList } from '@/components/retailer/LabJobsList';

export default function LabJobsPage(): React.ReactElement {
  return (
    <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-white" />}>
      <LabJobsList />
    </Suspense>
  );
}
