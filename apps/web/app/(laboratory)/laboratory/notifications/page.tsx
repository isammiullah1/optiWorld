import { LabNotifications } from '@/components/laboratory/LabNotifications';

export default function LaboratoryNotificationsPage({
  searchParams,
}: {
  searchParams?: { category?: string };
}): React.ReactElement {
  return <LabNotifications category={searchParams?.category} />;
}
