import { prisma } from '@optiworld/db';
import type {
  AdminDashboard,
  AdminHealth,
  AdminPlatformUser,
  AdminSubscriptionRow,
  AdminUserQuery,
  OrgType,
} from '@optiworld/shared';

import { recentErrors } from '../lib/logger.js';
import { getRedis } from '../lib/redis.js';
import { AppError } from '../lib/errors.js';
import { chatServer } from '../realtime/hub.js';
import {
  addDays,
  currentSubscriptions,
  iso,
  startOfUtcDay,
  appendSubscription,
  writeAdminAudit,
} from './admin-support.js';

const ORG_TYPES: readonly OrgType[] = ['RETAILER', 'WHOLESALER', 'LABORATORY'];

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const today = startOfUtcDay(new Date());
  const tomorrow = addDays(today, 1);
  const soon = addDays(today, 14);
  const [
    totalOrgs,
    activeSubscriptions,
    trials,
    activeUsersToday,
    grouped,
    recent,
    subscriptions,
    orgs,
  ] = await Promise.all([
    prisma.organisation.count({ where: { deletedAt: null } }),
    prisma.organisation.count({ where: { deletedAt: null, subscriptionStatus: 'ACTIVE' } }),
    prisma.organisation.count({ where: { deletedAt: null, subscriptionStatus: 'TRIAL' } }),
    prisma.user.count({
      where: {
        isActive: true,
        lastLoginAt: { gte: today, lt: tomorrow },
        org: { deletedAt: null },
      },
    }),
    prisma.organisation.groupBy({
      by: ['type'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.organisation.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, type: true, createdAt: true },
    }),
    currentSubscriptions(),
    prisma.organisation.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, type: true },
    }),
  ]);

  const counts = new Map<OrgType, number>();
  for (const row of grouped) {
    counts.set(row.type, row._count._all);
  }
  const names = new Map(orgs.map((org) => [org.id, org]));
  const expiringSoon = [...subscriptions.values()]
    .filter((row) => row.renewalDate >= today && row.renewalDate < soon)
    .sort((left, right) => left.renewalDate.getTime() - right.renewalDate.getTime())
    .flatMap((row) => {
      const org = names.get(row.orgId);
      if (!org) {
        return [];
      }
      return [
        { id: org.id, name: org.name, type: org.type, renewalDate: row.renewalDate.toISOString() },
      ];
    });

  return {
    totalOrgs,
    activeSubscriptions,
    trials,
    activeUsersToday,
    breakdown: ORG_TYPES.map((type) => ({ type, count: counts.get(type) ?? 0 })),
    expiringSoon,
    recentSignups: recent.map((org) => ({
      id: org.id,
      name: org.name,
      type: org.type,
      createdAt: org.createdAt.toISOString(),
    })),
  };
}

export async function listAdminSubscriptions(
  filter: 'WEEK' | 'MONTH' | 'EXPIRED' | 'ALL',
): Promise<AdminSubscriptionRow[]> {
  const today = startOfUtcDay(new Date());
  const weekEnd = addDays(today, 7);
  const monthEnd = addDays(today, 30);
  const [subscriptions, orgs] = await Promise.all([
    currentSubscriptions(),
    prisma.organisation.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, type: true },
    }),
  ]);
  const names = new Map(orgs.map((org) => [org.id, org]));
  return [...subscriptions.values()]
    .filter((row) => {
      if (filter === 'WEEK') {
        return row.renewalDate >= today && row.renewalDate < weekEnd;
      }
      if (filter === 'MONTH') {
        return row.renewalDate >= today && row.renewalDate < monthEnd;
      }
      if (filter === 'EXPIRED') {
        return row.renewalDate < today || row.status === 'EXPIRED';
      }
      return true;
    })
    .sort((left, right) => left.renewalDate.getTime() - right.renewalDate.getTime())
    .flatMap((row) => {
      const org = names.get(row.orgId);
      if (!org) {
        return [];
      }
      return [
        {
          id: row.id,
          orgId: org.id,
          orgName: org.name,
          orgType: org.type,
          planType: row.planType,
          status: row.status,
          startDate: row.startDate.toISOString(),
          endDate: row.endDate.toISOString(),
          renewalDate: row.renewalDate.toISOString(),
        },
      ];
    });
}

export async function extendExpiringWeek(superAdminId: string): Promise<{ extended: number }> {
  const today = startOfUtcDay(new Date());
  const weekEnd = addDays(today, 7);
  const current = await currentSubscriptions();
  let extended = 0;
  for (const row of current.values()) {
    if (row.renewalDate < today || row.renewalDate >= weekEnd) {
      continue;
    }
    await appendSubscription({
      orgId: row.orgId,
      planType: row.planType,
      status: row.status,
      startDate: row.startDate,
      endDate: addDays(row.endDate, 30),
      renewalDate: addDays(row.renewalDate, 30),
    });
    await writeAdminAudit({
      orgId: row.orgId,
      superAdminId,
      action: 'SUBSCRIPTION_EXTENDED',
      entityType: 'Organisation',
      entityId: row.orgId,
      metadata: { days: 30 },
    });
    extended += 1;
  }
  return { extended };
}

export async function listAdminUsers(query: AdminUserQuery): Promise<AdminPlatformUser[]> {
  const users = await prisma.user.findMany({
    where: {
      org: { deletedAt: null, ...(query.orgType ? { type: query.orgType } : {}) },
      ...(query.orgId ? { orgId: query.orgId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ name: 'asc' }],
    take: 500,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      orgId: true,
      org: { select: { name: true, type: true } },
    },
  });
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: iso(user.lastLoginAt),
    orgId: user.orgId,
    orgName: user.org.name,
    orgType: user.org.type,
  }));
}

export async function updateAdminUser(
  superAdminId: string,
  userId: string,
  isActive: boolean,
): Promise<{ id: string; isActive: boolean }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, org: { deletedAt: null } },
    select: { id: true, orgId: true },
  });
  if (!user) {
    throw new AppError(404, 'NOT_FOUND', 'That user could not be found');
  }
  await prisma.user.update({ where: { id: userId }, data: { isActive } });
  await writeAdminAudit({
    orgId: user.orgId,
    superAdminId,
    action: isActive ? 'USER_REACTIVATED' : 'USER_DEACTIVATED',
    entityType: 'User',
    entityId: userId,
  });
  return { id: userId, isActive };
}

export async function getPlatformHealth(): Promise<AdminHealth> {
  const [database, redis, whatsapp] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkWhatsApp(),
  ]);
  const socketServer = chatServer();
  return {
    database,
    redis,
    whatsapp,
    socket: socketServer
      ? {
          status: 'UP',
          detail: 'Socket.io is accepting connections',
          connections: socketServer.engine.clientsCount,
        }
      : { status: 'DEGRADED', detail: 'Socket server is not attached', connections: 0 },
    errors: [...recentErrors()],
  };
}

async function checkDatabase(): Promise<AdminHealth['database']> {
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 1500);
    return { status: 'UP', detail: 'PostgreSQL is connected' };
  } catch {
    return { status: 'DOWN', detail: 'PostgreSQL is not responding' };
  }
}

async function checkRedis(): Promise<AdminHealth['redis']> {
  try {
    const pong = await withTimeout(getRedis().ping(), 1500);
    return pong === 'PONG'
      ? { status: 'UP', detail: 'Redis is connected' }
      : { status: 'DEGRADED', detail: 'Redis responded unexpectedly' };
  } catch {
    return { status: 'DOWN', detail: 'Redis is not responding' };
  }
}

async function checkWhatsApp(): Promise<AdminHealth['whatsapp']> {
  const token = process.env.WHATSAPP_API_TOKEN ?? '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  if (!token || !phoneNumberId) {
    return { status: 'DEGRADED', detail: 'WhatsApp is not configured' };
  }
  try {
    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}?fields=id`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(2500),
    });
    return response.ok
      ? { status: 'UP', detail: 'WhatsApp API is reachable' }
      : { status: 'DOWN', detail: 'WhatsApp API rejected the health check' };
  } catch {
    return { status: 'DOWN', detail: 'WhatsApp API is not reachable' };
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
