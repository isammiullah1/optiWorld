import { JobKanban } from '@/components/laboratory/JobKanban';

export default function LaboratoryJobsPage({
  searchParams,
}: {
  searchParams?: { clientId?: string; job?: string };
}): React.ReactElement {
  const clientId = typeof searchParams?.clientId === 'string' ? searchParams.clientId : undefined;
  const jobId = typeof searchParams?.job === 'string' ? searchParams.job : undefined;
  return <JobKanban initialClientId={clientId} initialJobId={jobId} />;
}
