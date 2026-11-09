import { LabJobDetail } from '@/components/retailer/LabJobDetail';

export default function LabJobPage({ params }: { params: { id: string } }): React.ReactElement {
  return <LabJobDetail jobId={params.id} />;
}
