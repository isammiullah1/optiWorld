'use client';

import { RetailerAlertSchema, type RetailerAlert } from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ListSchema = z.object({
  success: z.literal(true),
  data: z.array(RetailerAlertSchema),
  meta: z.object({ total: z.number().int().nonnegative() }),
});
const AlertSchema = z.object({ success: z.literal(true), data: RetailerAlertSchema });

export async function loadWholesalerAlerts(accessToken: string): Promise<RetailerAlert[]> {
  const response = await getJson(
    '/api/v1/alerts?includeRead=true&limit=100&category=ALL',
    accessToken,
    ListSchema,
  );
  return response.data;
}

export async function markWholesalerAlertRead(
  accessToken: string,
  alertId: string,
): Promise<RetailerAlert> {
  const response = await sendJson(`/api/v1/alerts/${alertId}/read`, accessToken, AlertSchema);
  return response.data;
}

export async function markAllWholesalerAlertsRead(accessToken: string): Promise<void> {
  await sendJson('/api/v1/alerts/read-all', accessToken, z.object({ success: z.literal(true) }));
}

async function getJson<T>(path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return read(response, schema, 'Notifications could not be loaded');
}

async function sendJson<T>(path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return read(response, schema, 'Notifications could not be updated');
}

async function read<T>(response: Response, schema: z.ZodType<T>, fallback: string): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error(fallback);
  }
  return parsed.data;
}
