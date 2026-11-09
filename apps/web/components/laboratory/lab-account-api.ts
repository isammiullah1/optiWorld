'use client';

import {
  LabSessionProfileSchema,
  LabStaffMemberSchema,
  type CreateLabStaffRequest,
  type LabSessionProfile,
  type LabStaffMember,
  type UpdateLabAccountRequest,
  type UpdateLabProfileRequest,
  type UpdateLabStaffRequest,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ProfileResponseSchema = z.object({ success: z.literal(true), data: LabSessionProfileSchema });
const StaffListSchema = z.object({ success: z.literal(true), data: z.array(LabStaffMemberSchema) });
const StaffResponseSchema = z.object({ success: z.literal(true), data: LabStaffMemberSchema });

export async function loadLabProfile(token: string): Promise<LabSessionProfile> {
  return (await send(token, '/api/v1/lab/profile', 'GET', undefined, ProfileResponseSchema)).data;
}

export async function saveLabProfile(
  token: string,
  input: UpdateLabProfileRequest,
): Promise<LabSessionProfile> {
  return (await send(token, '/api/v1/lab/profile', 'PATCH', input, ProfileResponseSchema)).data;
}

export async function saveLabAccount(
  token: string,
  input: UpdateLabAccountRequest,
): Promise<LabSessionProfile> {
  return (await send(token, '/api/v1/lab/account', 'PATCH', input, ProfileResponseSchema)).data;
}

export async function loadLabStaff(token: string): Promise<LabStaffMember[]> {
  return (await send(token, '/api/v1/lab/staff', 'GET', undefined, StaffListSchema)).data;
}

export async function createLabStaffAccount(
  token: string,
  input: CreateLabStaffRequest,
): Promise<LabStaffMember> {
  return (await send(token, '/api/v1/lab/staff', 'POST', input, StaffResponseSchema)).data;
}

export async function deleteLabStaffAccount(token: string, userId: string): Promise<void> {
  await send(
    token,
    `/api/v1/lab/staff/${userId}`,
    'DELETE',
    undefined,
    z.object({ success: z.literal(true) }),
  );
}

export async function saveLabStaffAccount(
  token: string,
  userId: string,
  input: UpdateLabStaffRequest,
): Promise<LabStaffMember> {
  return (await send(token, `/api/v1/lab/staff/${userId}`, 'PATCH', input, StaffResponseSchema))
    .data;
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
      message.success ? message.data.error.message : 'The laboratory account could not be updated',
    );
  }
  return parsed.data;
}
