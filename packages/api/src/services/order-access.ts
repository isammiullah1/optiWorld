import { prisma } from '@optiworld/db';
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  RETAILER_ROLES,
  WHOLESALER_ROLES,
  type AuthSessionUser,
  type SubscriptionStatus,
  type UserRole,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';

export type PartyOrder = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  lockedAt: Date | null;
  totalValue: { toFixed: (digits: number) => string } | null;
  retailerOrgId: string;
  wholesalerOrgId: string;
  items: Array<{
    id: string;
    catalogProductId: string | null;
    productName: string;
    quantity: number;
    agreedPrice: { toFixed: (digits: number) => string } | null;
  }>;
};

export async function requireOrderParty(
  auth: AuthSessionUser,
  orderId: string,
): Promise<PartyOrder> {
  assertChatSession(auth);
  const orgId = auth.orgId;
  if (!orgId) {
    throw new AppError(403, 'FORBIDDEN', 'You are not part of this order');
  }

  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { orderBy: { id: 'asc' } } },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Order not found');
  }
  if (existing.retailerOrgId !== orgId && existing.wholesalerOrgId !== orgId) {
    throw new AppError(403, 'FORBIDDEN', 'You are not part of this order');
  }
  if (auth.orgType === 'RETAILER' && existing.retailerOrgId !== orgId) {
    throw new AppError(403, 'FORBIDDEN', 'You are not part of this order');
  }
  if (auth.orgType === 'WHOLESALER' && existing.wholesalerOrgId !== orgId) {
    throw new AppError(403, 'FORBIDDEN', 'You are not part of this order');
  }

  return existing;
}

export function assertRetailerParty(auth: AuthSessionUser, order: PartyOrder): void {
  if (auth.orgType !== 'RETAILER' || auth.orgId !== order.retailerOrgId) {
    throw new AppError(403, 'FORBIDDEN', 'Only the retailer can propose a change');
  }
}

export function assertWholesalerParty(auth: AuthSessionUser, order: PartyOrder): void {
  if (auth.orgType !== 'WHOLESALER' || auth.orgId !== order.wholesalerOrgId) {
    throw new AppError(403, 'FORBIDDEN', 'Only the wholesaler can do this');
  }
}

export function assertOrderOpen(order: Pick<PartyOrder, 'lockedAt' | 'status'>): void {
  if (order.lockedAt || order.status !== 'PENDING') {
    throw new AppError(409, 'ORDER_LOCKED', 'This order is locked');
  }
}

export function assertOrderRevisable(order: Pick<PartyOrder, 'status'>): void {
  if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') {
    throw new AppError(409, 'ORDER_LOCKED', 'This order can no longer be changed');
  }
}

function assertChatSession(auth: AuthSessionUser): void {
  if (auth.orgStatus !== 'ACTIVE') {
    throw new AppError(403, 'FORBIDDEN', 'This organisation is not active');
  }
  if (!auth.subscriptionStatus || !isActiveSubscription(auth.subscriptionStatus)) {
    throw new AppError(403, 'SUBSCRIPTION_INACTIVE', 'An active subscription is required');
  }
  if (!auth.orgId || !auth.orgType) {
    throw new AppError(403, 'FORBIDDEN', 'You are not part of this order');
  }
  if (auth.orgType === 'RETAILER' && !hasRole(RETAILER_ROLES, auth.role)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission for this action');
  }
  if (auth.orgType === 'WHOLESALER' && !hasRole(WHOLESALER_ROLES, auth.role)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission for this action');
  }
  if (auth.orgType === 'LABORATORY') {
    throw new AppError(403, 'FORBIDDEN', 'You are not part of this order');
  }
}

function isActiveSubscription(status: SubscriptionStatus): boolean {
  return (ACTIVE_SUBSCRIPTION_STATUSES as readonly SubscriptionStatus[]).includes(status);
}

function hasRole(roles: readonly UserRole[], role: UserRole): boolean {
  return roles.includes(role);
}
