import { LabClientProfile } from '@/components/laboratory/LabClientProfile';

export default function LaboratoryClientProfilePage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  return <LabClientProfile clientId={params.id} />;
}
