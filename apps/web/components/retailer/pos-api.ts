'use client';

import {
  ConnectedLabSchema,
  CreatePosInvoiceSchema,
  InvoiceNoticeSchema,
  CustomerSearchHitSchema,
  InventorySearchHitSchema,
  PosReceiptSchema,
  SendReceiptResultSchema,
  type ConnectedLab,
  type CreatePosInvoiceRequest,
  type InvoiceNotice,
  type ReceiptPrescription,
  type CustomerSearchHit,
  type InventorySearchHit,
  type PosReceipt,
  type SendReceiptResult,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const InventoryResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(InventorySearchHitSchema),
});
const CustomerResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(CustomerSearchHitSchema),
});
const LabResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(ConnectedLabSchema),
});
const ReceiptResponseSchema = z.object({ success: z.literal(true), data: PosReceiptSchema });
const NoticeResponseSchema = z.object({ success: z.literal(true), data: InvoiceNoticeSchema });
const WhatsAppResponseSchema = z.object({
  success: z.literal(true),
  data: SendReceiptResultSchema,
});

export async function searchPosInventory(
  accessToken: string,
  query: string,
): Promise<InventorySearchHit[]> {
  const response = await getJson(
    `/api/v1/retailer/inventory/search?q=${encodeURIComponent(query)}`,
    accessToken,
    InventoryResponseSchema,
  );
  return response.data;
}

export async function searchPosCustomers(
  accessToken: string,
  query: string,
): Promise<CustomerSearchHit[]> {
  const response = await getJson(
    `/api/v1/retailer/customers/search?q=${encodeURIComponent(query)}`,
    accessToken,
    CustomerResponseSchema,
  );
  return response.data;
}

export async function loadConnectedLabs(accessToken: string): Promise<ConnectedLab[]> {
  const response = await getJson('/api/v1/retailer/laboratories', accessToken, LabResponseSchema);
  return response.data;
}

export async function createPosInvoice(
  accessToken: string,
  input: CreatePosInvoiceRequest,
): Promise<PosReceipt> {
  CreatePosInvoiceSchema.parse(input);
  const response = await sendJson(
    '/api/v1/retailer/invoices',
    accessToken,
    input,
    ReceiptResponseSchema,
  );
  return response.data;
}

export async function loadPosReceipt(accessToken: string, invoiceId: string): Promise<PosReceipt> {
  const response = await getJson(
    `/api/v1/retailer/invoices/${invoiceId}/receipt`,
    accessToken,
    ReceiptResponseSchema,
  );
  return response.data;
}

export async function cancelPosInvoice(
  accessToken: string,
  invoiceId: string,
  reason: string,
): Promise<InvoiceNotice> {
  const response = await sendJson(
    `/api/v1/retailer/invoices/${invoiceId}/cancel`,
    accessToken,
    { reason },
    NoticeResponseSchema,
  );
  return response.data;
}

export async function sendInvoiceLab(
  accessToken: string,
  invoiceId: string,
  labOrgId: string,
): Promise<InvoiceNotice> {
  const response = await sendJson(
    `/api/v1/retailer/invoices/${invoiceId}/lab`,
    accessToken,
    { labOrgId },
    NoticeResponseSchema,
  );
  return response.data;
}

export async function unsendInvoiceLab(
  accessToken: string,
  invoiceId: string,
): Promise<InvoiceNotice> {
  const response = await sendJson(
    `/api/v1/retailer/invoices/${invoiceId}/lab/unsend`,
    accessToken,
    {},
    NoticeResponseSchema,
  );
  return response.data;
}

export async function cancelInvoiceLab(
  accessToken: string,
  invoiceId: string,
  reason: string,
): Promise<InvoiceNotice> {
  const response = await sendJson(
    `/api/v1/retailer/invoices/${invoiceId}/lab/cancel`,
    accessToken,
    { reason },
    NoticeResponseSchema,
  );
  return response.data;
}

export async function finalizeInvoiceLab(
  accessToken: string,
  invoiceId: string,
  input: {
    prescriptions: readonly { itemId: string; prescription: ReceiptPrescription }[];
    additions: readonly {
      inventoryBatchId: string;
      quantity: number;
      unitPrice: string;
      prescription?: ReceiptPrescription;
    }[];
  },
): Promise<InvoiceNotice> {
  const response = await sendJson(
    `/api/v1/retailer/invoices/${invoiceId}/finalize-lab`,
    accessToken,
    input,
    NoticeResponseSchema,
  );
  return response.data;
}

export async function updateInvoicePrescription(
  accessToken: string,
  invoiceId: string,
  items: readonly { itemId: string; prescription: ReceiptPrescription }[],
): Promise<InvoiceNotice> {
  const response = await sendJson(
    `/api/v1/retailer/invoices/${invoiceId}/prescription`,
    accessToken,
    { items },
    NoticeResponseSchema,
  );
  return response.data;
}

export async function sendPosReceipt(
  accessToken: string,
  invoiceId: string,
): Promise<SendReceiptResult> {
  const response = await sendJson(
    '/api/v1/whatsapp/send-receipt',
    accessToken,
    { invoiceId },
    WhatsAppResponseSchema,
  );
  return response.data;
}

async function getJson<T>(path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return readResponse(response, schema);
}

async function sendJson<T>(
  path: string,
  accessToken: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return readResponse(response, schema);
}

async function readResponse<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
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
  return 'The sale could not be completed.';
}
