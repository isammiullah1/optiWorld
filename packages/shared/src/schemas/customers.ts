import { z } from 'zod';

import { prescriptionIssuePaths } from '../prescription/reading.js';

import { CUSTOMER_GENDERS, INVOICE_STATUSES } from '../enums/index.js';
import { isShopPhone, shopPhoneMessage } from '../phone/shop-phone.js';

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const uuid = z.string().uuid();

export const CUSTOMER_DUES_FILTERS = ['ALL', 'HAS_DUES', 'NO_DUES'] as const;
export const CUSTOMER_SORTS = ['NAME', 'RECENT', 'HIGHEST_DUES'] as const;
export const CUSTOMER_PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'OTHER'] as const;
export const LEDGER_ENTRY_KINDS = ['DEBIT', 'CREDIT'] as const;
export const CUSTOMER_ACTIVITY_KINDS = ['INVOICE', 'PAYMENT', 'PRESCRIPTION', 'REMINDER'] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

export const CustomerListQuerySchema = z.object({
  q: z.string().trim().max(120).optional().default(''),
  dues: z.enum(CUSTOMER_DUES_FILTERS).optional().default('ALL'),
  gender: z.enum(CUSTOMER_GENDERS).optional(),
  minAge: z.coerce.number().int().min(0).max(130).optional(),
  maxAge: z.coerce.number().int().min(0).max(130).optional(),
  minOutstanding: money.optional(),
  maxOutstanding: money.optional(),
  sort: z.enum(CUSTOMER_SORTS).optional().default('NAME'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
});

export type CustomerListQuery = z.infer<typeof CustomerListQuerySchema>;

export const CustomerLastInvoiceSchema = z.object({
  id: uuid,
  invoiceNumber: z.number().int().positive(),
  issuedAt: z.string().datetime(),
});

export const CustomerListItemSchema = z.object({
  id: uuid,
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  gender: z.enum(CUSTOMER_GENDERS).nullable(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  totalPurchases: money,
  outstanding: money,
  lastInvoice: CustomerLastInvoiceSchema.nullable(),
});

export type CustomerListItem = z.infer<typeof CustomerListItemSchema>;

export {
  composeShopPhone,
  DEFAULT_PHONE_COUNTRY,
  isShopPhone,
  limitNationalDigits,
  PHONE_COUNTRIES,
  phoneCountry,
  shopPhoneError,
  shopPhoneMessage,
} from '../phone/shop-phone.js';
export type { PhoneCountryOption } from '../phone/shop-phone.js';

const customerPhone = z
  .string()
  .trim()
  .min(1, 'Enter a phone number.')
  .max(30, 'Phone must be 30 characters or fewer.')
  .superRefine((value, ctx) => {
    if (!isShopPhone(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: shopPhoneMessage(value) });
    }
  });

const optionalCustomerPhone = z.union([customerPhone, z.literal('')]).optional();

const whatsappNumber = z
  .string()
  .trim()
  .min(1, 'Enter the WhatsApp number.')
  .max(30, 'WhatsApp must be 30 characters or fewer.')
  .superRefine((value, ctx) => {
    if (!isShopPhone(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: shopPhoneMessage(value) });
    }
  });

const currentCredit = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : '0.00'))
  .refine((value) => /^\d{1,10}(\.\d{1,2})?$/.test(value), {
    message: 'Enter the current credit as an amount.',
  });

const customerEmail = z.union([
  z
    .string()
    .trim()
    .email('Enter a valid email, or leave it blank.')
    .max(160, 'Email must be 160 characters or fewer.'),
  z.literal(''),
]);

const optionalDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date as YYYY-MM-DD.'),
  z.literal(''),
]);

export const CreateCustomerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter the customer name.')
    .max(120, 'Name must be 120 characters or fewer.'),
  phone: optionalCustomerPhone,
  whatsappNumber,
  email: customerEmail.optional(),
  gender: z.enum(CUSTOMER_GENDERS).optional(),
  dateOfBirth: optionalDate.optional(),
  referredBy: optionalText(120),
  address: optionalText(500),
  creditLimit: money.optional().default('0.00'),
  currentCredit,
  notes: optionalText(2000),
});

export type CreateCustomerRequest = z.infer<typeof CreateCustomerSchema>;

export const UpdateCustomerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Enter the customer name.')
      .max(120, 'Name must be 120 characters or fewer.')
      .optional(),
    phone: optionalCustomerPhone,
    whatsappNumber: whatsappNumber.optional(),
    email: customerEmail.optional(),
    gender: z.enum(CUSTOMER_GENDERS).optional(),
    dateOfBirth: optionalDate.optional(),
    referredBy: optionalText(120),
    address: optionalText(500),
    creditLimit: money.optional(),
    notes: optionalText(2000),
  })
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Change at least one field',
  });

export type UpdateCustomerRequest = z.infer<typeof UpdateCustomerSchema>;

export const CustomerRecordSchema = z.object({
  id: uuid,
  name: z.string(),
  phone: z.string().nullable(),
  whatsappNumber: z.string().nullable(),
  email: z.string().nullable(),
  gender: z.enum(CUSTOMER_GENDERS).nullable(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  referredBy: z.string().nullable(),
  address: z.string().nullable(),
  creditLimit: money,
  notes: z.string().nullable(),
  outstanding: money,
  totalSpent: money,
  invoiceCount: z.number().int().nonnegative(),
});

export type CustomerRecord = z.infer<typeof CustomerRecordSchema>;

export const CustomerPrescriptionSchema = z.object({
  id: uuid,
  referenceNumber: z.string(),
  createdAt: z.string().datetime(),
  invoiceId: uuid.nullable(),
  summary: z.string(),
});

export const EyeReadingSchema = z.object({
  sphere: z.string().trim().max(20),
  cylinder: z.string().trim().max(20),
  axis: z.string().trim().max(20),
});

const ItemPrescriptionObject = z.object({
  right: EyeReadingSchema,
  left: EyeReadingSchema,
  add: z.string().trim().max(20),
  pd: z.string().trim().max(20),
  notes: z.string().trim().max(500),
});

function withPrescriptionRules<T extends z.ZodTypeAny>(schema: T): T {
  return schema.superRefine((value, ctx) => {
    if (!isReading(value)) {
      return;
    }
    for (const issue of prescriptionIssuePaths(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path: issue.path,
      });
    }
  }) as unknown as T;
}

function isReading(value: unknown): value is {
  right: { sphere: string; cylinder: string; axis: string };
  left: { sphere: string; cylinder: string; axis: string };
  add: string;
  pd: string;
  notes: string;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Boolean(
    record.right && record.left && typeof record.add === 'string' && typeof record.pd === 'string',
  );
}

export const ItemPrescriptionSchema = withPrescriptionRules(ItemPrescriptionObject);

export type ItemPrescription = z.infer<typeof ItemPrescriptionSchema>;

export const LinePrescriptionInputSchema = withPrescriptionRules(
  ItemPrescriptionObject.extend({
    savedId: uuid.optional(),
    remember: z.boolean(),
    labOrgId: uuid.optional(),
  }),
);

export type LinePrescriptionInput = z.infer<typeof LinePrescriptionInputSchema>;

export const SavedPrescriptionSchema = ItemPrescriptionObject.extend({
  id: uuid,
  source: z.enum(['SAVED', 'LAB_JOB']),
  createdAt: z.string().datetime(),
  summary: z.string(),
});

export type SavedPrescription = z.infer<typeof SavedPrescriptionSchema>;

export const CustomerInvoiceRowSchema = z.object({
  id: uuid,
  invoiceNumber: z.number().int().positive(),
  issuedAt: z.string().datetime(),
  status: z.enum(INVOICE_STATUSES),
  total: money,
});

export const CustomerActivitySchema = z.object({
  id: z.string(),
  kind: z.enum(CUSTOMER_ACTIVITY_KINDS),
  at: z.string().datetime(),
  title: z.string(),
  detail: z.string(),
});

export const CustomerProfileSchema = CustomerRecordSchema.extend({
  prescriptions: z.array(CustomerPrescriptionSchema),
  invoices: z.array(CustomerInvoiceRowSchema),
  activity: z.array(CustomerActivitySchema),
});

export type CustomerProfile = z.infer<typeof CustomerProfileSchema>;

export const LedgerEntrySchema = z.object({
  id: z.string(),
  at: z.string().datetime(),
  kind: z.enum(LEDGER_ENTRY_KINDS),
  label: z.string(),
  amount: money,
  balance: money,
  invoiceId: uuid.nullable(),
  handledBy: z.string().nullable(),
});

export const CustomerLedgerSchema = z.object({
  outstanding: money,
  entries: z.array(LedgerEntrySchema),
});

export const CustomerCreditBillSchema = z.object({
  id: uuid,
  invoiceNumber: z.number().int().positive(),
  label: z.string(),
  issuedAt: z.string().datetime(),
  total: money,
  amountPaid: money,
  outstanding: money,
  payments: z.array(
    z.object({
      amount: money,
      recordedAt: z.string().datetime(),
      notes: z.string().nullable(),
    }),
  ),
});

export const CustomerCreditBillsSchema = z.object({
  outstanding: money,
  bills: z.array(CustomerCreditBillSchema),
});

export type CustomerCreditBills = z.infer<typeof CustomerCreditBillsSchema>;

export type CustomerLedger = z.infer<typeof CustomerLedgerSchema>;

export const RecordPaymentSchema = z.object({
  amount: money,
  recordedAt: z.string().datetime(),
  method: z.enum(CUSTOMER_PAYMENT_METHODS),
  notes: optionalText(500),
});

export type RecordPaymentRequest = z.infer<typeof RecordPaymentSchema>;

export const RecordPaymentResultSchema = z.object({
  outstanding: money,
  paymentIds: z.array(uuid),
});

export type RecordPaymentResult = z.infer<typeof RecordPaymentResultSchema>;
