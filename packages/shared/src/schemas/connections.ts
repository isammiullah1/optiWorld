import { z } from 'zod';

import { CONNECTION_STATUSES } from '../enums/index.js';

const uuid = z.string().uuid();

export const RetailerSearchHitSchema = z.object({
  id: uuid,
  name: z.string(),
  username: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  about: z.string().nullable(),
  connectedAt: z.string().nullable(),
  connectionStatus: z.enum(CONNECTION_STATUSES).nullable(),
});

export type RetailerSearchHit = z.infer<typeof RetailerSearchHitSchema>;

export const RetailerSearchQuerySchema = z.object({
  q: z.string().trim().min(3, 'Enter the exact username or ID.').max(80),
});

export const ConnectRetailerSchema = z.object({
  retailerOrgId: uuid,
});
