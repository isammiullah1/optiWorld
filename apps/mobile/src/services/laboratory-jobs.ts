import {
  LabBoardJobSchema,
  LabBoardSchema,
  type JobStatus,
  type LabBoard,
  type LabBoardJob,
} from '@optiworld/shared';
import { z } from 'zod';

import { getAccessToken } from './auth-service';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function loadLaboratoryJobs(): Promise<LabBoard> {
  const payload = await getJson(
    '/api/v1/lab/jobs',
    z.object({ success: z.literal(true), data: LabBoardSchema }),
  );
  return payload.data;
}

export async function loadLaboratoryJob(jobId: string): Promise<LabBoardJob> {
  const payload = await getJson(
    `/api/v1/lab/jobs/${jobId}`,
    z.object({ success: z.literal(true), data: LabBoardJobSchema }),
  );
  return payload.data;
}

export async function advanceLaboratoryJob(jobId: string, status: JobStatus): Promise<LabBoardJob> {
  const payload = await sendJson(
    `/api/v1/lab-jobs/${jobId}/status`,
    { status },
    z.object({ success: z.literal(true), data: LabBoardJobSchema }),
  );
  return payload.data;
}

export async function setLaboratoryUrgent(jobId: string, isUrgent: boolean): Promise<void> {
  await sendJson(
    `/api/v1/lab-jobs/${jobId}/urgent`,
    { isUrgent },
    z.object({ success: z.literal(true) }),
  );
}

export async function saveLaboratoryNotes(jobId: string, notes: string): Promise<void> {
  await sendJson(
    `/api/v1/lab-jobs/${jobId}/notes`,
    { notes },
    z.object({ success: z.literal(true) }),
  );
}

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Sign in is required');
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return read(response, schema);
}

async function sendJson<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Sign in is required');
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return read(response, schema);
}

async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const json: unknown = await response.json();
  const parsed = schema.safeParse(json);
  if (!response.ok || !parsed.success) {
    throw new Error('The laboratory request failed');
  }
  return parsed.data;
}
