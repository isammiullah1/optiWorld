import { prisma } from '@optiworld/db';
import type {
  AuthSessionUser,
  CreateRetailerStaffRequest,
  RetailerFeature,
  RetailerSessionProfile,
  RetailerStaffMember,
  UpdateRetailerAccountRequest,
  UpdateRetailerShopProfileRequest,
  UpdateRetailerStaffRequest,
} from '@optiworld/shared';
import { resolveRetailerFeatures } from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  featureAccess: true,
} as const;

export async function getRetailerSessionProfile(
  auth: AuthSessionUser,
): Promise<RetailerSessionProfile> {
  const orgId = requireRetailer(auth);
  const [org, user] = await Promise.all([
    prisma.organisation.findFirst({
      where: { id: orgId, type: 'RETAILER', deletedAt: null },
      select: {
        id: true,
        name: true,
        username: true,
        phone: true,
        city: true,
        address: true,
        whatsappNumber: true,
        listingProfileNotes: true,
      },
    }),
    prisma.user.findFirst({
      where: { id: auth.userId, orgId, isActive: true },
      select: { id: true, name: true, email: true, phone: true, role: true, featureAccess: true },
    }),
  ]);
  if (!org || !user) {
    throw new AppError(404, 'NOT_FOUND', 'This shop account could not be found');
  }
  return {
    shop: {
      id: org.id,
      name: org.name,
      username: org.username,
      phone: org.phone,
      city: org.city,
      address: org.address,
      whatsappNumber: org.whatsappNumber,
      about: org.listingProfileNotes,
    },
    account: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role === 'OWNER' ? 'OWNER' : 'STAFF',
    },
    features: resolveRetailerFeatures(user.role, user.featureAccess),
  };
}

export async function updateRetailerShopProfile(
  auth: AuthSessionUser,
  input: UpdateRetailerShopProfileRequest,
): Promise<RetailerSessionProfile> {
  const orgId = requireRetailer(auth);
  requireOwner(auth);
  await prisma.$transaction(async (tx) => {
    await tx.organisation.update({
      where: { id: orgId },
      data: {
        name: input.name,
        phone: input.phone,
        city: input.city,
        address: emptyToNull(input.address),
        whatsappNumber: emptyToNull(input.whatsappNumber),
        listingProfileNotes: emptyToNull(input.about),
      },
    });
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'RETAILER_PROFILE_UPDATED',
        entityType: 'Organisation',
        entityId: orgId,
        metadata: { name: input.name },
      },
    });
  });
  return getRetailerSessionProfile(auth);
}

export async function updateRetailerAccount(
  auth: AuthSessionUser,
  input: UpdateRetailerAccountRequest,
): Promise<RetailerSessionProfile> {
  const orgId = requireRetailer(auth);
  const user = await prisma.user.findFirst({
    where: { id: auth.userId, orgId, isActive: true },
    select: { id: true, passwordHash: true },
  });
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'This account could not be found');
  }
  const nextPassword = input.newPassword?.trim() ?? '';
  if (nextPassword.length > 0) {
    const matches = await verifyPassword(input.currentPassword ?? '', user.passwordHash);
    if (!matches) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The current password is incorrect');
    }
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: input.name,
      phone: emptyToNull(input.phone),
      ...(nextPassword.length > 0 ? { passwordHash: await hashPassword(nextPassword) } : {}),
    },
  });
  return getRetailerSessionProfile(auth);
}

export async function listRetailerStaff(auth: AuthSessionUser): Promise<RetailerStaffMember[]> {
  const orgId = requireRetailer(auth);
  requireOwner(auth);
  const users = await prisma.user.findMany({
    where: { orgId },
    select: userSelect,
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  return users.map(toStaff);
}

export async function createRetailerStaff(
  auth: AuthSessionUser,
  input: CreateRetailerStaffRequest,
): Promise<RetailerStaffMember> {
  const orgId = requireRetailer(auth);
  requireOwner(auth);
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new AppError(422, 'VALIDATION_ERROR', 'That email is already in use');
  }
  const created = await prisma.user.create({
    data: {
      orgId,
      email,
      name: input.name,
      phone: emptyToNull(input.phone),
      passwordHash: await hashPassword(input.password),
      role: input.role,
      isActive: true,
      featureAccess: input.role === 'STAFF' ? input.features : undefined,
    },
    select: userSelect,
  });
  await prisma.auditLog.create({
    data: {
      orgId,
      userId: auth.userId,
      action: 'RETAILER_STAFF_CREATED',
      entityType: 'User',
      entityId: created.id,
      metadata: { role: created.role },
    },
  });
  return toStaff(created);
}

export async function updateRetailerStaff(
  auth: AuthSessionUser,
  userId: string,
  input: UpdateRetailerStaffRequest,
): Promise<RetailerStaffMember> {
  const orgId = requireRetailer(auth);
  requireOwner(auth);
  const existing = await prisma.user.findFirst({
    where: { id: userId, orgId },
    select: { id: true, role: true, isActive: true },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'That account could not be found');
  }
  if (existing.id === auth.userId && !input.isActive) {
    throw new AppError(422, 'VALIDATION_ERROR', 'You cannot deactivate your own account');
  }
  if (
    existing.role === 'OWNER' &&
    existing.isActive &&
    (input.role !== 'OWNER' || !input.isActive)
  ) {
    await assertAnotherOwner(orgId, existing.id);
  }
  const nextPassword = input.password?.trim() ?? '';
  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: input.name,
      phone: emptyToNull(input.phone),
      role: input.role,
      isActive: input.isActive,
      featureAccess: input.role === 'STAFF' ? input.features : undefined,
      ...(nextPassword.length > 0 ? { passwordHash: await hashPassword(nextPassword) } : {}),
    },
    select: userSelect,
  });
  await prisma.auditLog.create({
    data: {
      orgId,
      userId: auth.userId,
      action: 'RETAILER_STAFF_UPDATED',
      entityType: 'User',
      entityId: updated.id,
      metadata: { role: updated.role, isActive: updated.isActive },
    },
  });
  return toStaff(updated);
}

export async function deleteRetailerStaff(
  auth: AuthSessionUser,
  userId: string,
): Promise<{ id: string }> {
  const orgId = requireRetailer(auth);
  requireOwner(auth);
  const existing = await prisma.user.findFirst({
    where: { id: userId, orgId },
    select: { id: true, role: true, isActive: true, name: true },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'That account could not be found');
  }
  if (existing.id === auth.userId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'You cannot delete your own account');
  }
  if (existing.role === 'OWNER' && existing.isActive) {
    await assertAnotherOwner(orgId, existing.id);
  }
  const messages = await prisma.chatMessage.count({ where: { senderUserId: existing.id } });
  if (messages > 0) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'This account has sent order messages and cannot be deleted',
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'RETAILER_STAFF_DELETED',
        entityType: 'User',
        entityId: existing.id,
        metadata: { name: existing.name },
      },
    });
    await tx.user.delete({ where: { id: existing.id } });
  });
  return { id: existing.id };
}

export async function assertRetailerFeature(
  auth: AuthSessionUser,
  feature: RetailerFeature,
): Promise<void> {
  const features = await loadFeatures(auth);
  if (!features.includes(feature)) {
    throw new AppError(403, 'FORBIDDEN', 'This account cannot use that section');
  }
}

export async function assertRetailerAnyFeature(
  auth: AuthSessionUser,
  allowed: readonly RetailerFeature[],
): Promise<void> {
  const features = await loadFeatures(auth);
  if (!allowed.some((feature) => features.includes(feature))) {
    throw new AppError(403, 'FORBIDDEN', 'This account cannot use that section');
  }
}

async function loadFeatures(auth: AuthSessionUser): Promise<RetailerFeature[]> {
  const orgId = requireRetailer(auth);
  if (auth.role === 'OWNER') {
    return [...resolveRetailerFeatures('OWNER', null)];
  }
  const user = await prisma.user.findFirst({
    where: { id: auth.userId, orgId, isActive: true },
    select: { role: true, featureAccess: true },
  });
  if (!user) {
    throw new AppError(403, 'FORBIDDEN', 'This account is inactive');
  }
  return resolveRetailerFeatures(user.role, user.featureAccess);
}

async function assertAnotherOwner(orgId: string, userId: string): Promise<void> {
  const others = await prisma.user.count({
    where: { orgId, role: 'OWNER', isActive: true, id: { not: userId } },
  });
  if (others === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The shop needs at least one active owner');
  }
}

function toStaff(user: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  featureAccess: unknown;
}): RetailerStaffMember {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role === 'OWNER' ? 'OWNER' : 'STAFF',
    isActive: user.isActive,
    features: resolveRetailerFeatures(user.role, user.featureAccess),
  };
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

function requireRetailer(auth: AuthSessionUser): string {
  if (auth.orgType !== 'RETAILER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This action is available to retailers');
  }
  return auth.orgId;
}

function requireOwner(auth: AuthSessionUser): void {
  if (auth.role !== 'OWNER') {
    throw new AppError(403, 'FORBIDDEN', 'Only a shop owner can do this');
  }
}
