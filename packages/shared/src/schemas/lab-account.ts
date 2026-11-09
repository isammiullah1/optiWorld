import { z } from 'zod';

export const LAB_FEATURES = ['jobs', 'notifications', 'inventory', 'clients', 'reports'] as const;
export type LabFeature = (typeof LAB_FEATURES)[number];

export const LAB_FEATURE_LABELS: Record<LabFeature, string> = {
  jobs: 'Jobs',
  notifications: 'Notifications',
  inventory: 'Inventory',
  clients: 'Clients',
  reports: 'Reports',
};

const uuid = z.string().uuid();

export const LabProfileSchema = z.object({
  id: uuid,
  name: z.string(),
  username: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  about: z.string().nullable(),
});

export const LabAccountSchema = z.object({
  id: uuid,
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  role: z.enum(['ADMIN', 'TECHNICIAN']),
});

export const LabSessionProfileSchema = z.object({
  laboratory: LabProfileSchema,
  account: LabAccountSchema,
  features: z.array(z.enum(LAB_FEATURES)),
});

export type LabSessionProfile = z.infer<typeof LabSessionProfileSchema>;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

export const UpdateLabProfileSchema = z.object({
  name: z.string().trim().min(1, 'Enter the laboratory name.').max(160),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]{3,32}$/, 'Use 3 to 32 letters or numbers.'),
  phone: z.string().trim().min(1, 'Enter a phone number.').max(30),
  city: z.string().trim().min(1, 'Enter the city.').max(80),
  address: optionalText(300),
  whatsappNumber: optionalText(30),
  about: optionalText(1000),
});

export type UpdateLabProfileRequest = z.infer<typeof UpdateLabProfileSchema>;

export const UpdateLabAccountSchema = z
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

export type UpdateLabAccountRequest = z.infer<typeof UpdateLabAccountSchema>;

export const LabStaffMemberSchema = z.object({
  id: uuid,
  name: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  role: z.enum(['ADMIN', 'TECHNICIAN']),
  isActive: z.boolean(),
  features: z.array(z.enum(LAB_FEATURES)),
});

export type LabStaffMember = z.infer<typeof LabStaffMemberSchema>;

export const CreateLabStaffSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  email: z.string().trim().email('Enter a valid email address.'),
  phone: optionalText(30),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  role: z.enum(['ADMIN', 'TECHNICIAN']),
  features: z.array(z.enum(LAB_FEATURES)).default([]),
});

export type CreateLabStaffRequest = z.infer<typeof CreateLabStaffSchema>;

export const UpdateLabStaffSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(120),
  phone: optionalText(30),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .optional()
    .or(z.literal('')),
  role: z.enum(['ADMIN', 'TECHNICIAN']),
  isActive: z.boolean(),
  features: z.array(z.enum(LAB_FEATURES)).default([]),
});

export type UpdateLabStaffRequest = z.infer<typeof UpdateLabStaffSchema>;

export function resolveLabFeatures(role: string, raw: unknown): LabFeature[] {
  if (role === 'ADMIN' || raw == null) {
    return [...LAB_FEATURES];
  }
  const parsed = z.array(z.enum(LAB_FEATURES)).safeParse(raw);
  if (!parsed.success) {
    return [...LAB_FEATURES];
  }
  return [...new Set(parsed.data)];
}
