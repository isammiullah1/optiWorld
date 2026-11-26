type ShopScope = 'retailer' | 'wholesaler';

let scope: ShopScope = 'retailer';

export function useShopScope(next: ShopScope): void {
  scope = next;
}

export function shopScope(): ShopScope {
  return scope;
}

export function isShopOwnerRole(role: string | undefined): boolean {
  if (role === 'OWNER') {
    return true;
  }
  return scope === 'wholesaler' && role === 'ADMIN';
}

export function shopApiPath(path: string): string {
  if (scope === 'wholesaler' && path.startsWith('/api/v1/retailer')) {
    return `/api/v1/wholesaler/counter${path.slice('/api/v1/retailer'.length)}`;
  }
  return path;
}

export function shopPagePath(path: string): string {
  if (scope !== 'wholesaler') {
    return path;
  }
  if (path.startsWith('/retailer/reports/sales')) {
    return `/wholesaler/sales${path.slice('/retailer/reports/sales'.length)}`;
  }
  if (
    path.startsWith('/retailer/inventory') ||
    path.startsWith('/retailer/billing') ||
    path.startsWith('/retailer/customers')
  ) {
    return `/wholesaler${path.slice('/retailer'.length)}`;
  }
  return path;
}
