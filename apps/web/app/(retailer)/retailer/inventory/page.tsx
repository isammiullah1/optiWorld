import { InventoryList } from '@/components/retailer/InventoryList';
import { InventoryReport } from '@/components/retailer/InventoryReport';

export default function InventoryPage(): React.ReactElement {
  return (
    <div className="grid gap-8">
      <InventoryList />
      <InventoryReport embedded />
    </div>
  );
}
