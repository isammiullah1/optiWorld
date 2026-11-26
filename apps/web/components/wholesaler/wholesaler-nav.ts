import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  BarChart3,
  Bell,
  BookOpen,
  ClipboardList,
  Contact,
  LayoutDashboard,
  Package,
  Receipt,
  ScrollText,
  SlidersHorizontal,
  Store,
  Tags,
  Users,
} from 'lucide-react';

export type WholesalerNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  section: 'Overview' | 'Shop' | 'Catalog' | 'Insights';
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
  { href: '/wholesaler/notifications', label: 'Notifications', icon: Bell, section: 'Overview' },
  { href: '/wholesaler/billing/new', label: 'POS', icon: Receipt, section: 'Shop' },
  { href: '/wholesaler/sales', label: 'Sales', icon: Banknote, section: 'Shop' },
  { href: '/wholesaler/ledger', label: 'Ledger', icon: BookOpen, section: 'Shop' },
  { href: '/wholesaler/inventory', label: 'Inventory', icon: Package, section: 'Shop' },
  { href: '/wholesaler/customers', label: 'Customers', icon: Contact, section: 'Shop' },
  { href: '/wholesaler/bill-pad', label: 'Bill pad', icon: ScrollText, section: 'Shop' },
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

export const WHOLESALER_SECTIONS = ['Overview', 'Shop', 'Catalog', 'Insights'] as const;

export function isWholesalerNavActive(pathname: string, href: string): boolean {
  if (href === '/wholesaler/billing/new') {
    return pathname.startsWith('/wholesaler/billing');
  }
  if (href === '/wholesaler/dashboard') {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function wholesalerPageTitle(pathname: string): string {
  if (pathname.startsWith('/wholesaler/orders/')) {
    return 'Order';
  }
  if (pathname.startsWith('/wholesaler/billing/new')) {
    return 'POS';
  }
  if (pathname.includes('/receipt')) {
    return 'Receipt';
  }
  if (pathname.startsWith('/wholesaler/billing/')) {
    return 'Bill';
  }
  if (pathname.startsWith('/wholesaler/inventory/')) {
    return 'Stock item';
  }
  if (pathname.startsWith('/wholesaler/customers/')) {
    return 'Customer';
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
