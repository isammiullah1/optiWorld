import type { AuthSessionUser } from '../types/index.js';

const DASHBOARD_PATH = {
  RETAILER: '/retailer/dashboard',
  WHOLESALER: '/wholesaler/dashboard',
  LABORATORY: '/laboratory/dashboard',
} as const;

export function dashboardPathForSession(user: Pick<AuthSessionUser, 'role' | 'orgType'>): string {
  if (user.role === 'SUPER_ADMIN' || user.orgType === null) {
    return '/admin/dashboard';
  }

  return DASHBOARD_PATH[user.orgType];
}

const SALE_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Karachi',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function isSameSaleDay(issuedAt: Date, now: Date = new Date()): boolean {
  return SALE_DAY.format(issuedAt) === SALE_DAY.format(now);
}

export function routePrefixForOrgType(orgType: AuthSessionUser['orgType']): string | null {
  if (orgType === null) {
    return '/admin';
  }

  switch (orgType) {
    case 'RETAILER':
      return '/retailer';
    case 'WHOLESALER':
      return '/wholesaler';
    case 'LABORATORY':
      return '/laboratory';
  }
}
