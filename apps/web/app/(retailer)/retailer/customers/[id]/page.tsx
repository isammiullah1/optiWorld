import { CustomerProfile } from '@/components/retailer/CustomerProfile';

export default function CustomerProfilePage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  return <CustomerProfile customerId={params.id} />;
}
