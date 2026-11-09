import { randomBytes } from 'node:crypto';

import { prisma } from '@optiworld/db';
import type {
  AcceptInviteRequest,
  AdminOrgDetail,
  AdminOrgRow,
  CreateAdminOrgRequest,
  InviteOrganisationRequest,
  InvitePreview,
  LoginResponse,
  OrgType,
  PatchAdminOrgRequest,
  PatchAdminSubscriptionRequest,
} from '@optiworld/shared';

import { getEnv } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { hashPassword } from '../lib/password.js';
import { hashOpaqueToken } from '../lib/tokens.js';
import { login } from './auth.service.js';
import type { Mailer } from './mailer.js';
import {
  appendSubscription,
  currentSubscriptions,
  iso,
  parseDay,
  startOfUtcDay,
  writeAdminAudit,
} from './admin-support.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LIST_LIMIT = 500;

const ACTION_LABELS: Record<string, string> = {
  USER_LOGIN: 'Signed in',
  ORG_CREATED: 'Organisation created',
  ORG_ACTIVATED: 'Organisation activated',
  ORG_DEACTIVATED: 'Organisation deactivated',
  ORG_NOTES_UPDATED: 'Admin notes updated',
  SUBSCRIPTION_EXTENDED: 'Subscription extended',
  SUBSCRIPTION_STATUS_UPDATED: 'Subscription status changed',
  ORG_INVITE_SENT: 'Invite sent',
  USER_INVITE_ACCEPTED: 'Invite accepted',
  USER_DEACTIVATED: 'User deactivated',
  USER_REACTIVATED: 'User reactivated',
};

export async function listAdminOrganisations(query: {
  q?: string;
  type?: AdminOrgRow['type'];
  status?: AdminOrgRow['status'];
}): Promise<AdminOrgRow[]> {
  const orgs = await prisma.organisation.findMany({
    where: {
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    select: { id: true, name: true, type: true, status: true, createdAt: true },
  });
  const subscriptions = await currentSubscriptions();
  return orgs.map((org) => ({
    id: org.id,
    name: org.name,
    type: org.type,
    status: org.status,
    createdAt: org.createdAt.toISOString(),
    renewalDate: iso(subscriptions.get(org.id)?.renewalDate ?? null),
  }));
}

export async function getAdminOrganisation(orgId: string): Promise<AdminOrgDetail> {
  const org = await prisma.organisation.findFirst({
    where: { id: orgId, deletedAt: null },
    include: {
      users: {
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
        },
      },
      subscriptions: { orderBy: { createdAt: 'desc' } },
      auditLogs: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { user: { select: { name: true } } },
      },
    },
  });
  if (!org) {
    throw new AppError(404, 'NOT_FOUND', 'That organisation could not be found');
  }

  const current = org.subscriptions[0];
  const lastLogin = org.users.reduce<Date | null>((latest, user) => {
    if (!user.lastLoginAt) {
      return latest;
    }
    if (!latest || user.lastLoginAt > latest) {
      return user.lastLoginAt;
    }
    return latest;
  }, null);

  return {
    id: org.id,
    name: org.name,
    type: org.type,
    status: org.status,
    city: org.city,
    phone: org.phone,
    address: org.address,
    createdAt: org.createdAt.toISOString(),
    planType: current?.planType ?? org.planType,
    subscriptionStatus: current?.status ?? org.subscriptionStatus,
    startDate: iso(current?.startDate ?? null),
    endDate: iso(current?.endDate ?? null),
    renewalDate: iso(current?.renewalDate ?? null),
    userCount: org.users.length,
    lastLoginAt: iso(lastLogin),
    adminNotes: org.adminNotes,
    users: org.users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: iso(user.lastLoginAt),
    })),
    subscriptionHistory: org.subscriptions.map((row) => ({
      id: row.id,
      planType: row.planType,
      status: row.status,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      renewalDate: row.renewalDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    activity: org.auditLogs.map((entry) => ({
      id: entry.id,
      action: entry.action,
      label: labelFor(entry.action),
      actorName: entry.user?.name ?? 'Platform admin',
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export async function createAdminOrganisation(
  superAdminId: string,
  input: CreateAdminOrgRequest,
  mailer: Mailer,
): Promise<{ id: string; inviteSent: boolean; message: string }> {
  await assertEmailAvailable(input.inviteEmail);
  const now = new Date();
  const end = parseDay(input.subscriptionEndDate);
  const status = end.getTime() >= startOfUtcDay(now).getTime() ? 'ACTIVE' : 'EXPIRED';
  const org = await prisma.$transaction(async (tx) => {
    const created = await tx.organisation.create({
      data: {
        name: input.name,
        type: input.type,
        status: 'ACTIVE',
        city: input.city,
        phone: input.phone,
        planType: input.planType,
        subscriptionStatus: status,
      },
    });
    await tx.subscription.create({
      data: {
        orgId: created.id,
        planType: input.planType,
        status,
        startDate: now,
        endDate: end,
        renewalDate: end,
      },
    });
    await tx.auditLog.create({
      data: {
        orgId: created.id,
        action: 'ORG_CREATED',
        entityType: 'Organisation',
        entityId: created.id,
        metadata: { superAdminId, type: input.type },
      },
    });
    return created;
  });
  const inviteSent = await sendInvite(superAdminId, org.id, org.name, input.inviteEmail, mailer);
  const email = input.inviteEmail.toLowerCase();
  return {
    id: org.id,
    inviteSent,
    message: inviteSent
      ? `Organisation created. An invite was sent to ${email}.`
      : 'Organisation created. Email is not configured, so the invite was saved and not sent.',
  };
}

export async function updateAdminOrganisation(
  superAdminId: string,
  orgId: string,
  input: PatchAdminOrgRequest,
): Promise<AdminOrgDetail> {
  const org = await prisma.organisation.findFirst({
    where: { id: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!org) {
    throw new AppError(404, 'NOT_FOUND', 'That organisation could not be found');
  }

  await prisma.organisation.update({
    where: { id: orgId },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.adminNotes !== undefined
        ? { adminNotes: input.adminNotes.length > 0 ? input.adminNotes : null }
        : {}),
    },
  });

  if (input.status) {
    await writeAdminAudit({
      orgId,
      superAdminId,
      action: input.status === 'ACTIVE' ? 'ORG_ACTIVATED' : 'ORG_DEACTIVATED',
      entityType: 'Organisation',
      entityId: orgId,
    });
  }
  if (input.adminNotes !== undefined) {
    await writeAdminAudit({
      orgId,
      superAdminId,
      action: 'ORG_NOTES_UPDATED',
      entityType: 'Organisation',
      entityId: orgId,
    });
  }
  return getAdminOrganisation(orgId);
}

export async function updateAdminSubscription(
  superAdminId: string,
  orgId: string,
  input: PatchAdminSubscriptionRequest,
): Promise<AdminOrgDetail> {
  const subscriptions = await currentSubscriptions();
  const current = subscriptions.get(orgId);
  const org = await prisma.organisation.findFirst({
    where: { id: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!org || !current) {
    throw new AppError(404, 'NOT_FOUND', 'That organisation could not be found');
  }

  if (input.action === 'EXTEND') {
    const renewal = parseDay(input.renewalDate);
    await appendSubscription({
      orgId,
      planType: current.planType,
      status: current.status,
      startDate: current.startDate,
      endDate: renewal,
      renewalDate: renewal,
    });
    await writeAdminAudit({
      orgId,
      superAdminId,
      action: 'SUBSCRIPTION_EXTENDED',
      entityType: 'Organisation',
      entityId: orgId,
      metadata: { renewalDate: input.renewalDate },
    });
  } else {
    await appendSubscription({
      orgId,
      planType: current.planType,
      status: input.status,
      startDate: current.startDate,
      endDate: current.endDate,
      renewalDate: current.renewalDate,
    });
    await writeAdminAudit({
      orgId,
      superAdminId,
      action: 'SUBSCRIPTION_STATUS_UPDATED',
      entityType: 'Organisation',
      entityId: orgId,
      metadata: { status: input.status },
    });
  }
  return getAdminOrganisation(orgId);
}

export async function inviteOrganisation(
  superAdminId: string,
  input: InviteOrganisationRequest,
  mailer: Mailer,
): Promise<{ id: string; inviteSent: boolean; message: string }> {
  const org = await prisma.organisation.findFirst({
    where: { id: input.orgId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!org) {
    throw new AppError(404, 'NOT_FOUND', 'That organisation could not be found');
  }
  await assertEmailAvailable(input.email);
  const inviteSent = await sendInvite(superAdminId, org.id, org.name, input.email, mailer);
  const email = input.email.toLowerCase();
  return {
    id: org.id,
    inviteSent,
    message: inviteSent
      ? `An invite was sent to ${email}.`
      : 'Email is not configured, so the invite was saved and not sent.',
  };
}

export async function previewOrganisationInvite(token: string): Promise<InvitePreview> {
  const invite = await findOpenInvite(token);
  return {
    organisationName: invite.org.name,
    email: invite.email,
    orgType: invite.org.type,
  };
}

export async function acceptOrganisationInvite(input: AcceptInviteRequest): Promise<LoginResponse> {
  const invite = await findOpenInvite(input.token);
  await assertEmailAvailable(invite.email);
  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        orgId: invite.orgId,
        email: invite.email,
        passwordHash,
        name: input.fullName,
        role: ownerRole(invite.org.type),
        isActive: true,
      },
    });
    await tx.organisationInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        orgId: invite.orgId,
        userId: user.id,
        action: 'USER_INVITE_ACCEPTED',
        entityType: 'Organisation',
        entityId: invite.orgId,
        metadata: { email: invite.email },
      },
    });
  });
  return login(invite.email, input.password);
}

async function sendInvite(
  superAdminId: string,
  orgId: string,
  organisationName: string,
  email: string,
  mailer: Mailer,
): Promise<boolean> {
  const raw = randomBytes(32).toString('hex');
  await prisma.organisationInvite.create({
    data: {
      orgId,
      email: email.toLowerCase(),
      tokenHash: hashOpaqueToken(raw),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  const url = new URL('/invite', getEnv().NEXTAUTH_URL);
  url.searchParams.set('token', raw);
  let inviteSent: boolean;
  try {
    inviteSent = await mailer.sendOrganisationInvite({
      to: email.toLowerCase(),
      inviteUrl: url.toString(),
      organisationName,
    });
  } catch {
    inviteSent = false;
  }
  await writeAdminAudit({
    orgId,
    superAdminId,
    action: 'ORG_INVITE_SENT',
    entityType: 'Organisation',
    entityId: orgId,
    metadata: { email: email.toLowerCase(), sent: inviteSent },
  });
  return inviteSent;
}

async function findOpenInvite(token: string): Promise<{
  id: string;
  orgId: string;
  email: string;
  org: { name: string; type: OrgType };
}> {
  const invite = await prisma.organisationInvite.findUnique({
    where: { tokenHash: hashOpaqueToken(token) },
    include: { org: { select: { name: true, type: true, deletedAt: true, status: true } } },
  });
  if (
    !invite ||
    invite.usedAt ||
    invite.expiresAt.getTime() <= Date.now() ||
    invite.org.deletedAt
  ) {
    throw new AppError(422, 'VALIDATION_ERROR', 'This invite link is invalid or has expired.');
  }
  return invite;
}

async function assertEmailAvailable(email: string): Promise<void> {
  const normalized = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } });
  const admin = await prisma.superAdmin.findUnique({
    where: { email: normalized },
    select: { id: true },
  });
  if (user || admin) {
    throw new AppError(409, 'VALIDATION_ERROR', 'An account with this email already exists');
  }
}

function ownerRole(orgType: OrgType): string {
  return orgType === 'RETAILER' ? 'OWNER' : 'ADMIN';
}

function labelFor(action: string): string {
  return (
    ACTION_LABELS[action] ??
    action
      .toLowerCase()
      .split('_')
      .map((part) => (part.length > 0 ? `${part.slice(0, 1).toUpperCase()}${part.slice(1)}` : part))
      .join(' ')
  );
}
