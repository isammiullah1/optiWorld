'use client';

import {
  LabConnectionSchema,
  LabSaleOptionSchema,
  type CreateDirectLabJobRequest,
  type LabSaleOption,
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ConnectionListSchema = z.object({
  success: z.literal(true),
  data: z.array(LabConnectionSchema),
});
const SearchSchema = z.object({ success: z.literal(true), data: z.array(LabSearchHitSchema) });
const JobListSchema = z.object({
  success: z.literal(true),
  data: z.array(LabJobRowSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
  }),
});
const JobDetailSchema = z.object({ success: z.literal(true), data: LabJobDetailSchema });
const CreatedSchema = z.object({
  success: z.literal(true),
  data: z.object({ id: z.string().uuid() }),
});
const NotifySchema = z.object({
  success: z.literal(true),
  data: z.object({ notifyWhatsapp: z.boolean() }),
});

export class LabRequestError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'LabRequestError';
    this.code = code;
  }
}

export async function loadLabConnections(accessToken: string): Promise<LabConnection[]> {
  const response = await getJson(
    '/api/v1/retailer/lab-connections',
    accessToken,
    ConnectionListSchema,
  );
  return response.data;
}

export async function searchLabs(accessToken: string, query: string): Promise<LabSearchHit[]> {
  const response = await getJson(
    `/api/v1/retailer/labs/search?q=${encodeURIComponent(query)}`,
    accessToken,
    SearchSchema,
  );
  return response.data;
}

export async function connectLab(accessToken: string, labOrgId: string): Promise<void> {
  await sendJson(
    '/api/v1/retailer/lab-connections',
    accessToken,
    { labOrgId },
    z.object({ success: z.literal(true) }),
  );
}

export async function respondToLabConnection(
  accessToken: string,
  labOrgId: string,
  accept: boolean,
): Promise<void> {
  await sendJson(
    `/api/v1/retailer/lab-connections/${labOrgId}/${accept ? 'approve' : 'decline'}`,
    accessToken,
    {},
    z.object({ success: z.literal(true) }),
    'PATCH',
  );
}

export async function cancelLabConnection(accessToken: string, labOrgId: string): Promise<void> {
  await sendJson(
    `/api/v1/retailer/lab-connections/${labOrgId}/cancel`,
    accessToken,
    {},
    z.object({ success: z.literal(true) }),
    'PATCH',
  );
}

export async function disconnectLab(accessToken: string, labOrgId: string): Promise<void> {
  await sendJson(
    `/api/v1/retailer/lab-connections/${labOrgId}/disconnect`,
    accessToken,
    {},
    z.object({ success: z.literal(true) }),
    'PATCH',
  );
}

export async function loadLabJobs(
  accessToken: string,
  filters: {
    q?: string;
    status?: JobStatus | 'ALL';
    labOrgId?: string;
    from?: string;
    to?: string;
    sort?: 'RECENT' | 'PATIENT' | 'REFERENCE' | 'SUBMITTED';
    board?: 'OPEN' | 'DONE';
    page?: number;
    limit?: number;
  },
): Promise<{ rows: LabJobRow[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set('q', filters.q);
  }
  if (filters.status && filters.status !== 'ALL') {
    params.set('status', filters.status);
  }
  if (filters.labOrgId) {
    params.set('labOrgId', filters.labOrgId);
  }
  if (filters.from) {
    params.set('from', filters.from);
  }
  if (filters.to) {
    params.set('to', filters.to);
  }
  if (filters.sort) {
    params.set('sort', filters.sort);
  }
  if (filters.board) {
    params.set('board', filters.board);
  }
  if (filters.page) {
    params.set('page', String(filters.page));
  }
  if (filters.limit) {
    params.set('limit', String(filters.limit));
  }
  const query = params.toString();
  const response = await getJson(
    `/api/v1/retailer/lab-jobs${query ? `?${query}` : ''}`,
    accessToken,
    JobListSchema,
  );
  return { rows: response.data, total: response.meta.total };
}

export async function reopenRetailerLabJob(
  accessToken: string,
  jobId: string,
  reason: string,
): Promise<string> {
  const response = await sendJson(
    `/api/v1/retailer/lab-jobs/${jobId}/reopen`,
    accessToken,
    { reason },
    z.object({
      success: z.literal(true),
      data: z.object({ id: z.string().uuid(), message: z.string() }),
    }),
  );
  return response.data.message;
}

export async function setLabJobCompletion(
  accessToken: string,
  jobId: string,
  done: boolean,
): Promise<void> {
  await sendJson(
    `/api/v1/retailer/lab-jobs/${jobId}/completion`,
    accessToken,
    { done },
    z.object({
      success: z.literal(true),
      data: z.object({ id: z.string().uuid(), completedAt: z.string().datetime().nullable() }),
    }),
  );
}

export async function cancelRetailerLabJob(
  accessToken: string,
  jobId: string,
  reason: string,
): Promise<{ sent: boolean; message: string }> {
  const response = await sendJson(
    `/api/v1/retailer/lab-jobs/${jobId}/cancel`,
    accessToken,
    { reason },
    z.object({
      success: z.literal(true),
      data: z.object({ id: z.string().uuid(), sent: z.boolean(), message: z.string() }),
    }),
  );
  return response.data;
}

export async function redirectRetailerLabJob(
  accessToken: string,
  jobId: string,
  labOrgId: string,
): Promise<{ id: string; message: string }> {
  const response = await sendJson(
    `/api/v1/retailer/lab-jobs/${jobId}/redirect`,
    accessToken,
    { labOrgId },
    z.object({
      success: z.literal(true),
      data: z.object({ id: z.string().uuid(), message: z.string() }),
    }),
  );
  return response.data;
}

export async function outsourceRetailerLabJob(
  accessToken: string,
  jobId: string,
): Promise<{ id: string; message: string }> {
  const response = await sendJson(
    `/api/v1/retailer/lab-jobs/${jobId}/outsource`,
    accessToken,
    {},
    z.object({
      success: z.literal(true),
      data: z.object({ id: z.string().uuid(), message: z.string() }),
    }),
  );
  return response.data;
}

export async function loadLabJob(accessToken: string, jobId: string): Promise<LabJobDetail> {
  const response = await getJson(`/api/v1/lab-jobs/${jobId}`, accessToken, JobDetailSchema);
  return response.data;
}

export async function searchLabSales(accessToken: string, query: string): Promise<LabSaleOption[]> {
  const params = new URLSearchParams();
  if (query.trim().length > 0) {
    params.set('q', query.trim());
  }
  const suffix = params.toString();
  const response = await getJson(
    `/api/v1/retailer/lab-jobs/sales${suffix ? `?${suffix}` : ''}`,
    accessToken,
    z.object({ success: z.literal(true), data: z.array(LabSaleOptionSchema) }),
  );
  return response.data;
}

export async function createDirectLabJob(
  accessToken: string,
  input: CreateDirectLabJobRequest,
): Promise<{ id: string; referenceNumber: string; message: string }> {
  const response = await sendJson(
    '/api/v1/retailer/lab-jobs',
    accessToken,
    input,
    z.object({
      success: z.literal(true),
      data: z.object({ id: z.string().uuid(), referenceNumber: z.string(), message: z.string() }),
    }),
  );
  return response.data;
}

export async function createLabJob(
  accessToken: string,
  input: CreateLabJobRequest,
): Promise<string> {
  const response = await sendJson('/api/v1/lab-jobs', accessToken, input, CreatedSchema);
  return response.data.id;
}

export async function setLabJobNotify(
  accessToken: string,
  jobId: string,
  notifyWhatsapp: boolean,
): Promise<boolean> {
  const response = await sendJson(
    `/api/v1/lab-jobs/${jobId}`,
    accessToken,
    { notifyWhatsapp },
    NotifySchema,
    'PATCH',
  );
  return response.data.notifyWhatsapp;
}

async function getJson<T>(path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return read(response, schema);
}

async function sendJson<T>(
  path: string,
  accessToken: string,
  body: unknown,
  schema: z.ZodType<T>,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return read(response, schema);
}

async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new LabRequestError(readMessage(payload), readCode(payload));
  }
  return parsed.data;
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

function readCode(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = payload.error;
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
      return error.code;
    }
  }
  return 'UNKNOWN';
}
