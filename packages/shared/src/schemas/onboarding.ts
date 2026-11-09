import { z } from 'zod';

import { ORG_TYPES } from '../enums/index.js';

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(''));

export const OnboardingDetailsSchema = z.object({
  businessName: z.string().trim().min(1, 'Business name is required').max(160),
  city: z.string().trim().min(1, 'City is required').max(80),
  phone: z.string().trim().min(1, 'Phone is required').max(30),
  whatsappNumber: optionalText(30),
  address: optionalText(500),
  listingProfileNotes: optionalText(1000),
});

export const CompleteOnboardingSchema = OnboardingDetailsSchema.extend({
  orgType: z.enum(ORG_TYPES),
  fullName: z.string().trim().min(1, 'Full name is required').max(120),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

export const ImportWorkbookSchema = z.object({
  fileBase64: z.string().min(20).max(6_000_000),
  preview: z.boolean().optional(),
});

export const ImportTemplateSchema = z.object({
  kind: z.enum(['customers', 'inventory', 'dues']),
});

export type CompleteOnboardingRequest = z.infer<typeof CompleteOnboardingSchema>;
export type ImportWorkbookRequest = z.infer<typeof ImportWorkbookSchema>;

export type ImportRowError = {
  row: number;
  message: string;
};

export type ImportResult = {
  preview: boolean;
  imported: number;
  columns: string[];
  rows: string[][];
  errors: ImportRowError[];
};
