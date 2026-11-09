'use client';

import { RetailerAlertSchema, type AlertCategory, type RetailerAlert } from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const ALERTS_CHANGED_EVENT = 'optiworld:alerts-changed';

const ListSchema = z.object({
  success: z.literal(true),
  data: z.array(RetailerAlertSchema),
});
const AlertSchema = z.object({ success: z.literal(true), data: RetailerAlertSchema });

export async function loadAlerts(
  accessToken: string,
  category: AlertCategory,
): Promise<RetailerAlert[]> {
  const params = new URLSearchParams({ includeRead: 'true', limit: '100', category });
  const response = await getJson(
    `/api/v1/retailer/alerts?${params.toString()}`,
    accessToken,
    ListSchema,
  );
  return response.data;
}

export async function markAlertRead(accessToken: string, alertId: string): Promise<RetailerAlert> {
  const response = await sendJson(
    `/api/v1/retailer/alerts/${alertId}/read`,
    accessToken,
    AlertSchema,
  );
  window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
  return response.data;
}

export async function markAllAlertsRead(accessToken: string): Promise<void> {
  await sendJson(
    '/api/v1/retailer/alerts/read-all',
    accessToken,
    z.object({ success: z.literal(true) }),
  );
  window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
}

async function getJson<T>(path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return read(response, schema);
}

async function sendJson<T>(path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return read(response, schema);
}

async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error('Alerts could not be updated');
  }
  return parsed.data;
}
