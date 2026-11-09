'use client';

import {
  CustomerLedgerSchema,
  CustomerListItemSchema,
  CustomerProfileSchema,
  CustomerRecordSchema,
  PageMetaSchema,
  RecordPaymentResultSchema,
  SavedPrescriptionSchema,
  type CreateCustomerRequest,
  type ItemPrescription,
  type SavedPrescription,
  type CustomerLedger,
  type CustomerListItem,
  type CustomerListQuery,
  type CustomerProfile,
  type CustomerRecord,
  type PageMeta,
  type RecordPaymentRequest,
  type RecordPaymentResult,
  type UpdateCustomerRequest,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(CustomerListItemSchema),
  meta: PageMetaSchema,
});
const RecordResponseSchema = z.object({ success: z.literal(true), data: CustomerRecordSchema });
const ProfileResponseSchema = z.object({ success: z.literal(true), data: CustomerProfileSchema });
const LedgerResponseSchema = z.object({ success: z.literal(true), data: CustomerLedgerSchema });
const PaymentResponseSchema = z.object({
  success: z.literal(true),
  data: RecordPaymentResultSchema,
});
const PrescriptionListSchema = z.object({
  success: z.literal(true),
  data: z.array(SavedPrescriptionSchema),
});
const PrescriptionResponseSchema = z.object({
  success: z.literal(true),
  data: SavedPrescriptionSchema,
});

export async function loadCustomers(
  accessToken: string,
  query: CustomerListQuery,
): Promise<{ rows: CustomerListItem[]; meta: PageMeta }> {
  const params = new URLSearchParams({
    q: query.q,
    dues: query.dues,
    sort: query.sort,
    page: String(query.page),
    limit: String(query.limit),
  });
  if (query.gender) {
    params.set('gender', query.gender);
  }
  if (query.minAge !== undefined) {
    params.set('minAge', String(query.minAge));
  }
  if (query.maxAge !== undefined) {
    params.set('maxAge', String(query.maxAge));
  }
  if (query.minOutstanding) {
    params.set('minOutstanding', query.minOutstanding);
  }
  if (query.maxOutstanding) {
    params.set('maxOutstanding', query.maxOutstanding);
  }
  const response = await getJson(
    `/api/v1/retailer/customers?${params.toString()}`,
    accessToken,
    ListResponseSchema,
  );
  return { rows: response.data, meta: response.meta };
}

export async function createCustomerRecord(
  accessToken: string,
  input: CreateCustomerRequest,
): Promise<CustomerRecord> {
  const response = await sendJson(
    '/api/v1/retailer/customers',
    accessToken,
    'POST',
    input,
    RecordResponseSchema,
  );
  return response.data;
}

export async function deleteCustomerRecord(accessToken: string, customerId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/retailer/customers/${customerId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readMessage(payload));
  }
}

export async function loadCustomerProfile(
  accessToken: string,
  customerId: string,
): Promise<CustomerProfile> {
  const response = await getJson(
    `/api/v1/retailer/customers/${customerId}`,
    accessToken,
    ProfileResponseSchema,
  );
  return response.data;
}

export async function updateCustomerRecord(
  accessToken: string,
  customerId: string,
  input: UpdateCustomerRequest,
): Promise<CustomerRecord> {
  const response = await sendJson(
    `/api/v1/retailer/customers/${customerId}`,
    accessToken,
    'PATCH',
    input,
    RecordResponseSchema,
  );
  return response.data;
}

export async function loadCustomerLedger(
  accessToken: string,
  customerId: string,
): Promise<CustomerLedger> {
  const response = await getJson(
    `/api/v1/retailer/customers/${customerId}/ledger`,
    accessToken,
    LedgerResponseSchema,
  );
  return response.data;
}

export async function loadCustomerPrescriptions(
  accessToken: string,
  customerId: string,
): Promise<SavedPrescription[]> {
  const response = await getJson(
    `/api/v1/retailer/customers/${customerId}/prescriptions`,
    accessToken,
    PrescriptionListSchema,
  );
  return response.data;
}

export async function saveCustomerPrescription(
  accessToken: string,
  customerId: string,
  input: ItemPrescription,
): Promise<SavedPrescription> {
  const response = await sendJson(
    `/api/v1/retailer/customers/${customerId}/prescriptions`,
    accessToken,
    'POST',
    input,
    PrescriptionResponseSchema,
  );
  return response.data;
}

export async function updateCustomerPrescription(
  accessToken: string,
  customerId: string,
  prescriptionId: string,
  input: ItemPrescription,
): Promise<SavedPrescription> {
  const response = await sendJson(
    `/api/v1/retailer/customers/${customerId}/prescriptions/${prescriptionId}`,
    accessToken,
    'PATCH',
    input,
    PrescriptionResponseSchema,
  );
  return response.data;
}

export async function recordCustomerPayment(
  accessToken: string,
  customerId: string,
  input: RecordPaymentRequest,
): Promise<RecordPaymentResult> {
  const response = await sendJson(
    `/api/v1/retailer/customers/${customerId}/payments`,
    accessToken,
    'POST',
    input,
    PaymentResponseSchema,
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
  method: 'POST' | 'PATCH',
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
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
  return 'The customer request could not be completed.';
}
