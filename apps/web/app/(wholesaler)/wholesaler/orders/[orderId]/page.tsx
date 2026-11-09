import { WholesalerOrderDetail } from '@/components/wholesaler/WholesalerOrderDetail';

type OrderPageProps = {
  params: { orderId: string };
};

export default function WholesalerOrderPage({ params }: OrderPageProps): React.ReactElement {
  return <WholesalerOrderDetail orderId={params.orderId} />;
}
