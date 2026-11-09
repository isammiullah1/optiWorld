import { WholesalerCatalogView } from '@/components/retailer/WholesalerCatalog';

export default function WholesalerCatalogPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  return <WholesalerCatalogView wholesalerId={params.id} />;
}
