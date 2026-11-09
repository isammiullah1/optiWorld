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
