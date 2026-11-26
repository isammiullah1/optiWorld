import { LocalReceipt } from '@/components/retailer/LocalReceipt';

export default function WholesalerLocalReceiptPage({
  params,
}: {
  params: { localId: string };
}): React.ReactElement {
  return <LocalReceipt localId={params.localId} />;
}
