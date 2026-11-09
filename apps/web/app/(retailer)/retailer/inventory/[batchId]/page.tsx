import { BatchDetail } from '@/components/retailer/BatchDetail';

export default function InventoryBatchPage({
  params,
}: {
  params: { batchId: string };
}): React.ReactElement {
  return <BatchDetail batchId={params.batchId} />;
}
