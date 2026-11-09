import {
  WholesalerOrderDetailSchema,
  WholesalerOrderRowSchema,
  type OrderStatus,
  type WholesalerOrderDetail,
  type WholesalerOrderRow,
} from '@optiworld/shared';
import { z } from 'zod';

import { getAccessToken } from './auth-service';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

const ListSchema = z.object({
  success: z.literal(true),
  data: z.array(WholesalerOrderRowSchema),
  meta: z.object({
    pipeline: z.object({
      PENDING: z.number(),
      CONFIRMED: z.number(),
      DISPATCHED: z.number(),
      DELIVERED: z.number(),
    }),
  }),
});
const DetailSchema = z.object({ success: z.literal(true), data: WholesalerOrderDetailSchema });
const StatusSchema = z.object({
  success: z.literal(true),
  data: z.object({ whatsapp: z.object({ message: z.string() }) }),
});

export async function loadWholesalerOrderInbox(filters: {
  status?: OrderStatus;
  q?: string;
}): Promise<{
  orders: WholesalerOrderRow[];
  pipeline: { PENDING: number; CONFIRMED: number; DISPATCHED: number; DELIVERED: number };
}> {
  const params = new URLSearchParams();
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.q) {
    params.set('q', filters.q);
  }
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const payload = await getJson(`/api/v1/wholesaler/orders${query}`, ListSchema);
  return { orders: payload.data, pipeline: payload.meta.pipeline };
}

export async function loadWholesalerOrderDetail(orderId: string): Promise<WholesalerOrderDetail> {
  const payload = await getJson(`/api/v1/orders/${orderId}`, DetailSchema);
  return payload.data;
}

export async function updateWholesalerOrderStatus(
  orderId: string,
  status: 'DISPATCHED' | 'DELIVERED',
): Promise<string> {
  const payload = await sendJson(`/api/v1/orders/${orderId}/status`, { status }, StatusSchema);
  return payload.data.whatsapp.message;
}

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Sign in is required');
  }
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body: unknown = await response.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!response.ok || !parsed.success) {
    throw new Error(readMessage(body));
  }
  return parsed.data;
}

async function sendJson<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error('Sign in is required');
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
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
  return 'The request could not be completed';
}
