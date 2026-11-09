import {
  LabClientRowSchema,
  LabRequestListsSchema,
  LabInventoryItemSchema,
  LabJobActivitySchema,
  WholesalerCatalogItemSchema,
  WholesalerConnectionListsSchema,
  WholesalerDashboardSchema,
  WholesalerOrderActivitySchema,
  WholesalerShellSchema,
  type LabClientRow,
  type LabRequestLists,
  type LabInventoryItem,
  type LabJobActivity,
  type WholesalerCatalogItem,
  type WholesalerConnectionLists,
  type WholesalerDashboard,
  type WholesalerOrderActivity,
  type WholesalerShell,
} from '@optiworld/shared';
import { z } from 'zod';

import { getAccessToken } from './auth-service';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export function loadWholesalerShell(): Promise<WholesalerShell> {
  return getData('/api/v1/wholesaler/shell', WholesalerShellSchema);
}

export function loadWholesalerDashboard(): Promise<WholesalerDashboard> {
  return getData('/api/v1/wholesaler/dashboard', WholesalerDashboardSchema);
}

export function loadWholesalerCatalog(): Promise<WholesalerCatalogItem[]> {
  return getData('/api/v1/wholesaler/catalog', z.array(WholesalerCatalogItemSchema));
}

export function loadWholesalerRetailers(): Promise<WholesalerConnectionLists> {
  return getData('/api/v1/wholesaler/connections', WholesalerConnectionListsSchema);
}

export function loadWholesalerActivity(from: string, to: string): Promise<WholesalerOrderActivity> {
  return getData(
    `/api/v1/wholesaler/reports/order-activity?from=${from}&to=${to}`,
    WholesalerOrderActivitySchema,
  );
}

export function loadMobileLabInventory(): Promise<LabInventoryItem[]> {
  return getData('/api/v1/lab/inventory', z.array(LabInventoryItemSchema));
}

export function loadMobileLabRequests(): Promise<LabRequestLists> {
  return getData('/api/v1/lab/connections', LabRequestListsSchema);
}

export async function respondToLabRequest(
  requestId: string,
  decision: 'approve' | 'decline',
): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Sign in is required');
  }
  const response = await fetch(`${API_BASE}/api/v1/lab/connections/${requestId}/${decision}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(
      decision === 'approve'
        ? 'The request could not be accepted'
        : 'The request could not be declined',
    );
  }
}

export function loadMobileLabClients(): Promise<LabClientRow[]> {
  return getData('/api/v1/lab/clients', z.array(LabClientRowSchema));
}

export function loadMobileLabActivity(from: string, to: string): Promise<LabJobActivity> {
  return getData(`/api/v1/lab/reports/job-activity?from=${from}&to=${to}`, LabJobActivitySchema);
}

async function getData<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Sign in is required');
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const payload: unknown = await response.json();
  const parsed = z.object({ success: z.literal(true), data: schema }).safeParse(payload);
  if (!response.ok || !parsed.success || parsed.data.data === undefined) {
    throw new Error('This list could not be loaded');
  }
  return parsed.data.data;
}

export function recentUtcRange(days: number): { from: string; to: string } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
