import type { AuthSessionUser } from '@optiworld/shared';

import { AppError } from './errors.js';

export function requiredShopOrgId(auth: AuthSessionUser): string {
  if (!auth.orgId || (auth.orgType !== 'RETAILER' && auth.orgType !== 'WHOLESALER')) {
    throw new AppError(403, 'FORBIDDEN', 'This action is available to a shop account');
  }
  return auth.orgId;
}

export function isShopOwner(auth: AuthSessionUser): boolean {
  if (auth.role === 'OWNER') {
    return true;
  }
  return auth.orgType === 'WHOLESALER' && auth.role === 'ADMIN';
}
