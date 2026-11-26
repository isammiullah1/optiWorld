import { BatchDetail } from '@/components/retailer/BatchDetail';

export default function WholesalerInventoryBatchPage({
  params,
}: {
  params: { batchId: string };
}): React.ReactElement {
  return <BatchDetail batchId={params.batchId} />;
}
