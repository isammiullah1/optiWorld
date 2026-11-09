import { prisma } from '@optiworld/db';
import type { PlanType, SubscriptionStatus } from '@optiworld/shared';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

export function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export type CurrentSubscription = {
  id: string;
  orgId: string;
  planType: PlanType;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  renewalDate: Date;
  createdAt: Date;
};

export async function currentSubscriptions(): Promise<Map<string, CurrentSubscription>> {
  const rows = await prisma.subscription.findMany({
    where: { org: { deletedAt: null } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      orgId: true,
      planType: true,
      status: true,
      startDate: true,
      endDate: true,
      renewalDate: true,
      createdAt: true,
    },
  });
  const map = new Map<string, CurrentSubscription>();
  for (const row of rows) {
    if (!map.has(row.orgId)) {
      map.set(row.orgId, row);
    }
  }
  return map;
}

export async function appendSubscription(input: {
  orgId: string;
  planType: PlanType;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  renewalDate: Date;
}): Promise<void> {
  await prisma.$transaction([
    prisma.subscription.create({ data: input }),
    prisma.organisation.update({
      where: { id: input.orgId },
      data: { planType: input.planType, subscriptionStatus: input.status },
    }),
  ]);
}

export async function writeAdminAudit(input: {
  orgId: string | null;
  superAdminId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, string | number | boolean | null>;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId: input.orgId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: { superAdminId: input.superAdminId, ...input.metadata },
    },
  });
}
