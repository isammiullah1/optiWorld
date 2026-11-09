import {
  CustomerLedgerSchema,
  CustomerListItemSchema,
  CustomerProfileSchema,
  CustomerRecordSchema,
  PageMetaSchema,
  RecordPaymentResultSchema,
  type CreateCustomerRequest,
  type CustomerLedger,
  type CustomerListItem,
  type CustomerListQuery,
  type CustomerProfile,
  type CustomerRecord,
  type RecordPaymentRequest,
  type RecordPaymentResult,
} from '@optiworld/shared';
import { z } from 'zod';

import { getAccessToken } from './auth-service';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function loadMobileCustomers(query: CustomerListQuery): Promise<CustomerListItem[]> {
  const params = new URLSearchParams({
    q: query.q,
    dues: query.dues,
    sort: query.sort,
    page: String(query.page),
    limit: String(query.limit),
  });
  const response = await getJson(
    `/api/v1/retailer/customers?${params.toString()}`,
    z.object({
      success: z.literal(true),
      data: z.array(CustomerListItemSchema),
      meta: PageMetaSchema,
    }),
  );
  return response.data;
}

export async function createMobileCustomer(input: CreateCustomerRequest): Promise<CustomerRecord> {
  const response = await send(
    '/api/v1/retailer/customers',
    'POST',
    input,
    z.object({ success: z.literal(true), data: CustomerRecordSchema }),
  );
  return response.data;
}

export async function loadMobileCustomer(customerId: string): Promise<CustomerProfile> {
  const response = await getJson(
    `/api/v1/retailer/customers/${customerId}`,
    z.object({ success: z.literal(true), data: CustomerProfileSchema }),
  );
  return response.data;
}

export async function loadMobileLedger(customerId: string): Promise<CustomerLedger> {
  const response = await getJson(
    `/api/v1/retailer/customers/${customerId}/ledger`,
    z.object({ success: z.literal(true), data: CustomerLedgerSchema }),
  );
  return response.data;
}

export async function recordMobilePayment(
  customerId: string,
  input: RecordPaymentRequest,
): Promise<RecordPaymentResult> {
  const response = await send(
    `/api/v1/retailer/customers/${customerId}/payments`,
    'POST',
    input,
    z.object({ success: z.literal(true), data: RecordPaymentResultSchema }),
  );
  return response.data;
}

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const token = await requiredToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return read(response, schema);
}

async function send<T>(
  path: string,
  method: 'POST' | 'PATCH',
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const token = await requiredToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return read(response, schema);
}

async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error('The customer request could not be completed.');
  }
  return parsed.data;
}

async function requiredToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Sign in is required');
  }
  return token;
}
