'use client';

import {
  AdminDashboardSchema,
  AdminExtendWeekSchema,
  AdminHealthSchema,
  AdminInviteResultSchema,
  AdminOrgDetailSchema,
  AdminOrgRowSchema,
  AdminPlatformUserSchema,
  AdminSubscriptionRowSchema,
  type AdminDashboard,
  type AdminHealth,
  type AdminInviteResult,
  type AdminOrgDetail,
  type AdminOrgRow,
  type AdminPlatformUser,
  type AdminSubscriptionRow,
  type CreateAdminOrgRequest,
  type OrgStatus,
  type OrgType,
  type PatchAdminSubscriptionRequest,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class AdminRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminRequestError';
  }
}

const DashboardResponse = z.object({ success: z.literal(true), data: AdminDashboardSchema });
const OrgListResponse = z.object({ success: z.literal(true), data: z.array(AdminOrgRowSchema) });
const OrgResponse = z.object({ success: z.literal(true), data: AdminOrgDetailSchema });
const InviteResponse = z.object({ success: z.literal(true), data: AdminInviteResultSchema });
const UserListResponse = z.object({
  success: z.literal(true),
  data: z.array(AdminPlatformUserSchema),
});
const UserPatchResponse = z.object({
  success: z.literal(true),
  data: z.object({ id: z.string().uuid(), isActive: z.boolean() }),
});
const SubscriptionResponse = z.object({
  success: z.literal(true),
  data: z.array(AdminSubscriptionRowSchema),
});
const ExtendResponse = z.object({ success: z.literal(true), data: AdminExtendWeekSchema });
const HealthResponse = z.object({ success: z.literal(true), data: AdminHealthSchema });

export function loadDashboard(token: string): Promise<AdminDashboard> {
  return request(token, '/api/v1/admin/dashboard', DashboardResponse);
}

export function loadOrganisations(
  token: string,
  filters: { q?: string; type?: OrgType | ''; status?: OrgStatus | '' },
): Promise<AdminOrgRow[]> {
  return request(token, `/api/v1/admin/organisations${query(filters)}`, OrgListResponse);
}

export function loadOrganisation(token: string, orgId: string): Promise<AdminOrgDetail> {
  return request(token, `/api/v1/admin/organisations/${orgId}`, OrgResponse);
}

export function createOrganisation(
  token: string,
  body: CreateAdminOrgRequest,
): Promise<AdminInviteResult> {
  return request(token, '/api/v1/admin/organisations', InviteResponse, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateOrganisation(
  token: string,
  orgId: string,
  body: { status?: 'ACTIVE' | 'INACTIVE'; adminNotes?: string },
): Promise<AdminOrgDetail> {
  return request(token, `/api/v1/admin/organisations/${orgId}`, OrgResponse, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function updateSubscription(
  token: string,
  orgId: string,
  body: PatchAdminSubscriptionRequest,
): Promise<AdminOrgDetail> {
  return request(token, `/api/v1/admin/organisations/${orgId}/subscription`, OrgResponse, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function loadUsers(
  token: string,
  filters: { q?: string; orgType?: OrgType | ''; orgId?: string },
): Promise<AdminPlatformUser[]> {
  return request(token, `/api/v1/admin/users${query(filters)}`, UserListResponse);
}

export function updateUser(
  token: string,
  userId: string,
  isActive: boolean,
): Promise<{ id: string; isActive: boolean }> {
  return request(token, `/api/v1/admin/users/${userId}`, UserPatchResponse, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  });
}

export function loadSubscriptions(
  token: string,
  filter: 'WEEK' | 'MONTH' | 'EXPIRED' | 'ALL',
): Promise<AdminSubscriptionRow[]> {
  return request(token, `/api/v1/admin/subscriptions?filter=${filter}`, SubscriptionResponse);
}

export function extendExpiringWeek(token: string): Promise<{ extended: number }> {
  return request(token, '/api/v1/admin/subscriptions/extend-week', ExtendResponse, {
    method: 'POST',
  });
}

export function loadHealth(token: string): Promise<AdminHealth> {
  return request(token, '/api/v1/admin/platform/health', HealthResponse);
}

function query(filters: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

async function request<T>(
  token: string,
  path: string,
  schema: z.ZodType<{ success: true; data: T }>,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new AdminRequestError(messageFrom(payload));
  }
  return parsed.data.data;
}

function messageFrom(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = payload.error;
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return error.message;
    }
  }
  return 'Something went wrong. Try again.';
}
