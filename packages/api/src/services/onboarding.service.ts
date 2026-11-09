import { prisma } from '@optiworld/db';
import type {
  CompleteOnboardingRequest,
  LoginResponse,
  OrgType,
  PlanType,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { hashPassword } from '../lib/password.js';
import { login } from './auth.service.js';

const TRIAL_DAYS = 30;

export async function completeOnboarding(input: CompleteOnboardingRequest): Promise<LoginResponse> {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, 'VALIDATION_ERROR', 'An account with this email already exists');
  }
  const admin = await prisma.superAdmin.findUnique({ where: { email } });
  if (admin) {
    throw new AppError(409, 'VALIDATION_ERROR', 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    const org = await tx.organisation.create({
      data: {
        name: input.businessName,
        type: input.orgType,
        status: 'ACTIVE',
        phone: input.phone,
        city: input.city,
        address: emptyToNull(input.address),
        whatsappNumber: emptyToNull(input.whatsappNumber),
        listingProfileNotes: emptyToNull(input.listingProfileNotes),
        subscriptionStatus: 'TRIAL',
        planType: planFor(input.orgType),
      },
    });
    await tx.subscription.create({
      data: {
        orgId: org.id,
        planType: planFor(input.orgType),
        status: 'TRIAL',
        startDate: now,
        endDate: trialEnd,
        renewalDate: trialEnd,
      },
    });
    await tx.user.create({
      data: {
        orgId: org.id,
        email,
        passwordHash,
        name: input.fullName,
        phone: input.phone,
        role: ownerRole(input.orgType),
        isActive: true,
      },
    });
  });

  return login(email, input.password);
}

function ownerRole(orgType: OrgType): string {
  return orgType === 'RETAILER' ? 'OWNER' : 'ADMIN';
}

function planFor(orgType: OrgType): PlanType {
  if (orgType === 'RETAILER') {
    return 'RETAILER_STANDARD';
  }
  if (orgType === 'WHOLESALER') {
    return 'WHOLESALER_STANDARD';
  }
  return 'LABORATORY_STANDARD';
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}
