'use client';

import {
  QuoteRequestSchema,
  WholesalerCatalogActivitySchema,
  WholesalerCatalogItemSchema,
  WholesalerConnectionListsSchema,
  WholesalerDashboardSchema,
  WholesalerListingProfileSchema,
  WholesalerOrderActivitySchema,
  WholesalerOrderDetailSchema,
  WholesalerOrderRowSchema,
  WholesalerRetailerConnectionSchema,
  WholesalerShellSchema,
  RetailerSearchHitSchema,
  type RetailerSearchHit,
  type QuoteRequest,
  type SaveCatalogProductRequest,
  type VisibilityMode,
  type UpdateWholesalerListingProfileRequest,
  type WholesalerCatalogActivity,
  type WholesalerCatalogItem,
  type WholesalerConnectionLists,
  type WholesalerDashboard,
  type WholesalerListingProfile,
  type WholesalerOrderActivity,
  type OrderStatus,
  type WholesalerOrderDetail,
  type WholesalerOrderRow,
  type WholesalerShell,
} from '@optiworld/shared';
import { z } from 'zod';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const WHOLESALER_ORDERS_CHANGED = 'optiworld:wholesaler-orders-changed';

const ShellResponseSchema = z.object({ success: z.literal(true), data: WholesalerShellSchema });
const DashboardResponseSchema = z.object({
  success: z.literal(true),
  data: WholesalerDashboardSchema,
});
const CatalogResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(WholesalerCatalogItemSchema),
});
const ProductResponseSchema = z.object({
  success: z.literal(true),
  data: WholesalerCatalogItemSchema,
});
const CategoriesResponseSchema = z.object({ success: z.literal(true), data: z.array(z.string()) });
const CategoryResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({ name: z.string() }),
});
const RetailerSearchResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(RetailerSearchHitSchema),
});
const RetailerConnectResponseSchema = z.object({
  success: z.literal(true),
  data: RetailerSearchHitSchema,
});
const ConnectionsResponseSchema = z.object({
  success: z.literal(true),
  data: WholesalerConnectionListsSchema,
});
const ConnectionResponseSchema = z.object({
  success: z.literal(true),
  data: WholesalerRetailerConnectionSchema,
});
const QuotesResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(QuoteRequestSchema),
});
const OrdersResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(WholesalerOrderRowSchema),
  meta: z.object({
    total: z.number(),
    page: z.number(),
    limit: z.number(),
    pipeline: z.object({
      PENDING: z.number(),
      CONFIRMED: z.number(),
      DISPATCHED: z.number(),
      DELIVERED: z.number(),
    }),
  }),
});
const OrderDetailResponseSchema = z.object({
  success: z.literal(true),
  data: WholesalerOrderDetailSchema,
});
const ProfileResponseSchema = z.object({
  success: z.literal(true),
  data: WholesalerListingProfileSchema,
});
const OrderActivityResponseSchema = z.object({
  success: z.literal(true),
  data: WholesalerOrderActivitySchema,
});
const CatalogActivityResponseSchema = z.object({
  success: z.literal(true),
  data: WholesalerCatalogActivitySchema,
});
const StatusResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    orderId: z.string().uuid(),
    status: z.enum(['DISPATCHED', 'DELIVERED']),
    whatsapp: z.object({ sent: z.boolean(), message: z.string() }),
  }),
});

export type CatalogFilters = {
  q?: string;
  category?: string;
  availability?: 'AVAILABLE' | 'OUT_OF_STOCK';
  priceOnRequest?: boolean;
};

export async function loadWholesalerShell(accessToken: string): Promise<WholesalerShell> {
  const response = await getJson('/api/v1/wholesaler/shell', accessToken, ShellResponseSchema);
  return response.data;
}

export async function searchRetailerShops(
  accessToken: string,
  query: string,
): Promise<RetailerSearchHit[]> {
  const response = await getJson(
    `/api/v1/wholesaler/retailers/search?q=${encodeURIComponent(query)}`,
    accessToken,
    RetailerSearchResponseSchema,
  );
  return response.data;
}

export async function connectRetailerShop(
  accessToken: string,
  retailerOrgId: string,
): Promise<void> {
  await sendJson(
    '/api/v1/wholesaler/retailers/connect',
    accessToken,
    'POST',
    { retailerOrgId },
    RetailerConnectResponseSchema,
  );
}

export async function loadConnections(accessToken: string): Promise<WholesalerConnectionLists> {
  const response = await getJson(
    '/api/v1/wholesaler/connections',
    accessToken,
    ConnectionsResponseSchema,
  );
  return response.data;
}

export async function approveConnection(
  accessToken: string,
  connectionId: string,
  visibilityMode: VisibilityMode,
): Promise<void> {
  await sendJson(
    `/api/v1/wholesaler/connections/${connectionId}/approve`,
    accessToken,
    'PATCH',
    { visibilityMode },
    ConnectionResponseSchema,
  );
}

export async function cancelConnection(accessToken: string, connectionId: string): Promise<void> {
  await sendJson(
    `/api/v1/wholesaler/connections/${connectionId}/cancel`,
    accessToken,
    'PATCH',
    {},
    ConnectionResponseSchema,
  );
}

export async function declineConnection(accessToken: string, connectionId: string): Promise<void> {
  await sendJson(
    `/api/v1/wholesaler/connections/${connectionId}/decline`,
    accessToken,
    'PATCH',
    {},
    ConnectionResponseSchema,
  );
}

export async function updateVisibility(
  accessToken: string,
  connectionId: string,
  visibilityMode: VisibilityMode,
): Promise<void> {
  await sendJson(
    `/api/v1/wholesaler/connections/${connectionId}/visibility`,
    accessToken,
    'PATCH',
    { visibilityMode },
    ConnectionResponseSchema,
  );
}

export async function loadQuoteRequests(accessToken: string): Promise<QuoteRequest[]> {
  const response = await getJson(
    '/api/v1/wholesaler/quote-requests',
    accessToken,
    QuotesResponseSchema,
  );
  return response.data;
}

export async function loadWholesalerDashboard(accessToken: string): Promise<WholesalerDashboard> {
  const response = await getJson(
    '/api/v1/wholesaler/dashboard',
    accessToken,
    DashboardResponseSchema,
  );
  return response.data;
}

export async function loadWholesalerOrders(
  accessToken: string,
  filters: { status?: string; retailerOrgId?: string; q?: string },
): Promise<{
  orders: WholesalerOrderRow[];
  pipeline: { PENDING: number; CONFIRMED: number; DISPATCHED: number; DELIVERED: number };
}> {
  const params = new URLSearchParams();
  if (filters.status) {
    params.set('status', filters.status);
  }
  if (filters.retailerOrgId) {
    params.set('retailerOrgId', filters.retailerOrgId);
  }
  if (filters.q) {
    params.set('q', filters.q);
  }
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const response = await getJson(
    `/api/v1/wholesaler/orders${query}`,
    accessToken,
    OrdersResponseSchema,
  );
  return { orders: response.data, pipeline: response.meta.pipeline };
}

export async function loadWholesalerOrder(
  accessToken: string,
  orderId: string,
): Promise<WholesalerOrderDetail> {
  const response = await getJson(
    `/api/v1/orders/${orderId}`,
    accessToken,
    OrderDetailResponseSchema,
  );
  return response.data;
}

export async function updateWholesalerOrderStatus(
  accessToken: string,
  orderId: string,
  status: Extract<OrderStatus, 'DISPATCHED' | 'DELIVERED'>,
): Promise<string> {
  const response = await sendJson(
    `/api/v1/orders/${orderId}/status`,
    accessToken,
    'PATCH',
    { status },
    StatusResponseSchema,
  );
  return response.data.whatsapp.message;
}

export async function loadListingProfile(accessToken: string): Promise<WholesalerListingProfile> {
  const response = await getJson('/api/v1/wholesaler/profile', accessToken, ProfileResponseSchema);
  return response.data;
}

export async function saveListingProfile(
  accessToken: string,
  input: UpdateWholesalerListingProfileRequest,
): Promise<WholesalerListingProfile> {
  const response = await sendJson(
    '/api/v1/wholesaler/profile',
    accessToken,
    'PATCH',
    input,
    ProfileResponseSchema,
  );
  return response.data;
}

export async function loadOrderActivity(
  accessToken: string,
  from: string,
  to: string,
): Promise<WholesalerOrderActivity> {
  const response = await getJson(
    `/api/v1/wholesaler/reports/order-activity?from=${from}&to=${to}`,
    accessToken,
    OrderActivityResponseSchema,
  );
  return response.data;
}

export async function loadCatalogActivity(
  accessToken: string,
  from: string,
  to: string,
): Promise<WholesalerCatalogActivity> {
  const response = await getJson(
    `/api/v1/wholesaler/reports/catalog-activity?from=${from}&to=${to}`,
    accessToken,
    CatalogActivityResponseSchema,
  );
  return response.data;
}

export async function downloadOrderHistory(
  accessToken: string,
  from: string,
  to: string,
  format: 'xlsx' | 'pdf',
): Promise<void> {
  const response = await fetch(
    `${API_BASE}/api/v1/wholesaler/reports/order-activity/export?from=${from}&to=${to}&format=${format}`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new Error(messageFrom(payload));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = format === 'pdf' ? 'order-history.pdf' : 'order-history.xlsx';
  link.click();
  URL.revokeObjectURL(url);
}

export async function confirmWholesalerOrder(accessToken: string, orderId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/orders/${orderId}/confirm`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

export async function loadCatalog(
  accessToken: string,
  filters: CatalogFilters,
): Promise<WholesalerCatalogItem[]> {
  const params = new URLSearchParams();
  if (filters.q) {
    params.set('q', filters.q);
  }
  if (filters.category) {
    params.set('category', filters.category);
  }
  if (filters.availability) {
    params.set('availability', filters.availability);
  }
  if (filters.priceOnRequest) {
    params.set('priceOnRequest', 'true');
  }
  const query = params.size > 0 ? `?${params.toString()}` : '';
  const response = await getJson(
    `/api/v1/wholesaler/catalog${query}`,
    accessToken,
    CatalogResponseSchema,
  );
  return response.data;
}

export async function loadCategories(accessToken: string): Promise<string[]> {
  const response = await getJson(
    '/api/v1/wholesaler/catalog/categories',
    accessToken,
    CategoriesResponseSchema,
  );
  return response.data;
}

export async function saveCategory(accessToken: string, name: string): Promise<string> {
  const response = await sendJson(
    '/api/v1/wholesaler/catalog/categories',
    accessToken,
    'POST',
    { name },
    CategoryResponseSchema,
  );
  return response.data.name;
}

export async function saveProduct(
  accessToken: string,
  input: SaveCatalogProductRequest,
  productId?: string,
): Promise<WholesalerCatalogItem> {
  const path = productId ? `/api/v1/wholesaler/catalog/${productId}` : '/api/v1/wholesaler/catalog';
  const response = await sendJson(
    path,
    accessToken,
    productId ? 'PATCH' : 'POST',
    input,
    ProductResponseSchema,
  );
  return response.data;
}

export async function removeProduct(accessToken: string, productId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/wholesaler/catalog/${productId}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

export async function setAvailability(
  accessToken: string,
  ids: string[],
  availabilityStatus: 'AVAILABLE' | 'OUT_OF_STOCK',
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/wholesaler/catalog/availability`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ids, availabilityStatus }),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
}

async function getJson<T>(path: string, accessToken: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error(messageFrom(payload));
  }
  return parsed.data;
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
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  const parsed = schema.safeParse(payload);
  if (!response.ok || !parsed.success) {
    throw new Error(messageFrom(payload));
  }
  return parsed.data;
}

async function readError(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  return messageFrom(payload);
}

function messageFrom(payload: unknown): string {
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
  return 'Something went wrong. Try again.';
}
