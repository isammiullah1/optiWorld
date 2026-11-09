'use client';

import {
  DashboardStatsSchema,
  PageMetaSchema,
  RetailerAlertSchema,
  RetailerInvoiceDetailSchema,
  RetailerInvoiceRowSchema,
  type DashboardStats,
  type PageMeta,
  type RetailerAlert,
  type RetailerInvoiceDetail,
  type RetailerInvoiceRow,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
const InvoiceDetailResponseSchema = z.object({
  success: z.literal(true),
  data: RetailerInvoiceDetailSchema,
});

export type DashboardPayload = {
  stats: DashboardStats;
  invoices: RetailerInvoiceRow[];
  invoiceMeta: PageMeta;
  alerts: RetailerAlert[];
  alertMeta: PageMeta;
};

export async function loadDashboardAlerts(accessToken: string): Promise<RetailerAlert[]> {
  const alerts = await getJson('/api/v1/retailer/alerts?limit=40', accessToken, AlertListSchema);
  return alerts.data;
}

export async function loadRetailerDashboard(accessToken: string): Promise<DashboardPayload> {
  const [stats, invoices, alerts] = await Promise.all([
    getJson('/api/v1/retailer/dashboard/stats', accessToken, StatsResponseSchema),
    getJson('/api/v1/retailer/invoices?limit=10', accessToken, InvoiceListSchema),
    getJson('/api/v1/retailer/alerts?limit=5', accessToken, AlertListSchema),
  ]);
  return {
    stats: stats.data,
    invoices: invoices.data,
    invoiceMeta: invoices.meta,
    alerts: alerts.data,
    alertMeta: alerts.meta,
  };
}

export async function loadRetailerInvoice(
  accessToken: string,
  invoiceId: string,
): Promise<RetailerInvoiceDetail> {
  const response = await getJson(
    `/api/v1/retailer/invoices/${invoiceId}`,
    accessToken,
    InvoiceDetailResponseSchema,
  );
  return response.data;
}

async function getJson<T>(path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error(readError(payload));
  }
  return parsed.data;
}

function readError(payload: unknown): string {
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
