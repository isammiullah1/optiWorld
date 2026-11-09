import { WholesalerOrders } from '@/components/wholesaler/WholesalerOrders';

type OrdersPageProps = {
  searchParams: { status?: string };
};

export default function WholesalerOrdersPage({
  searchParams,
}: OrdersPageProps): React.ReactElement {
  return <WholesalerOrders initialStatus={searchParams.status} />;
}
