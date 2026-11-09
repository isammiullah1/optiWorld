import { useCallback, type ReactElement } from 'react';

import { DirectoryScreen } from '../shared/DirectoryScreen';
import { readLocalCatalog } from '../../services/pos-sync';

export function InventoryScreen(): ReactElement {
  const load = useCallback(async () => {
    const catalog = await readLocalCatalog();
    return catalog.batches.map((batch) => ({
      id: batch.id,
      title: batch.productName,
      detail: `${batch.priceCode} · ${batch.stockQty} in stock`,
      status:
        batch.stockQty === 0
          ? 'OUT_OF_STOCK'
          : batch.stockQty <= batch.lowStockThreshold
            ? 'LOW_STOCK'
            : 'AVAILABLE',
    }));
  }, []);

  return (
    <DirectoryScreen
      emptyDescription="Products appear here after the shop syncs."
      emptyTitle="No inventory yet"
      load={load}
      title="Inventory"
    />
  );
}
