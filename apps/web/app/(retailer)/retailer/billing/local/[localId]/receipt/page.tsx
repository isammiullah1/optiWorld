import { LocalReceipt } from '@/components/retailer/LocalReceipt';

export default function LocalReceiptPage({
  params,
}: {
  params: { localId: string };
}): React.ReactElement {
  return <LocalReceipt localId={params.localId} />;
}
