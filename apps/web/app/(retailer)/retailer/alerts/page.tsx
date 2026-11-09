import type { AlertCategory } from '@optiworld/shared';

import { AlertsDashboard } from '@/components/retailer/AlertsDashboard';

const CATEGORIES = ['ALL', 'LOW_STOCK', 'PAYMENTS', 'LAB_JOBS', 'ORDERS', 'REVIEWS'] as const;

export default function AlertsPage({
  searchParams,
}: {
  searchParams: { category?: string | string[] };
}): React.ReactElement {
  const raw = searchParams.category;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const initialCategory: AlertCategory = CATEGORIES.find((category) => category === value) ?? 'ALL';
  return <AlertsDashboard initialCategory={initialCategory} />;
}
