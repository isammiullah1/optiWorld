import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  SlidersHorizontal,
  Store,
  Tags,
  Users,
} from 'lucide-react';

export type WholesalerNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section: 'Overview' | 'Catalog' | 'Insights';
  badge?: 'pending';
};

export const WHOLESALER_NAV = [
  { href: '/wholesaler/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Overview' },
  {
    href: '/wholesaler/orders',
    label: 'Orders',
    icon: ClipboardList,
    section: 'Overview',
    badge: 'pending',
  },
  { href: '/wholesaler/catalog', label: 'Catalog', icon: Tags, section: 'Catalog' },
  { href: '/wholesaler/retailers', label: 'Retailers', icon: Users, section: 'Catalog' },
  {
    href: '/wholesaler/price-control',
    label: 'Price Control',
    icon: SlidersHorizontal,
    section: 'Catalog',
  },
  { href: '/wholesaler/reports', label: 'Reports', icon: BarChart3, section: 'Insights' },
  { href: '/wholesaler/profile', label: 'Profile', icon: Store, section: 'Insights' },
] as const satisfies readonly WholesalerNavItem[];

export const WHOLESALER_SECTIONS = ['Overview', 'Catalog', 'Insights'] as const;

export function isWholesalerNavActive(pathname: string, href: string): boolean {
  if (href === '/wholesaler/dashboard') {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function wholesalerPageTitle(pathname: string): string {
  if (pathname.startsWith('/wholesaler/orders/')) {
    return 'Order';
  }
  const match = WHOLESALER_NAV.find((item) => isWholesalerNavActive(pathname, item.href));
  return match?.label ?? 'Wholesaler';
}

export function roleLabel(role: string): string {
  if (role === 'ADMIN') {
    return 'Admin';
  }
  if (role === 'ORDER_HANDLER') {
    return 'Order handler';
  }
  return role;
}
