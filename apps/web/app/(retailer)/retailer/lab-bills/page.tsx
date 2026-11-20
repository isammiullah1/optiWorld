import { LabBills } from '@/components/retailer/LabBills';

export default function RetailerLabBillsPage({
  searchParams,
}: {
  searchParams?: { lab?: string };
}): React.ReactElement {
  const labOrgId = typeof searchParams?.lab === 'string' ? searchParams.lab : undefined;
  return <LabBills labOrgId={labOrgId} />;
}
