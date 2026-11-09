import { z } from 'zod';

import { RecordActivitySchema } from './record-activity.js';

import { CONNECTION_STATUSES, ORDER_STATUSES, VISIBILITY_MODES } from '../enums/index.js';
import { OrderAmendmentLineSchema } from './chat.js';

const uuid = z.string().uuid();
const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);

export const WholesalerConnectionSchema = z.object({
  id: uuid,
  status: z.enum(CONNECTION_STATUSES),
  visibilityMode: z.enum(VISIBILITY_MODES),
  wholesalerOrgId: uuid,
  wholesalerName: z.string(),
  logoUrl: z.string().nullable(),
  username: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  about: z.string().nullable(),
  connectedAt: z.string().nullable(),
  incoming: z.boolean(),
});

export const WholesalerSearchHitSchema = z.object({
  id: uuid,
  name: z.string(),
  username: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  about: z.string().nullable(),
  connectedAt: z.string().nullable(),
  connectionStatus: z.enum(CONNECTION_STATUSES).nullable(),
});

export const WholesalerSearchQuerySchema = z.object({
  q: z.string().trim().min(3, 'Enter the exact username or ID.').max(80),
});

export const RequestWholesalerConnectionSchema = z.object({
  wholesalerOrgId: uuid,
});

export const CatalogProductSchema = z.object({
  id: uuid,
  name: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  productCode: z.string(),
  listedPrice: money.nullable(),
  isPriceOnRequest: z.boolean(),
  availabilityStatus: z.enum(['AVAILABLE', 'OUT_OF_STOCK']),
});

export const WholesalerCatalogSchema = z.object({
  wholesaler: z.object({
    id: uuid,
    name: z.string(),
    phone: z.string().nullable(),
    city: z.string().nullable(),
    whatsappNumber: z.string().nullable(),
    listingProfileNotes: z.string().nullable(),
  }),
  visibilityMode: z.enum(['FULL', 'PRICES_HIDDEN']),
  pricesVisible: z.boolean(),
  products: z.array(CatalogProductSchema),
});

export const CreateRetailerOrderSchema = z
  .object({
    wholesalerOrgId: uuid,
    notes: z.string().trim().max(2_000).optional(),
    items: z
      .array(
        z.object({
          catalogProductId: uuid,
          quantity: z.number().int().positive().max(10_000),
        }),
      )
      .min(1)
      .max(50),
  })
  .refine(
    (input) =>
      new Set(input.items.map((item) => item.catalogProductId)).size === input.items.length,
    {
      message: 'Each product can only be added once',
      path: ['items'],
    },
  );

export const UpdateRetailerOrderItemsSchema = z
  .object({
    items: z
      .array(
        z.object({
          catalogProductId: uuid,
          quantity: z.number().int().positive().max(10_000),
        }),
      )
      .min(1)
      .max(50),
  })
  .refine(
    (input) =>
      new Set(input.items.map((item) => item.catalogProductId)).size === input.items.length,
    {
      message: 'Each product can only be added once',
      path: ['items'],
    },
  );

export const RetailerOrderListQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const RetailerOrderRowSchema = z.object({
  id: uuid,
  reference: z.string(),
  wholesalerName: z.string(),
  itemCount: z.number().int().nonnegative(),
  products: z.array(z.string()).optional(),
  status: z.enum(ORDER_STATUSES),
  createdAt: z.string(),
  totalValue: money.nullable(),
});

export const RetailerOrderDetailSchema = z.object({
  id: uuid,
  reference: z.string(),
  status: z.enum(ORDER_STATUSES),
  lockedAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  activity: z.array(RecordActivitySchema).optional(),
  wholesaler: z.object({
    id: uuid,
    name: z.string(),
    phone: z.string().nullable(),
  }),
  pricesVisible: z.boolean(),
  totalValue: money.nullable(),
  openAmendment: z
    .array(
      OrderAmendmentLineSchema.extend({
        catalogProductId: uuid.nullable(),
      }),
    )
    .optional(),
  items: z.array(
    z.object({
      id: uuid,
      catalogProductId: uuid.nullable(),
      productName: z.string(),
      quantity: z.number().int().positive(),
      agreedPrice: money.nullable(),
    }),
  ),
  messages: z.array(
    z.object({
      id: uuid,
      senderName: z.string(),
      senderOrgId: uuid,
      content: z.string(),
      messageType: z.enum(['TEXT', 'SYSTEM', 'CHANGE_REQUEST']),
      createdAt: z.string(),
      amendment: z
        .object({
          status: z.enum(['PENDING', 'ACCEPTED', 'DECLINED']),
          lines: z.array(OrderAmendmentLineSchema),
        })
        .nullable()
        .optional(),
    }),
  ),
});

export type WholesalerConnection = z.infer<typeof WholesalerConnectionSchema>;
export type WholesalerSearchHit = z.infer<typeof WholesalerSearchHitSchema>;
export type CatalogProduct = z.infer<typeof CatalogProductSchema>;
export type WholesalerCatalog = z.infer<typeof WholesalerCatalogSchema>;
export type CreateRetailerOrderRequest = z.infer<typeof CreateRetailerOrderSchema>;
export type UpdateRetailerOrderItemsRequest = z.infer<typeof UpdateRetailerOrderItemsSchema>;
export type RetailerOrderRow = z.infer<typeof RetailerOrderRowSchema>;
export type RetailerOrderDetail = z.infer<typeof RetailerOrderDetailSchema>;
