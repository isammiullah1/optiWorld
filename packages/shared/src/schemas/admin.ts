import { z } from 'zod';

import { ORG_STATUSES, ORG_TYPES, PLAN_TYPES, SUBSCRIPTION_STATUSES } from '../enums/index.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.');

export const AdminOrgListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  type: z.enum(ORG_TYPES).optional(),
  status: z.enum(ORG_STATUSES).optional(),
});

export const CreateAdminOrgSchema = z.object({
  name: z.string().trim().min(1, 'Enter the organisation name.').max(160),
  type: z.enum(ORG_TYPES),
  city: z.string().trim().min(1, 'Enter the city.').max(80),
  phone: z.string().trim().min(1, 'Enter a phone number.').max(30),
  planType: z.enum(PLAN_TYPES),
  subscriptionEndDate: day,
  inviteEmail: z.string().trim().email('Enter a valid invite email.'),
});

export const PatchAdminOrgSchema = z
  .object({
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    adminNotes: z.string().trim().max(2000, 'Notes must be 2000 characters or fewer.').optional(),
  })
  .refine((value) => value.status !== undefined || value.adminNotes !== undefined, {
    message: 'Nothing to update.',
  });

export const PatchAdminSubscriptionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('EXTEND'),
    renewalDate: day,
  }),
  z.object({
    action: z.literal('STATUS'),
    status: z.enum(SUBSCRIPTION_STATUSES),
  }),
]);

export const InviteOrganisationSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().trim().email('Enter a valid invite email.'),
});

export const AdminUserQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  orgType: z.enum(ORG_TYPES).optional(),
  orgId: z.string().uuid().optional(),
});

export const PatchAdminUserSchema = z.object({
  isActive: z.boolean(),
});

export const AdminSubscriptionQuerySchema = z.object({
  filter: z.enum(['WEEK', 'MONTH', 'EXPIRED', 'ALL']).default('ALL'),
});

export const AcceptInviteSchema = z.object({
  token: z.string().trim().min(20, 'This invite link is invalid.'),
  fullName: z.string().trim().min(1, 'Enter your name.').max(120),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export const InvitePreviewQuerySchema = z.object({
  token: z.string().trim().min(20, 'This invite link is invalid.'),
});

export const AdminOrgRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.enum(ORG_TYPES),
  status: z.enum(ORG_STATUSES),
  createdAt: z.string(),
  renewalDate: z.string().nullable(),
});

export const AdminOrgUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  isActive: z.boolean(),
  lastLoginAt: z.string().nullable(),
});

export const AdminSubscriptionHistorySchema = z.object({
  id: z.string().uuid(),
  planType: z.enum(PLAN_TYPES),
  status: z.enum(SUBSCRIPTION_STATUSES),
  startDate: z.string(),
  endDate: z.string(),
  renewalDate: z.string(),
  createdAt: z.string(),
});

export const AdminActivitySchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  label: z.string(),
  actorName: z.string().nullable(),
  createdAt: z.string(),
});

export const AdminOrgDetailSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.enum(ORG_TYPES),
  status: z.enum(ORG_STATUSES),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string(),
  planType: z.enum(PLAN_TYPES),
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  renewalDate: z.string().nullable(),
  userCount: z.number(),
  lastLoginAt: z.string().nullable(),
  adminNotes: z.string().nullable(),
  users: z.array(AdminOrgUserSchema),
  subscriptionHistory: z.array(AdminSubscriptionHistorySchema),
  activity: z.array(AdminActivitySchema),
});

export const AdminDashboardSchema = z.object({
  totalOrgs: z.number(),
  activeSubscriptions: z.number(),
  trials: z.number(),
  activeUsersToday: z.number(),
  breakdown: z.array(z.object({ type: z.enum(ORG_TYPES), count: z.number() })),
  expiringSoon: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      type: z.enum(ORG_TYPES),
      renewalDate: z.string(),
    }),
  ),
  recentSignups: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      type: z.enum(ORG_TYPES),
      createdAt: z.string(),
    }),
  ),
});

export const AdminPlatformUserSchema = AdminOrgUserSchema.extend({
  orgId: z.string().uuid(),
  orgName: z.string(),
  orgType: z.enum(ORG_TYPES),
});

export const AdminSubscriptionRowSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  orgName: z.string(),
  orgType: z.enum(ORG_TYPES),
  planType: z.enum(PLAN_TYPES),
  status: z.enum(SUBSCRIPTION_STATUSES),
  startDate: z.string(),
  endDate: z.string(),
  renewalDate: z.string(),
});

export const HealthStateSchema = z.enum(['UP', 'DEGRADED', 'DOWN']);

export const AdminHealthSchema = z.object({
  database: z.object({ status: HealthStateSchema, detail: z.string() }),
  redis: z.object({ status: HealthStateSchema, detail: z.string() }),
  whatsapp: z.object({ status: HealthStateSchema, detail: z.string() }),
  socket: z.object({ status: HealthStateSchema, detail: z.string(), connections: z.number() }),
  errors: z.array(z.object({ at: z.string(), message: z.string() })),
});

export const AdminInviteResultSchema = z.object({
  id: z.string().uuid(),
  inviteSent: z.boolean(),
  message: z.string(),
});

export const AdminExtendWeekSchema = z.object({
  extended: z.number(),
});

export const InvitePreviewSchema = z.object({
  organisationName: z.string(),
  email: z.string(),
  orgType: z.enum(ORG_TYPES),
});

export type CreateAdminOrgRequest = z.infer<typeof CreateAdminOrgSchema>;
export type PatchAdminOrgRequest = z.infer<typeof PatchAdminOrgSchema>;
export type PatchAdminSubscriptionRequest = z.infer<typeof PatchAdminSubscriptionSchema>;
export type InviteOrganisationRequest = z.infer<typeof InviteOrganisationSchema>;
export type AdminUserQuery = z.infer<typeof AdminUserQuerySchema>;
export type PatchAdminUserRequest = z.infer<typeof PatchAdminUserSchema>;
export type AdminSubscriptionQuery = z.infer<typeof AdminSubscriptionQuerySchema>;
export type AcceptInviteRequest = z.infer<typeof AcceptInviteSchema>;
export type AdminOrgRow = z.infer<typeof AdminOrgRowSchema>;
export type AdminOrgDetail = z.infer<typeof AdminOrgDetailSchema>;
export type AdminDashboard = z.infer<typeof AdminDashboardSchema>;
export type AdminPlatformUser = z.infer<typeof AdminPlatformUserSchema>;
export type AdminSubscriptionRow = z.infer<typeof AdminSubscriptionRowSchema>;
export type AdminHealth = z.infer<typeof AdminHealthSchema>;
export type AdminInviteResult = z.infer<typeof AdminInviteResultSchema>;
export type InvitePreview = z.infer<typeof InvitePreviewSchema>;
