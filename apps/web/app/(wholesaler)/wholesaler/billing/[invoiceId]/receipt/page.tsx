import { ServerReceipt } from '@/components/retailer/ServerReceipt';

export default function WholesalerReceiptPage({
  params,
}: {
  params: { invoiceId: string };
}): React.ReactElement {
  return <ServerReceipt invoiceId={params.invoiceId} />;
}
