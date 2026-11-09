import { PageMetaSchema, RetailerAlertSchema, type RetailerAlert } from '@optiworld/shared';
import { z } from 'zod';

import { getAccessToken } from './auth-service';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

const ListSchema = z.object({
  success: z.literal(true),
  data: z.array(RetailerAlertSchema),
  meta: PageMetaSchema,
});

export async function loadOrgAlerts(): Promise<RetailerAlert[]> {
  const token = await requiredToken();
  const response = await fetch(
    `${API_BASE}/api/v1/alerts?includeRead=true&limit=100&category=ALL`,
    {
      headers: { authorization: `Bearer ${token}` },
    },
  );
  const payload: unknown = await response.json();
  const parsed = ListSchema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error('Alerts could not be loaded');
  }
  return parsed.data.data;
}

export async function markAllOrgAlertsRead(): Promise<void> {
  const token = await requiredToken();
  const response = await fetch(`${API_BASE}/api/v1/alerts/read-all`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error('Alerts could not be updated');
  }
}

async function requiredToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Sign in is required');
  }
  return token;
}
