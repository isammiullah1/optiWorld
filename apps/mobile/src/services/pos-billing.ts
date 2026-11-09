import {
  ConnectedLabSchema,
  CustomerSearchHitSchema,
  InventorySearchHitSchema,
  PosReceiptSchema,
  SendReceiptResultSchema,
  type ConnectedLab,
  type CreatePosInvoiceRequest,
  type CustomerSearchHit,
  type InventorySearchHit,
  type PosReceipt,
  type SendReceiptResult,
} from '@optiworld/shared';
import { z } from 'zod';

import { getAccessToken } from './auth-service';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export async function searchMobileInventory(query: string): Promise<InventorySearchHit[]> {
  return getList(
    `/api/v1/retailer/inventory/search?q=${encodeURIComponent(query)}`,
    z.array(InventorySearchHitSchema),
  );
}

export async function searchMobileCustomers(query: string): Promise<CustomerSearchHit[]> {
  return getList(
    `/api/v1/retailer/customers/search?q=${encodeURIComponent(query)}`,
    z.array(CustomerSearchHitSchema),
  );
}

export async function loadMobileLabs(): Promise<ConnectedLab[]> {
  return getList('/api/v1/retailer/laboratories', z.array(ConnectedLabSchema));
}

export async function createMobileInvoice(input: CreatePosInvoiceRequest): Promise<PosReceipt> {
  return send('/api/v1/retailer/invoices', input, PosReceiptSchema);
}

export async function loadMobileReceipt(invoiceId: string): Promise<PosReceipt> {
  return getList(`/api/v1/retailer/invoices/${invoiceId}/receipt`, PosReceiptSchema);
}

export async function sendMobileReceipt(invoiceId: string): Promise<SendReceiptResult> {
  return send('/api/v1/whatsapp/send-receipt', { invoiceId }, SendReceiptResultSchema);
}

async function getList<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const token = await requiredToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return read(response, schema);
}

async function send<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const token = await requiredToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return read(response, schema);
}

async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const payload: unknown = await response.json();
  const envelope = z.object({ success: z.literal(true), data: z.unknown() }).safeParse(payload);
  if (!response.ok || !envelope.success) {
    throw new Error('The sale could not be completed.');
  }
  return schema.parse(envelope.data.data);
}

async function requiredToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Sign in is required');
  }
  return token;
}
