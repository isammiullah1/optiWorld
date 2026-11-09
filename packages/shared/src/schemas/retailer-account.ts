import { z } from 'zod';

export const RETAILER_FEATURES = [
  'billing',
  'customers',
  'inventory',
  'billPad',
  'wholesalers',
  'orders',
  'laboratories',
  'labJobs',
  'alerts',
  'reports',
] as const;

export type RetailerFeature = (typeof RETAILER_FEATURES)[number];

export const RETAILER_FEATURE_LABELS: Record<RetailerFeature, string> = {
  billing: 'POS billing',
  customers: 'Customers',
  inventory: 'Inventory',
  billPad: 'Bill pad',
  wholesalers: 'Wholesalers',
  orders: 'Orders',
  laboratories: 'Laboratories',
  labJobs: 'Lab jobs',
  alerts: 'Alerts',
  reports: 'Reports',
};

const uuid = z.string().uuid();
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

export const RetailerShopProfileSchema = z.object({
  id: uuid,
  name: z.string(),
  username: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  about: z.string().nullable(),
});

export const RetailerAccountSchema = z.object({
  id: uuid,
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  role: z.enum(['OWNER', 'STAFF']),
});

export const RetailerSessionProfileSchema = z.object({
  shop: RetailerShopProfileSchema,
  account: RetailerAccountSchema,
  features: z.array(z.enum(RETAILER_FEATURES)),
});

export type RetailerSessionProfile = z.infer<typeof RetailerSessionProfileSchema>;

export const UpdateRetailerShopProfileSchema = z.object({
  name: z.string().trim().min(1, 'Enter the shop name.').max(160),
  phone: z.string().trim().min(1, 'Enter a phone number.').max(30),
  city: z.string().trim().min(1, 'Enter the city.').max(80),
  address: optionalText(300),
  whatsappNumber: optionalText(30),
  about: optionalText(1000),
});

export type UpdateRetailerShopProfileRequest = z.infer<typeof UpdateRetailerShopProfileSchema>;

export const UpdateRetailerAccountSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(120),
    phone: optionalText(30),
    currentPassword: z.string().optional().or(z.literal('')),
    newPassword: z.string().optional().or(z.literal('')),
  })
  .superRefine((value, context) => {
    const next = value.newPassword?.trim() ?? '';
    const current = value.currentPassword?.trim() ?? '';
    if (next.length === 0 && current.length === 0) {
      return;
    }
    if (current.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter your current password.',
        path: ['currentPassword'],
      });
    }
    if (next.length < 8) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password must be at least 8 characters.',
        path: ['newPassword'],
      });
    }
  });

export type UpdateRetailerAccountRequest = z.infer<typeof UpdateRetailerAccountSchema>;

export const RetailerStaffMemberSchema = z.object({
  id: uuid,
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  role: z.enum(['OWNER', 'STAFF']),
  isActive: z.boolean(),
  features: z.array(z.enum(RETAILER_FEATURES)),
});

export type RetailerStaffMember = z.infer<typeof RetailerStaffMemberSchema>;

export const CreateRetailerStaffSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  email: z.string().trim().email('Enter a valid email address.'),
  phone: optionalText(30),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.enum(['OWNER', 'STAFF']),
  features: z.array(z.enum(RETAILER_FEATURES)).default([]),
});

export type CreateRetailerStaffRequest = z.infer<typeof CreateRetailerStaffSchema>;

export const UpdateRetailerStaffSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  phone: optionalText(30),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .optional()
    .or(z.literal('')),
  role: z.enum(['OWNER', 'STAFF']),
  isActive: z.boolean(),
  features: z.array(z.enum(RETAILER_FEATURES)).default([]),
});

export type UpdateRetailerStaffRequest = z.infer<typeof UpdateRetailerStaffSchema>;

export function resolveRetailerFeatures(role: string, raw: unknown): RetailerFeature[] {
  if (role === 'OWNER' || raw == null) {
    return [...RETAILER_FEATURES];
  }
  const parsed = z.array(z.enum(RETAILER_FEATURES)).safeParse(raw);
  if (!parsed.success) {
    return [...RETAILER_FEATURES];
  }
  return [...new Set(parsed.data)];
}
