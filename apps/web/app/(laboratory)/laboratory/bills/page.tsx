import { LabBills } from '@/components/laboratory/LabBills';

export default function LaboratoryBillsPage({
  searchParams,
}: {
  searchParams?: { clientId?: string };
}): React.ReactElement {
  const labClientId =
    typeof searchParams?.clientId === 'string' ? searchParams.clientId : undefined;
  return <LabBills labClientId={labClientId} />;
}
