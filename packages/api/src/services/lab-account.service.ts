import { prisma } from '@optiworld/db';
import type {
  AuthSessionUser,
  CreateLabStaffRequest,
  LabFeature,
  LabSessionProfile,
  LabStaffMember,
  UpdateLabAccountRequest,
  UpdateLabProfileRequest,
  UpdateLabStaffRequest,
} from '@optiworld/shared';
import { resolveLabFeatures } from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';

export async function getLabSessionProfile(auth: AuthSessionUser): Promise<LabSessionProfile> {
  const orgId = requireLab(auth);
  const [org, user] = await Promise.all([
    prisma.organisation.findFirst({
      where: { id: orgId, type: 'LABORATORY', deletedAt: null },
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
    throw new AppError(404, 'NOT_FOUND', 'This laboratory account could not be found');
  }
  return {
    laboratory: {
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
      role: user.role === 'ADMIN' ? 'ADMIN' : 'TECHNICIAN',
    },
    features: resolveLabFeatures(user.role, user.featureAccess),
  };
}

export async function updateLabProfile(
  auth: AuthSessionUser,
  input: UpdateLabProfileRequest,
): Promise<LabSessionProfile> {
  const orgId = requireLab(auth);
  requireAdmin(auth);
  const taken = await prisma.organisation.findFirst({
    where: { username: input.username, id: { not: orgId } },
    select: { id: true },
  });
  if (taken) {
    throw new AppError(422, 'VALIDATION_ERROR', 'That username is already in use');
  }
  await prisma.$transaction(async (tx) => {
    await tx.organisation.update({
      where: { id: orgId },
      data: {
        name: input.name,
        username: input.username,
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
        action: 'LAB_PROFILE_UPDATED',
        entityType: 'Organisation',
        entityId: orgId,
        metadata: { username: input.username },
      },
    });
  });
  return getLabSessionProfile(auth);
}

export async function updateLabAccount(
  auth: AuthSessionUser,
  input: UpdateLabAccountRequest,
): Promise<LabSessionProfile> {
  const orgId = requireLab(auth);
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
  return getLabSessionProfile(auth);
}

export async function listLabStaff(auth: AuthSessionUser): Promise<LabStaffMember[]> {
  const orgId = requireLab(auth);
  requireAdmin(auth);
  const users = await prisma.user.findMany({
    where: { orgId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      featureAccess: true,
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
  return users.map(toStaff);
}

export async function createLabStaff(
  auth: AuthSessionUser,
  input: CreateLabStaffRequest,
): Promise<LabStaffMember> {
  const orgId = requireLab(auth);
  requireAdmin(auth);
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
      featureAccess: input.role === 'TECHNICIAN' ? input.features : undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      featureAccess: true,
    },
  });
  await prisma.auditLog.create({
    data: {
      orgId,
      userId: auth.userId,
      action: 'LAB_STAFF_CREATED',
      entityType: 'User',
      entityId: created.id,
      metadata: { role: created.role },
    },
  });
  return toStaff(created);
}

export async function updateLabStaff(
  auth: AuthSessionUser,
  userId: string,
  input: UpdateLabStaffRequest,
): Promise<LabStaffMember> {
  const orgId = requireLab(auth);
  requireAdmin(auth);
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
    existing.role === 'ADMIN' &&
    existing.isActive &&
    (input.role !== 'ADMIN' || !input.isActive)
  ) {
    const others = await prisma.user.count({
      where: { orgId, role: 'ADMIN', isActive: true, id: { not: existing.id } },
    });
    if (others === 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The laboratory needs at least one active admin');
    }
  }
  const nextPassword = input.password?.trim() ?? '';
  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      name: input.name,
      phone: emptyToNull(input.phone),
      role: input.role,
      isActive: input.isActive,
      featureAccess: input.role === 'TECHNICIAN' ? input.features : undefined,
      ...(nextPassword.length > 0 ? { passwordHash: await hashPassword(nextPassword) } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      featureAccess: true,
    },
  });
  await prisma.auditLog.create({
    data: {
      orgId,
      userId: auth.userId,
      action: 'LAB_STAFF_UPDATED',
      entityType: 'User',
      entityId: updated.id,
      metadata: { role: updated.role, isActive: updated.isActive },
    },
  });
  return toStaff(updated);
}

export async function deleteLabStaff(
  auth: AuthSessionUser,
  userId: string,
): Promise<{ id: string }> {
  const orgId = requireLab(auth);
  requireAdmin(auth);
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
  if (existing.role === 'ADMIN' && existing.isActive) {
    const others = await prisma.user.count({
      where: { orgId, role: 'ADMIN', isActive: true, id: { not: existing.id } },
    });
    if (others === 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The laboratory needs at least one active admin');
    }
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
        action: 'LAB_STAFF_DELETED',
        entityType: 'User',
        entityId: existing.id,
        metadata: { name: existing.name },
      },
    });
    await tx.user.delete({ where: { id: existing.id } });
  });
  return { id: existing.id };
}

export async function assertLabFeature(auth: AuthSessionUser, feature: LabFeature): Promise<void> {
  const orgId = requireLab(auth);
  if (auth.role === 'ADMIN') {
    return;
  }
  const user = await prisma.user.findFirst({
    where: { id: auth.userId, orgId, isActive: true },
    select: { role: true, featureAccess: true },
  });
  if (!user) {
    throw new AppError(403, 'FORBIDDEN', 'This account is inactive');
  }
  const features = resolveLabFeatures(user.role, user.featureAccess);
  if (!features.includes(feature)) {
    throw new AppError(403, 'FORBIDDEN', 'This account cannot use that section');
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
}): LabStaffMember {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role === 'ADMIN' ? 'ADMIN' : 'TECHNICIAN',
    isActive: user.isActive,
    features: resolveLabFeatures(user.role, user.featureAccess),
  };
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length === 0 ? null : trimmed;
}

function requireLab(auth: AuthSessionUser): string {
  if (auth.orgType !== 'LABORATORY' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This action is available to laboratories');
  }
  return auth.orgId;
}

function requireAdmin(auth: AuthSessionUser): void {
  if (auth.role !== 'ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'Only a laboratory admin can do this');
  }
}
