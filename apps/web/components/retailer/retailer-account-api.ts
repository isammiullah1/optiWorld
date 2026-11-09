'use client';

import {
  RetailerSessionProfileSchema,
  RetailerStaffMemberSchema,
  type CreateRetailerStaffRequest,
  type RetailerSessionProfile,
  type RetailerStaffMember,
  type UpdateRetailerAccountRequest,
  type UpdateRetailerShopProfileRequest,
  type UpdateRetailerStaffRequest,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ProfileResponseSchema = z.object({
  success: z.literal(true),
  data: RetailerSessionProfileSchema,
});
const StaffListSchema = z.object({
  success: z.literal(true),
  data: z.array(RetailerStaffMemberSchema),
});
const StaffResponseSchema = z.object({ success: z.literal(true), data: RetailerStaffMemberSchema });

export async function loadRetailerProfile(token: string): Promise<RetailerSessionProfile> {
  return (await send(token, '/api/v1/retailer/profile', 'GET', undefined, ProfileResponseSchema))
    .data;
}

export async function saveRetailerShopProfile(
  token: string,
  input: UpdateRetailerShopProfileRequest,
): Promise<RetailerSessionProfile> {
  return (await send(token, '/api/v1/retailer/profile', 'PATCH', input, ProfileResponseSchema))
    .data;
}

export async function saveRetailerAccount(
  token: string,
  input: UpdateRetailerAccountRequest,
): Promise<RetailerSessionProfile> {
  return (await send(token, '/api/v1/retailer/account', 'PATCH', input, ProfileResponseSchema))
    .data;
}

export async function loadRetailerStaff(token: string): Promise<RetailerStaffMember[]> {
  return (await send(token, '/api/v1/retailer/staff', 'GET', undefined, StaffListSchema)).data;
}

export async function createRetailerStaffAccount(
  token: string,
  input: CreateRetailerStaffRequest,
): Promise<RetailerStaffMember> {
  return (await send(token, '/api/v1/retailer/staff', 'POST', input, StaffResponseSchema)).data;
}

export async function saveRetailerStaffAccount(
  token: string,
  userId: string,
  input: UpdateRetailerStaffRequest,
): Promise<RetailerStaffMember> {
  return (
    await send(token, `/api/v1/retailer/staff/${userId}`, 'PATCH', input, StaffResponseSchema)
  ).data;
}

export async function deleteRetailerStaffAccount(token: string, userId: string): Promise<void> {
  await send(
    token,
    `/api/v1/retailer/staff/${userId}`,
    'DELETE',
    undefined,
    z.object({ success: z.literal(true) }),
  );
}

async function send<T>(
  token: string,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    const message = z.object({ error: z.object({ message: z.string() }) }).safeParse(payload);
    throw new Error(
      message.success ? message.data.error.message : 'The shop account could not be updated',
    );
  }
  return parsed.data;
}
