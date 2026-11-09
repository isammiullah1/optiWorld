import { useCallback, type ReactElement } from 'react';

import { DirectoryScreen } from '../shared/DirectoryScreen';
import { loadWholesalerCatalog } from '../../services/mobile-directory';

export function CatalogListScreen(): ReactElement {
  const load = useCallback(async () => {
    const products = await loadWholesalerCatalog();
    return products.map((product) => ({
      id: product.id,
      title: product.name,
      detail: `${product.category} · ${product.productCode}${product.listedPrice ? ` · ₨ ${product.listedPrice}` : ' · On request'}`,
      status: product.availabilityStatus,
    }));
  }, []);

  return (
    <DirectoryScreen
      emptyDescription="Products you add on the web catalog show up here."
      emptyTitle="Catalog is empty"
      load={load}
      title="Catalog"
    />
  );
}
