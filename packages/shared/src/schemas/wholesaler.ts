import { z } from 'zod';

import { RecordActivitySchema } from './record-activity.js';

import { CONNECTION_STATUSES, ORDER_STATUSES, VISIBILITY_MODES } from '../enums/index.js';
import { OrderAmendmentLineSchema } from './chat.js';

const uuid = z.string().uuid();
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const availability = z.enum(['AVAILABLE', 'OUT_OF_STOCK']);

export const WholesalerShellSchema = z.object({
  orgName: z.string(),
  pendingOrderCount: z.number().int().nonnegative(),
});

export type WholesalerShell = z.infer<typeof WholesalerShellSchema>;

export const WholesalerOrderRowSchema = z.object({
  id: uuid,
  reference: z.string(),
  retailerOrgId: uuid,
  retailerName: z.string(),
  itemCount: z.number().int().nonnegative(),
  itemsSummary: z.string(),
  totalValue: money.nullable(),
  status: z.enum(ORDER_STATUSES),
  createdAt: z.string().datetime(),
  isNew: z.boolean(),
  hasUnread: z.boolean(),
});

export type WholesalerOrderRow = z.infer<typeof WholesalerOrderRowSchema>;

export const WholesalerDashboardSchema = z.object({
  pendingOrders: z.number().int().nonnegative(),
  activeConnections: z.number().int().nonnegative(),
  catalogProducts: z.number().int().nonnegative(),
  outOfStockProducts: z.number().int().nonnegative(),
  ordersToday: z.number().int().nonnegative(),
  pipeline: z.object({
    PENDING: z.number().int().nonnegative(),
    CONFIRMED: z.number().int().nonnegative(),
    DISPATCHED: z.number().int().nonnegative(),
    DELIVERED: z.number().int().nonnegative(),
  }),
  recentOrders: z.array(WholesalerOrderRowSchema),
});

export type WholesalerDashboard = z.infer<typeof WholesalerDashboardSchema>;

export const WholesalerOrderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  retailerOrgId: z.string().uuid().optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const OrderStageSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  reachedAt: z.string().datetime().nullable(),
});

export const WholesalerOrderDetailSchema = z.object({
  id: uuid,
  reference: z.string(),
  status: z.enum(ORDER_STATUSES),
  lockedAt: z.string().datetime().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  activity: z.array(RecordActivitySchema).optional(),
  totalValue: money.nullable(),
  openAmendment: z
    .array(
      OrderAmendmentLineSchema.extend({
        catalogProductId: uuid.nullable(),
      }),
    )
    .optional(),
  retailer: z.object({
    name: z.string(),
    city: z.string().nullable(),
    phone: z.string().nullable(),
    connectedSince: z.string().datetime().nullable(),
  }),
  items: z.array(
    z.object({
      id: uuid,
      catalogProductId: uuid.nullable().optional(),
      productName: z.string(),
      quantity: z.number().int().positive(),
      agreedPrice: money.nullable(),
      lineTotal: money.nullable(),
    }),
  ),
  stages: z.array(OrderStageSchema),
  messages: z.array(
    z.object({
      id: uuid,
      senderName: z.string(),
      senderOrgId: uuid,
      content: z.string(),
      messageType: z.enum(['TEXT', 'SYSTEM', 'CHANGE_REQUEST']),
      createdAt: z.string().datetime(),
    }),
  ),
});

export type WholesalerOrderDetail = z.infer<typeof WholesalerOrderDetailSchema>;

export const CatalogListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  availability: availability.optional(),
  priceOnRequest: z.enum(['true', 'false']).optional(),
});

export const WholesalerCatalogItemSchema = z.object({
  id: uuid,
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  productCode: z.string(),
  listedPrice: money.nullable(),
  isPriceOnRequest: z.boolean(),
  availabilityStatus: availability,
});

export type WholesalerCatalogItem = z.infer<typeof WholesalerCatalogItemSchema>;

export const SaveCatalogProductSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    category: z.string().trim().min(1).max(80),
    description: z.string().trim().max(2000).optional(),
    listedPrice: money.nullable().optional(),
    isPriceOnRequest: z.boolean(),
    availabilityStatus: availability,
    productCode: z.string().trim().max(40).optional(),
  })
  .refine((input) => input.isPriceOnRequest || Boolean(input.listedPrice), {
    message: 'Enter a listed price, or mark the price on request',
    path: ['listedPrice'],
  });

export type SaveCatalogProductRequest = z.infer<typeof SaveCatalogProductSchema>;

export const BulkAvailabilitySchema = z.object({
  ids: z.array(uuid).min(1).max(100),
  availabilityStatus: availability,
});

export const CatalogCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const WholesalerRetailerConnectionSchema = z.object({
  id: uuid,
  retailerOrgId: uuid,
  retailerName: z.string(),
  username: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  about: z.string().nullable(),
  status: z.enum(CONNECTION_STATUSES),
  visibilityMode: z.enum(VISIBILITY_MODES),
  requestedAt: z.string().datetime(),
  approvedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  orderCount: z.number().int().nonnegative(),
  lastOrderAt: z.string().datetime().nullable(),
});

export type WholesalerRetailerConnection = z.infer<typeof WholesalerRetailerConnectionSchema>;

export const WholesalerConnectionListsSchema = z.object({
  connected: z.array(WholesalerRetailerConnectionSchema),
  pending: z.array(WholesalerRetailerConnectionSchema),
  outgoing: z.array(WholesalerRetailerConnectionSchema),
  declined: z.array(WholesalerRetailerConnectionSchema),
});

export type WholesalerConnectionLists = z.infer<typeof WholesalerConnectionListsSchema>;

export const ConnectionVisibilitySchema = z.object({
  visibilityMode: z.enum(VISIBILITY_MODES),
});

export type ConnectionVisibilityRequest = z.infer<typeof ConnectionVisibilitySchema>;

export const QuoteRequestSchema = z.object({
  id: uuid,
  orderId: uuid,
  retailerName: z.string(),
  productName: z.string(),
  quantity: z.number().int().positive(),
  requestedAt: z.string().datetime(),
});

export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

const optionalListingText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(''));

export const WholesalerListingProfileSchema = z.object({
  id: uuid,
  username: z.string().nullable(),
  businessName: z.string(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  listingProfileNotes: z.string().nullable(),
});

export type WholesalerListingProfile = z.infer<typeof WholesalerListingProfileSchema>;

export const UpdateWholesalerListingProfileSchema = z.object({
  businessName: z.string().trim().min(1, 'Enter the business name.').max(160),
  city: z.string().trim().min(1, 'Enter the city.').max(80),
  phone: z.string().trim().min(1, 'Enter a phone number.').max(30),
  whatsappNumber: optionalListingText(30),
  listingProfileNotes: optionalListingText(1000),
});

export type UpdateWholesalerListingProfileRequest = z.infer<
  typeof UpdateWholesalerListingProfileSchema
>;

export const WholesalerOrderActivitySchema = z.object({
  from: z.string(),
  to: z.string(),
  counts: z.object({
    received: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
    dispatched: z.number().int().nonnegative(),
    delivered: z.number().int().nonnegative(),
  }),
  orders: z.array(
    z.object({
      id: uuid,
      reference: z.string(),
      retailerName: z.string(),
      itemsSummary: z.string(),
      status: z.enum(ORDER_STATUSES),
      submittedAt: z.string().datetime(),
      confirmedAt: z.string().datetime().nullable(),
      dispatchedAt: z.string().datetime().nullable(),
      deliveredAt: z.string().datetime().nullable(),
    }),
  ),
  months: z.array(z.string()),
  byRetailer: z.array(
    z.object({
      retailerName: z.string(),
      counts: z.array(z.number().int().nonnegative()),
    }),
  ),
  responseTime: z.object({
    averageMinutes: z.number().int().nonnegative().nullable(),
    sampleSize: z.number().int().nonnegative(),
  }),
});

export type WholesalerOrderActivity = z.infer<typeof WholesalerOrderActivitySchema>;

export const WholesalerCatalogActivitySchema = z.object({
  from: z.string(),
  to: z.string(),
  products: z.array(
    z.object({
      productName: z.string(),
      orderLines: z.number().int().nonnegative(),
    }),
  ),
});

export type WholesalerCatalogActivity = z.infer<typeof WholesalerCatalogActivitySchema>;
