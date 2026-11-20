import { WholesalerNotifications } from '@/components/wholesaler/WholesalerNotifications';

export default function WholesalerNotificationsPage({
  searchParams,
}: {
  searchParams?: { category?: string };
}): React.ReactElement {
  return <WholesalerNotifications category={searchParams?.category} />;
}
