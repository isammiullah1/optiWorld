'use client';

import {
  DeliveryListSchema,
  MarkDeliveredResultSchema,
  type DeliveryList,
  type MarkDeliveredResult,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ListSchema = z.object({ success: z.literal(true), data: DeliveryListSchema });
const DeliveredSchema = z.object({ success: z.literal(true), data: MarkDeliveredResultSchema });

export async function loadDeliveries(
  accessToken: string,
  query: { readyPage: number; deliveredPage: number; limit: number },
): Promise<DeliveryList> {
  const params = new URLSearchParams({
    readyPage: String(query.readyPage),
    deliveredPage: String(query.deliveredPage),
    limit: String(query.limit),
  });
  const response = await fetch(`${API_BASE}/api/v1/retailer/deliveries?${params.toString()}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload: unknown = await response.json().catch(() => null);
  const parsed = ListSchema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error(readMessage(payload));
  }
  return parsed.data.data;
}

export async function markDeliveryDelivered(
  accessToken: string,
  deliveryId: string,
): Promise<MarkDeliveredResult> {
  const response = await fetch(`${API_BASE}/api/v1/retailer/deliveries/${deliveryId}/deliver`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: '{}',
  });
  const payload: unknown = await response.json().catch(() => null);
  const parsed = DeliveredSchema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error(readMessage(payload));
  }
  return parsed.data.data;
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
