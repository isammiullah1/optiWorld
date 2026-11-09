import {
  LabConnectionSchema,
  LabJobDetailSchema,
  LabJobRowSchema,
  LabSearchHitSchema,
  type CreateLabJobRequest,
  type JobStatus,
  type LabConnection,
  type LabJobDetail,
  type LabJobRow,
  type LabSearchHit,
} from '@optiworld/shared';
import { z } from 'zod';

import { getAccessToken } from './auth-service';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function loadLabConnections(): Promise<LabConnection[]> {
  const payload = await getJson(
    '/api/v1/retailer/lab-connections',
    z.object({ success: z.literal(true), data: z.array(LabConnectionSchema) }),
  );
  return payload.data;
}

export async function searchLabs(query: string): Promise<LabSearchHit[]> {
  const payload = await getJson(
    `/api/v1/retailer/labs/search?q=${encodeURIComponent(query)}`,
    z.object({ success: z.literal(true), data: z.array(LabSearchHitSchema) }),
  );
  return payload.data;
}

export async function connectLab(labOrgId: string): Promise<void> {
  await sendJson('/api/v1/retailer/lab-connections', { labOrgId }, 'POST');
}

export async function loadLabJobs(filters: { status?: JobStatus | 'ALL' }): Promise<LabJobRow[]> {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'ALL') {
    params.set('status', filters.status);
  }
  const query = params.toString();
  const payload = await getJson(
    `/api/v1/retailer/lab-jobs${query ? `?${query}` : ''}`,
    z.object({ success: z.literal(true), data: z.array(LabJobRowSchema) }),
  );
  return payload.data;
}

export async function loadLabJob(jobId: string): Promise<LabJobDetail> {
  const payload = await getJson(
    `/api/v1/lab-jobs/${jobId}`,
    z.object({ success: z.literal(true), data: LabJobDetailSchema }),
  );
  return payload.data;
}

export async function createLabJob(input: CreateLabJobRequest): Promise<void> {
  await sendJson('/api/v1/lab-jobs', input, 'POST');
}

export async function setLabJobNotify(jobId: string, notifyWhatsapp: boolean): Promise<boolean> {
  const payload = await sendJson(`/api/v1/lab-jobs/${jobId}`, { notifyWhatsapp }, 'PATCH');
  const parsed = z
    .object({ success: z.literal(true), data: z.object({ notifyWhatsapp: z.boolean() }) })
    .parse(payload);
  return parsed.data.notifyWhatsapp;
}

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Sign in is required');
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error(readMessage(payload));
  }
  return parsed.data;
}

async function sendJson(path: string, body: unknown, method: 'POST' | 'PATCH'): Promise<unknown> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Sign in is required');
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readMessage(payload));
  }
  return payload;
}

function readMessage(payload: unknown): string {
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
  return 'The request could not be completed';
}
