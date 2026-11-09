import { prisma } from '@optiworld/db';
import type { AuthSessionUser, RetailerSettings } from '@optiworld/shared';

import { decodeBillLogo, deleteBillLogo, writeBillLogo } from '../lib/bill-logo-store.js';
import { AppError } from '../lib/errors.js';
import { getRetailerSettings } from './inventory.service.js';

export async function saveBillLogo(
  auth: AuthSessionUser,
  image: string,
): Promise<RetailerSettings> {
  const orgId = requiredRetailerOrgId(auth);
  const current = await prisma.organisation.findFirst({
    where: { id: orgId, deletedAt: null },
    select: { billLogoKey: true },
  });
  if (!current) {
    throw new AppError(404, 'NOT_FOUND', 'This shop was not found');
  }
  const decoded = decodeBillLogo(image);
  const key = await writeBillLogo(decoded);
  try {
    await prisma.organisation.update({
      where: { id: orgId },
      data: { billLogoKey: key },
    });
  } catch (error) {
    await deleteBillLogo(key);
    throw error;
  }
  await deleteBillLogo(current.billLogoKey);
  return getRetailerSettings(auth);
}

export async function clearBillLogo(auth: AuthSessionUser): Promise<RetailerSettings> {
  const orgId = requiredRetailerOrgId(auth);
  const current = await prisma.organisation.findFirst({
    where: { id: orgId, deletedAt: null },
    select: { billLogoKey: true },
  });
  if (!current) {
    throw new AppError(404, 'NOT_FOUND', 'This shop was not found');
  }
  await prisma.organisation.update({
    where: { id: orgId },
    data: { billLogoKey: null },
  });
  await deleteBillLogo(current.billLogoKey);
  return getRetailerSettings(auth);
}

function requiredRetailerOrgId(auth: AuthSessionUser): string {
  if (!auth.orgId || auth.orgType !== 'RETAILER') {
    throw new AppError(403, 'FORBIDDEN', 'This action is only available to a retailer');
  }
  return auth.orgId;
}
