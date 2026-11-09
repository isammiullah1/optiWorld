import { RetailerOrderDetailView } from '@/components/retailer/RetailerOrderDetail';

export default function RetailerOrderPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  return <RetailerOrderDetailView orderId={params.id} />;
}
