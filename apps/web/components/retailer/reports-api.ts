'use client';

import {
  CreditReportSchema,
  InventoryReportSchema,
  SalesReportSchema,
  type CreditReport,
  type InventoryReport,
  type ReportType,
  type SalesReport,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const SalesResponseSchema = z.object({ success: z.literal(true), data: SalesReportSchema });
const InventoryResponseSchema = z.object({ success: z.literal(true), data: InventoryReportSchema });
const CreditResponseSchema = z.object({ success: z.literal(true), data: CreditReportSchema });

export function defaultReportRange(now = new Date()): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${to}T00:00:00.000Z`) - 29 * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to };
}

export async function loadSalesReport(
  accessToken: string,
  from: string,
  to: string,
): Promise<SalesReport> {
  const response = await getJson(
    `/api/v1/retailer/reports/sales?from=${from}&to=${to}`,
    accessToken,
    SalesResponseSchema,
  );
  return response.data;
}

export async function loadInventoryReport(
  accessToken: string,
  from: string,
  to: string,
): Promise<InventoryReport> {
  const response = await getJson(
    `/api/v1/retailer/reports/inventory?from=${from}&to=${to}`,
    accessToken,
    InventoryResponseSchema,
  );
  return response.data;
}

export async function loadCreditReport(accessToken: string): Promise<CreditReport> {
  const response = await getJson(
    '/api/v1/retailer/reports/credit',
    accessToken,
    CreditResponseSchema,
  );
  return response.data;
}

export async function clearInvoiceCredit(
  accessToken: string,
  invoiceId: string,
  amount: string,
): Promise<void> {
  await sendJson(`/api/v1/retailer/invoices/${invoiceId}/clear-credit`, accessToken, 'POST', {
    amount,
  });
}

export async function removeSale(accessToken: string, invoiceId: string): Promise<void> {
  await sendJson(`/api/v1/retailer/invoices/${invoiceId}`, accessToken, 'DELETE');
}

export async function downloadReport(
  accessToken: string,
  reportType: ReportType,
  from: string,
  to: string,
  format: 'xlsx' | 'pdf',
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/retailer/reports/export`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ reportType, dateRange: { from, to }, format }),
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new Error(readMessage(payload));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${reportType.toLowerCase()}-report.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

async function sendJson(
  path: string,
  accessToken: string,
  method: 'POST' | 'DELETE',
  body?: unknown,
): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readMessage(payload));
  }
}

async function getJson<T>(path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
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
  return 'The report could not be loaded';
}
