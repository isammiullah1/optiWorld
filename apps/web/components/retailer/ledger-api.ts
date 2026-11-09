'use client';

import {
  AgingReportSchema,
  CustomerCreditBillsSchema,
  LedgerSummarySchema,
  ReminderSendResultSchema,
  type AgingReport,
  type CustomerCreditBills,
  type LedgerSummary,
  type ReminderSendResult,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const SummaryResponseSchema = z.object({ success: z.literal(true), data: LedgerSummarySchema });
const AgingResponseSchema = z.object({ success: z.literal(true), data: AgingReportSchema });
const SendResponseSchema = z.object({ success: z.literal(true), data: ReminderSendResultSchema });
const CreditBillsResponseSchema = z.object({
  success: z.literal(true),
  data: CustomerCreditBillsSchema,
});
const PaymentResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ outstanding: z.string(), paymentIds: z.array(z.string()) }),
});

export async function loadLedgerSummary(accessToken: string): Promise<LedgerSummary> {
  const response = await getJson(
    '/api/v1/retailer/ledger/summary',
    accessToken,
    SummaryResponseSchema,
  );
  return response.data;
}

export async function loadAgingReport(accessToken: string): Promise<AgingReport> {
  const response = await getJson('/api/v1/retailer/ledger/aging', accessToken, AgingResponseSchema);
  return response.data;
}

export async function downloadAgingWorkbook(accessToken: string): Promise<void> {
  await downloadLedgerFile(
    accessToken,
    '/api/v1/retailer/ledger/aging/export',
    'aging-report.xlsx',
  );
}

export async function downloadAgingPdf(accessToken: string): Promise<void> {
  await downloadLedgerFile(
    accessToken,
    '/api/v1/retailer/ledger/aging/export-pdf',
    'aging-report.pdf',
  );
}

async function downloadLedgerFile(
  accessToken: string,
  path: string,
  filename: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new Error(readMessage(payload));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function loadCustomerCreditBills(
  accessToken: string,
  customerId: string,
): Promise<CustomerCreditBills> {
  const response = await getJson(
    `/api/v1/retailer/customers/${customerId}/credit-bills`,
    accessToken,
    CreditBillsResponseSchema,
  );
  return response.data;
}

export async function receiveCustomerCredit(
  accessToken: string,
  customerId: string,
  amount: string,
): Promise<void> {
  await sendJson(
    `/api/v1/retailer/customers/${customerId}/payments`,
    accessToken,
    {
      amount,
      recordedAt: new Date().toISOString(),
      method: 'CASH',
      notes: 'Amount received',
    },
    PaymentResponseSchema,
  );
}

export async function sendPaymentReminders(
  accessToken: string,
  customerIds: string[],
): Promise<ReminderSendResult> {
  const response = await sendJson(
    '/api/v1/whatsapp/send-payment-reminder',
    accessToken,
    { customerIds },
    SendResponseSchema,
  );
  return response.data;
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
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return read(response, schema);
}

async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error(readMessage(payload));
  }
  return parsed.data;
}

function readMessage(payload: unknown): string {
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
  return 'The ledger request could not be completed.';
}
