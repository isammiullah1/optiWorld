'use client';

import {
  RetailerOrderDetailSchema,
  RetailerOrderRowSchema,
  WholesalerCatalogSchema,
  WholesalerConnectionSchema,
  WholesalerSearchHitSchema,
  type CreateRetailerOrderRequest,
  type RetailerOrderDetail,
  type RetailerOrderRow,
  type WholesalerCatalog,
  type WholesalerConnection,
  type WholesalerSearchHit,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ConnectionListSchema = z.object({
  success: z.literal(true),
  data: z.array(WholesalerConnectionSchema),
});
const SearchSchema = z.object({
  success: z.literal(true),
  data: z.array(WholesalerSearchHitSchema),
});
const ConnectionSchema = z.object({ success: z.literal(true), data: WholesalerConnectionSchema });
const CatalogSchema = z.object({ success: z.literal(true), data: WholesalerCatalogSchema });
const OrderCreatedSchema = z.object({
  success: z.literal(true),
  data: z.object({ id: z.string().uuid() }),
});
const OrderListSchema = z.object({
  success: z.literal(true),
  data: z.array(RetailerOrderRowSchema),
  meta: z
    .object({
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
    })
    .optional(),
});
const OrderDetailSchema = z.object({ success: z.literal(true), data: RetailerOrderDetailSchema });

export class CatalogRequestError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'CatalogRequestError';
    this.code = code;
  }
}

export async function loadWholesalerConnections(
  accessToken: string,
): Promise<WholesalerConnection[]> {
  const response = await getJson(
    '/api/v1/retailer/wholesaler-connections',
    accessToken,
    ConnectionListSchema,
  );
  return response.data;
}

export async function searchWholesalerOrgs(
  accessToken: string,
  query: string,
): Promise<WholesalerSearchHit[]> {
  const response = await getJson(
    `/api/v1/retailer/wholesalers/search?q=${encodeURIComponent(query)}`,
    accessToken,
    SearchSchema,
  );
  return response.data;
}

export async function requestWholesalerConnection(
  accessToken: string,
  wholesalerOrgId: string,
): Promise<WholesalerConnection> {
  const response = await sendJson(
    '/api/v1/retailer/wholesaler-connections',
    accessToken,
    { wholesalerOrgId },
    ConnectionSchema,
  );
  return response.data;
}

export async function respondToWholesalerConnection(
  accessToken: string,
  connectionId: string,
  accept: boolean,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/v1/retailer/wholesaler-connections/${connectionId}/${accept ? 'approve' : 'decline'}`,
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  await read(response, z.object({ success: z.literal(true) }));
}

export async function cancelWholesalerConnection(
  accessToken: string,
  connectionId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/v1/retailer/wholesaler-connections/${connectionId}/cancel`,
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  await read(response, z.object({ success: z.literal(true) }));
}

export async function disconnectWholesaler(
  accessToken: string,
  connectionId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/v1/retailer/wholesaler-connections/${connectionId}/disconnect`,
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({}),
    },
  );
  await read(response, z.object({ success: z.literal(true) }));
}

export async function loadWholesalerCatalog(
  accessToken: string,
  wholesalerId: string,
): Promise<WholesalerCatalog> {
  const response = await getJson(`/api/v1/catalog/${wholesalerId}`, accessToken, CatalogSchema);
  return response.data;
}

export async function submitRetailerOrder(
  accessToken: string,
  input: CreateRetailerOrderRequest,
): Promise<string> {
  const response = await sendJson('/api/v1/orders', accessToken, input, OrderCreatedSchema);
  return response.data.id;
}

export async function loadRetailerOrders(accessToken: string): Promise<RetailerOrderRow[]> {
  const rows: RetailerOrderRow[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (rows.length < total && page <= 20) {
    const response = await getJson(
      `/api/v1/retailer/orders?page=${page}&limit=100`,
      accessToken,
      OrderListSchema,
    );
    rows.push(...response.data);
    total = response.meta?.total ?? rows.length;
    if (response.data.length === 0) {
      break;
    }
    page += 1;
  }
  return rows;
}

export async function loadRetailerOrder(
  accessToken: string,
  orderId: string,
): Promise<RetailerOrderDetail> {
  const response = await getJson(`/api/v1/orders/${orderId}`, accessToken, OrderDetailSchema);
  return response.data;
}

export async function updateRetailerOrderItems(
  accessToken: string,
  orderId: string,
  items: ReadonlyArray<{ catalogProductId: string; quantity: number }>,
): Promise<void> {
  await sendJson(
    `/api/v1/orders/${orderId}/items`,
    accessToken,
    { items },
    SavedOrderSchema,
    'PATCH',
  );
}

export async function cancelRetailerOrder(accessToken: string, orderId: string): Promise<void> {
  await sendJson(`/api/v1/orders/${orderId}/cancel`, accessToken, {}, SavedOrderSchema);
}

export async function requestRetailerOrderCancellation(
  accessToken: string,
  orderId: string,
): Promise<string> {
  const response = await sendJson(
    `/api/v1/orders/${orderId}/cancel-request`,
    accessToken,
    {},
    z.object({ success: z.literal(true), data: z.object({ id: z.string(), message: z.string() }) }),
  );
  return response.data.message;
}

async function getJson<T>(path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  return read(response, schema);
}

const SavedOrderSchema = z.object({ success: z.literal(true), data: z.object({ id: z.string() }) });

async function sendJson<T>(
  path: string,
  accessToken: string,
  body: unknown,
  schema: z.ZodType<T>,
  method: 'POST' | 'PATCH' = 'POST',
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return read(response, schema);
}

async function read<T>(response: Response, schema: z.ZodType<T>): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new CatalogRequestError(readMessage(payload), readCode(payload));
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
  return 'The request could not be completed';
}

function readCode(payload: unknown): string {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const error = payload.error;
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
      return error.code;
    }
  }
  return 'UNKNOWN';
}
