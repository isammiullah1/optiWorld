import bcrypt from 'bcrypt';
import { prisma } from '@optiworld/db';
import { BCRYPT_ROUNDS } from '@optiworld/shared';
import type { Express } from 'express';
import request from 'supertest';

export const PASSWORD = 'OptiWorld123!';

export type TestAccount = {
  orgId: string;
  userId: string;
  email: string;
};

let sharedHash: Promise<string> | null = null;

function passwordHash(): Promise<string> {
  sharedHash ??= bcrypt.hash(PASSWORD, BCRYPT_ROUNDS);
  return sharedHash;
}

export async function createAccount(input: {
  prefix: string;
  slug: string;
  type: 'RETAILER' | 'WHOLESALER' | 'LABORATORY';
  role: string;
  status?: 'ACTIVE' | 'INACTIVE';
}): Promise<TestAccount> {
  const planType =
    input.type === 'RETAILER'
      ? 'RETAILER_STANDARD'
      : input.type === 'WHOLESALER'
        ? 'WHOLESALER_STANDARD'
        : 'LABORATORY_STANDARD';
  const email = `${input.prefix}-${input.slug}@example.com`;
  const org = await prisma.organisation.create({
    data: {
      name: `${input.prefix} ${input.slug}`,
      type: input.type,
      status: input.status ?? 'ACTIVE',
      planType,
      subscriptionStatus: 'ACTIVE',
      city: 'Lahore',
      phone: '+92 300 5550199',
    },
  });
  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email,
      name: input.slug,
      role: input.role,
      passwordHash: await passwordHash(),
      isActive: true,
    },
  });
  return { orgId: org.id, userId: user.id, email };
}

export async function login(
  app: Express,
  email: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
  if (response.status !== 200) {
    throw new Error(
      `Login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }
  return {
    accessToken: response.body.data.accessToken as string,
    refreshToken: response.body.data.refreshToken as string,
  };
}

export async function removeByPrefix(prefix: string): Promise<void> {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: `${prefix}-` } },
    select: { orgId: true },
  });
  const orgIds = [...new Set(users.map((user) => user.orgId))];
  for (const orgId of orgIds) {
    await removeOrganisation(orgId);
  }
}

async function removeOrganisation(orgId: string): Promise<void> {
  const exists = await prisma.organisation.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  if (!exists) {
    return;
  }
  const orders = await prisma.order.findMany({
    where: { OR: [{ retailerOrgId: orgId }, { wholesalerOrgId: orgId }] },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length > 0) {
    await prisma.changeRequest.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.chatMessage.deleteMany({ where: { thread: { orderId: { in: orderIds } } } });
    await prisma.chatThread.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.alert.deleteMany({ where: { relatedEntityId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  await prisma.retailerConnection.deleteMany({
    where: { OR: [{ retailerOrgId: orgId }, { wholesalerOrgId: orgId }] },
  });
  await prisma.catalogProduct.deleteMany({ where: { orgId } });
  const jobs = await prisma.labJob.findMany({
    where: { OR: [{ labOrgId: orgId }, { retailerOrgId: orgId }] },
    select: { id: true },
  });
  const jobIds = jobs.map((job) => job.id);
  if (jobIds.length > 0) {
    await prisma.labJobStatusHistory.deleteMany({ where: { labJobId: { in: jobIds } } });
    await prisma.labJob.deleteMany({ where: { id: { in: jobIds } } });
  }
  const invoices = await prisma.invoice.findMany({ where: { orgId }, select: { id: true } });
  const invoiceIds = invoices.map((invoice) => invoice.id);
  if (invoiceIds.length > 0) {
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.alert.deleteMany({ where: { relatedEntityId: { in: invoiceIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  }
  await prisma.payment.deleteMany({ where: { orgId } });
  await prisma.stockMovement.deleteMany({ where: { orgId } });
  await prisma.inventoryBatch.deleteMany({ where: { orgId } });
  await prisma.customer.deleteMany({ where: { orgId } });
  await prisma.alert.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.subscription.deleteMany({ where: { orgId } });
  await prisma.organisationInvite.deleteMany({ where: { orgId } });
  const users = await prisma.user.findMany({ where: { orgId }, select: { id: true } });
  const userIds = users.map((user) => user.id);
  if (userIds.length > 0) {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
  }
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organisation.delete({ where: { id: orgId } });
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

const REVENUE_KEYS = new Set([
  'revenue',
  'profit',
  'earnings',
  'totalrevenue',
  'totalearnings',
  'grossprofit',
]);

export function containsRevenueField(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsRevenueField(entry));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(
      ([key, child]) => REVENUE_KEYS.has(key.toLowerCase()) || containsRevenueField(child),
    );
  }
  return false;
}
