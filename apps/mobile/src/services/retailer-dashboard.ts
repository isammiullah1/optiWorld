import {
  DashboardStatsSchema,
  PageMetaSchema,
  RetailerAlertSchema,
  RetailerInvoiceRowSchema,
  type DashboardStats,
  type RetailerAlert,
  type RetailerInvoiceRow,
} from '@optiworld/shared';
import { z } from 'zod';

import { getAccessToken } from './auth-service';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

const StatsResponseSchema = z.object({ success: z.literal(true), data: DashboardStatsSchema });
const InvoiceListSchema = z.object({
  success: z.literal(true),
  data: z.array(RetailerInvoiceRowSchema),
  meta: PageMetaSchema,
});
const AlertListSchema = z.object({
  success: z.literal(true),
  data: z.array(RetailerAlertSchema),
  meta: PageMetaSchema,
});

export type MobileDashboard = {
  stats: DashboardStats;
  invoices: RetailerInvoiceRow[];
  alerts: RetailerAlert[];
  unreadAlertCount: number;
};

export async function loadMobileDashboard(): Promise<MobileDashboard> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Sign in is required');
  }
  const [stats, invoices, alerts] = await Promise.all([
    getJson('/api/v1/retailer/dashboard/stats', accessToken, StatsResponseSchema),
    getJson('/api/v1/retailer/invoices?limit=10', accessToken, InvoiceListSchema),
    getJson('/api/v1/retailer/alerts?limit=5', accessToken, AlertListSchema),
  ]);
  return {
    stats: stats.data,
    invoices: invoices.data.slice(0, 3),
    alerts: alerts.data.slice(0, 3),
    unreadAlertCount: alerts.meta.total,
  };
}

async function getJson<T>(path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error(messageFrom(payload));
  }
  return parsed.data;
}

function messageFrom(payload: unknown): string {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null &&
    'message' in payload.error &&
    typeof payload.error.message === 'string'
  ) {
    return payload.error.message;
  }
  return 'The dashboard could not be loaded.';
}
