import { prisma } from '@optiworld/db';
import type {
  AuthSessionUser,
  UpdateWholesalerListingProfileRequest,
  WholesalerListingProfile,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';

export async function getListingProfile(auth: AuthSessionUser): Promise<WholesalerListingProfile> {
  const orgId = requireWholesaler(auth);
  const org = await prisma.organisation.findFirst({
    where: { id: orgId, type: 'WHOLESALER', deletedAt: null },
    select: {
      id: true,
      username: true,
      name: true,
      city: true,
      phone: true,
      whatsappNumber: true,
      listingProfileNotes: true,
    },
  });
  if (!org) {
    throw new AppError(404, 'NOT_FOUND', 'This wholesaler could not be found');
  }
  return {
    id: org.id,
    username: org.username,
    businessName: org.name,
    city: org.city,
    phone: org.phone,
    whatsappNumber: org.whatsappNumber,
    listingProfileNotes: org.listingProfileNotes,
  };
}

export async function updateListingProfile(
  auth: AuthSessionUser,
  input: UpdateWholesalerListingProfileRequest,
): Promise<WholesalerListingProfile> {
  const orgId = requireWholesaler(auth);
  await prisma.$transaction(async (tx) => {
    await tx.organisation.update({
      where: { id: orgId },
      data: {
        name: input.businessName,
        city: input.city,
        phone: input.phone,
        whatsappNumber: emptyToNull(input.whatsappNumber),
        listingProfileNotes: emptyToNull(input.listingProfileNotes),
      },
    });
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'LISTING_PROFILE_UPDATED',
        entityType: 'Organisation',
        entityId: orgId,
        metadata: { city: input.city },
      },
    });
  });
  return getListingProfile(auth);
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

function requireWholesaler(auth: AuthSessionUser): string {
  if (auth.orgType !== 'WHOLESALER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This action is available to wholesalers');
  }
  return auth.orgId;
}
