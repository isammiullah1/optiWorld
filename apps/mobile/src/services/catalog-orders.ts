import {
  RetailerOrderDetailSchema,
  RetailerOrderRowSchema,
  WholesalerCatalogSchema,
  WholesalerConnectionSchema,
  WholesalerSearchHitSchema,
  type CreateRetailerOrderRequest,
  type OrderStatus,
  type RetailerOrderDetail,
  type RetailerOrderRow,
  type WholesalerCatalog,
  type WholesalerConnection,
  type WholesalerSearchHit,
} from '@optiworld/shared';
import { z } from 'zod';

import { getAccessToken } from './auth-service';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export class CatalogRequestError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'CatalogRequestError';
    this.code = code;
  }
}

export async function loadWholesalerConnections(): Promise<WholesalerConnection[]> {
  const payload = await getJson(
    '/api/v1/retailer/wholesaler-connections',
    z.object({ success: z.literal(true), data: z.array(WholesalerConnectionSchema) }),
  );
  return payload.data;
}

export async function searchWholesalerOrgs(query: string): Promise<WholesalerSearchHit[]> {
  const payload = await getJson(
    `/api/v1/retailer/wholesalers/search?q=${encodeURIComponent(query)}`,
    z.object({ success: z.literal(true), data: z.array(WholesalerSearchHitSchema) }),
  );
  return payload.data;
}

export async function requestWholesalerConnection(wholesalerOrgId: string): Promise<void> {
  await sendJson('/api/v1/retailer/wholesaler-connections', { wholesalerOrgId });
}

export async function loadWholesalerCatalog(wholesalerId: string): Promise<WholesalerCatalog> {
  const payload = await getJson(
    `/api/v1/catalog/${wholesalerId}`,
    z.object({ success: z.literal(true), data: WholesalerCatalogSchema }),
  );
  return payload.data;
}

export async function submitRetailerOrder(input: CreateRetailerOrderRequest): Promise<string> {
  const payload = await sendJson('/api/v1/orders', input);
  const parsed = z
    .object({ success: z.literal(true), data: z.object({ id: z.string().uuid() }) })
    .parse(payload);
  return parsed.data.id;
}

export async function loadRetailerOrders(status: OrderStatus | 'ALL'): Promise<RetailerOrderRow[]> {
  const query = status === 'ALL' ? '' : `?status=${status}`;
  const payload = await getJson(
    `/api/v1/retailer/orders${query}`,
    z.object({ success: z.literal(true), data: z.array(RetailerOrderRowSchema) }),
  );
  return payload.data;
}

export async function loadRetailerOrder(orderId: string): Promise<RetailerOrderDetail> {
  const payload = await getJson(
    `/api/v1/orders/${orderId}`,
    z.object({ success: z.literal(true), data: RetailerOrderDetailSchema }),
  );
  return payload.data;
}

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new CatalogRequestError('Sign in is required', 'UNAUTHORIZED');
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new CatalogRequestError(readMessage(payload), readCode(payload));
  }
  return parsed.data;
}

async function sendJson(path: string, body: unknown): Promise<unknown> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new CatalogRequestError('Sign in is required', 'UNAUTHORIZED');
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CatalogRequestError(readMessage(payload), readCode(payload));
  }
  return payload;
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
