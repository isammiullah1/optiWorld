import { Suspense } from 'react';

import { OrganisationDetail } from '@/components/admin/OrganisationDetail';

export default function OrganisationPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  return (
    <Suspense fallback={<div className="h-10 animate-pulse rounded-lg bg-line" />}>
      <OrganisationDetail orgId={params.id} />
    </Suspense>
  );
}
