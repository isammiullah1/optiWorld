import type { RetailerFeature } from '@optiworld/shared';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  BookOpen,
  ClipboardList,
  Clock,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Package,
  Receipt,
  ScrollText,
  Store,
  Truck,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type RetailerBadgeKey = 'pending' | 'jobs' | 'alerts' | 'labs';

export type RetailerNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: RetailerBadgeKey;
  ownerOnly?: boolean;
  feature?: RetailerFeature;
};

export const RETAILER_SECTIONS: readonly {
  label: string;
  items: readonly RetailerNavItem[];
}[] = [
  {
    label: 'Operations',
    items: [
      { href: '/retailer/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      {
        href: '/retailer/billing/new',
        label: 'POS Billing',
        icon: Receipt,
        badge: 'pending',
        feature: 'billing',
      },
      { href: '/retailer/reports/sales', label: 'Sales', icon: BarChart3, feature: 'reports' },
      { href: '/retailer/customers', label: 'Customers', icon: Users, feature: 'customers' },
      { href: '/retailer/inventory', label: 'Inventory', icon: Package, feature: 'inventory' },
      {
        href: '/retailer/reports/inventory',
        label: 'Inventory Movement',
        icon: ArrowLeftRight,
        ownerOnly: true,
      },
      { href: '/retailer/bill-pad', label: 'Bill pad', icon: ScrollText, feature: 'billPad' },
      { href: '/retailer/ledger', label: 'Ledger', icon: BookOpen, ownerOnly: true },
    ],
  },
  {
    label: 'Connected',
    items: [
      { href: '/retailer/wholesalers', label: 'Wholesalers', icon: Store, feature: 'wholesalers' },
      { href: '/retailer/orders', label: 'Orders', icon: ClipboardList, feature: 'orders' },
      {
        href: '/retailer/laboratories',
        label: 'Laboratories',
        icon: FlaskConical,
        badge: 'labs',
        feature: 'laboratories',
      },
      {
        href: '/retailer/lab-jobs',
        label: 'Lab jobs',
        icon: ListChecks,
        badge: 'jobs',
        feature: 'labJobs',
      },
      { href: '/retailer/deliveries', label: 'Deliveries', icon: Truck, feature: 'labJobs' },
      { href: '/retailer/alerts', label: 'Alerts', icon: Bell, badge: 'alerts', feature: 'alerts' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { href: '/retailer/reports/aging', label: 'Aging Report', icon: Clock, ownerOnly: true },
    ],
  },
  {
    label: 'Account',
    items: [{ href: '/retailer/profile', label: 'Profile', icon: UserRound }],
  },
];

const TAB_PREFIXES = [
  '/retailer/dashboard',
  '/retailer/billing',
  '/retailer/customers',
  '/retailer/inventory',
] as const;

export function canSeeRetailerNav(
  item: RetailerNavItem,
  role: string,
  features: readonly RetailerFeature[] | null,
): boolean {
  if (item.ownerOnly && role !== 'OWNER') {
    return false;
  }
  if (!item.feature || role === 'OWNER') {
    return true;
  }
  if (features === null) {
    return false;
  }
  return features.includes(item.feature);
}

export function isRetailerNavActive(pathname: string, href: string): boolean {
  if (href === '/retailer/dashboard') {
    return pathname === href;
  }
  if (href.startsWith('/retailer/billing')) {
    return pathname.startsWith('/retailer/billing');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isMoreTabActive(pathname: string): boolean {
  return !TAB_PREFIXES.some((prefix) => {
    const href = prefix === '/retailer/billing' ? '/retailer/billing/new' : prefix;
    return isRetailerNavActive(pathname, href);
  });
}

export function retailerPageTitle(pathname: string): string {
  if (pathname.includes('/receipt')) {
    return 'Receipt';
  }
  if (/^\/retailer\/customers\/[^/]+$/.test(pathname)) {
    return 'Customer';
  }
  if (/^\/retailer\/inventory\/[^/]+$/.test(pathname)) {
    return 'Batch';
  }
  if (/^\/retailer\/wholesalers\/[^/]+\/catalog$/.test(pathname)) {
    return 'Catalog';
  }
  if (/^\/retailer\/orders\/[^/]+$/.test(pathname)) {
    return 'Order';
  }
  if (/^\/retailer\/lab-jobs\/[^/]+$/.test(pathname)) {
    return 'Lab job';
  }
  if (/^\/retailer\/billing\/(?!new$)[^/]+$/.test(pathname)) {
    return 'Invoice';
  }
  const match = RETAILER_SECTIONS.flatMap((section) => [...section.items]).find((item) =>
    isRetailerNavActive(pathname, item.href),
  );
  if (match) {
    return match.label;
  }
  if (pathname.startsWith('/retailer/settings')) {
    return 'Settings';
  }
  if (pathname.startsWith('/retailer/profile')) {
    return 'Profile';
  }
  return 'Retailer';
}

export function roleLabel(role: string): string {
  if (role === 'OWNER') {
    return 'Owner';
  }
  if (role === 'STAFF') {
    return 'Staff';
  }
  return role;
}

export function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return '?';
  }
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
