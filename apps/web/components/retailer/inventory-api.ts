'use client';

import {
  InventoryBatchSchema,
  InventoryDetailSchema,
  InventoryListSchema,
  RetailerSettingsSchema,
  StockMovementSchema,
  type AdjustStockRequest,
  type CreateInventoryRequest,
  type InventoryBatchRecord,
  type InventoryCategoryRule,
  type InventoryDetail,
  type InventoryListQuery,
  type RetailerSettings,
  type UpdateRetailerSettingsRequest,
  type StockMovementRow,
  type UpdateInventoryRequest,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ListResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    rows: z.array(InventoryBatchSchema),
    categories: z.array(z.string()),
    categoryRules: z.array(z.object({ name: z.string(), prescriptionRequired: z.boolean() })),
  }),
  meta: InventoryListSchema.shape.meta,
});
const BatchResponseSchema = z.object({ success: z.literal(true), data: InventoryBatchSchema });
const DetailResponseSchema = z.object({ success: z.literal(true), data: InventoryDetailSchema });
const MovementsResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(StockMovementSchema),
});
const SettingsResponseSchema = z.object({ success: z.literal(true), data: RetailerSettingsSchema });

export async function loadInventory(
  accessToken: string,
  query: InventoryListQuery,
): Promise<{
  rows: InventoryBatchRecord[];
  categories: string[];
  categoryRules: InventoryCategoryRule[];
  total: number;
}> {
  const params = new URLSearchParams({
    q: query.q,
    category: query.category,
    page: String(query.page),
    limit: String(query.limit),
  });
  if (query.lowStock) {
    params.set('lowStock', 'true');
  }
  if (query.bestSelling) {
    params.set('bestSelling', 'true');
  }
  if (query.mostProfitable) {
    params.set('mostProfitable', 'true');
  }
  if (query.archived) {
    params.set('archived', 'true');
  }
  if (query.sort) {
    params.set('sort', query.sort);
  }
  if (query.minPrice) {
    params.set('minPrice', query.minPrice);
  }
  if (query.maxPrice) {
    params.set('maxPrice', query.maxPrice);
  }
  if (query.minStock !== undefined) {
    params.set('minStock', String(query.minStock));
  }
  if (query.maxStock !== undefined) {
    params.set('maxStock', String(query.maxStock));
  }
  const response = await getJson(
    `/api/v1/retailer/inventory?${params.toString()}`,
    accessToken,
    ListResponseSchema,
  );
  return {
    rows: response.data.rows,
    categories: response.data.categories,
    categoryRules: response.data.categoryRules,
    total: response.meta.total,
  };
}

export async function createInventoryBatch(
  accessToken: string,
  input: CreateInventoryRequest,
): Promise<InventoryBatchRecord> {
  const response = await sendJson(
    '/api/v1/retailer/inventory',
    accessToken,
    'POST',
    input,
    BatchResponseSchema,
  );
  return response.data;
}

export async function deleteInventoryBatch(
  accessToken: string,
  batchId: string,
  reason: string,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/retailer/inventory/${batchId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(readMessage(payload));
  }
}

export async function restoreInventoryBatch(
  accessToken: string,
  batchId: string,
  reason: string,
): Promise<InventoryBatchRecord> {
  const response = await sendJson(
    `/api/v1/retailer/inventory/${batchId}/restore`,
    accessToken,
    'POST',
    { reason },
    BatchResponseSchema,
  );
  return response.data;
}

export async function updateInventoryBatch(
  accessToken: string,
  batchId: string,
  input: UpdateInventoryRequest,
): Promise<InventoryBatchRecord> {
  const response = await sendJson(
    `/api/v1/retailer/inventory/${batchId}`,
    accessToken,
    'PATCH',
    input,
    BatchResponseSchema,
  );
  return response.data;
}

export async function loadInventoryDetail(
  accessToken: string,
  batchId: string,
): Promise<InventoryDetail> {
  const response = await getJson(
    `/api/v1/retailer/inventory/${batchId}`,
    accessToken,
    DetailResponseSchema,
  );
  return response.data;
}

export async function loadStockMovements(
  accessToken: string,
  batchId: string,
): Promise<StockMovementRow[]> {
  const response = await getJson(
    `/api/v1/retailer/inventory/${batchId}/movements`,
    accessToken,
    MovementsResponseSchema,
  );
  return response.data;
}

export async function adjustInventoryStock(
  accessToken: string,
  batchId: string,
  input: AdjustStockRequest,
): Promise<InventoryDetail> {
  const response = await sendJson(
    `/api/v1/retailer/inventory/${batchId}/adjust`,
    accessToken,
    'POST',
    input,
    DetailResponseSchema,
  );
  return response.data;
}

export async function loadRetailerSettings(accessToken: string): Promise<RetailerSettings> {
  const response = await getJson('/api/v1/retailer/settings', accessToken, SettingsResponseSchema);
  return response.data;
}

export async function saveRetailerSettings(
  accessToken: string,
  input: UpdateRetailerSettingsRequest,
): Promise<RetailerSettings> {
  const response = await sendJson(
    '/api/v1/retailer/settings',
    accessToken,
    'PATCH',
    input,
    SettingsResponseSchema,
  );
  return response.data;
}

export async function uploadBillLogo(
  accessToken: string,
  image: string,
): Promise<RetailerSettings> {
  const response = await sendJson(
    '/api/v1/retailer/bill-logo',
    accessToken,
    'POST',
    { image },
    SettingsResponseSchema,
  );
  return response.data;
}

export async function removeBillLogo(accessToken: string): Promise<RetailerSettings> {
  const response = await fetch(`${API_BASE}/api/v1/retailer/bill-logo`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const parsed = await read(response, SettingsResponseSchema);
  return parsed.data;
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
  return 'The inventory request could not be completed.';
}
