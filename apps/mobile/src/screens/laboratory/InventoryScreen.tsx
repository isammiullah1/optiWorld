import { useCallback, type ReactElement } from 'react';

import { DirectoryScreen } from '../shared/DirectoryScreen';
import { loadMobileLabInventory } from '../../services/mobile-directory';

export function InventoryScreen(): ReactElement {
  const load = useCallback(async () => {
    const items = await loadMobileLabInventory();
    return items.map((item) => ({
      id: item.id,
      title: item.name,
      detail: `${item.category} · ${item.quantity} ${item.unit}`,
      status: item.lowStock ? 'LOW_STOCK' : 'AVAILABLE',
    }));
  }, []);

  return (
    <DirectoryScreen
      emptyDescription="Lens blanks and materials you stock show up here."
      emptyTitle="No lab inventory"
      load={load}
      title="Inventory"
    />
  );
}
