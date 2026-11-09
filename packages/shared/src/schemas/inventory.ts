import { z } from 'zod';

import { PageMetaSchema } from './retailer-dashboard.js';

export const INVENTORY_CATEGORY_GROUPS = [
  {
    id: 'LENSES',
    label: 'Lenses',
    items: [
      { name: 'Single Vision', prescriptionRequired: true },
      { name: 'Bifocal', prescriptionRequired: true },
      { name: 'Trifocal', prescriptionRequired: true },
      { name: 'Progressive', prescriptionRequired: true },
      { name: 'Occupational', prescriptionRequired: true },
      { name: 'Blue Cut', prescriptionRequired: true },
      { name: 'Photochromic', prescriptionRequired: true },
      { name: 'Polarized', prescriptionRequired: true },
      { name: 'High Index', prescriptionRequired: true },
      { name: 'Aspheric', prescriptionRequired: true },
      { name: 'Myopia Control', prescriptionRequired: true },
      { name: 'Anti-Fatigue', prescriptionRequired: true },
      { name: 'Driving Lenses', prescriptionRequired: true },
      { name: 'Computer Lenses', prescriptionRequired: true },
      { name: 'Lenses', prescriptionRequired: true },
      { name: 'Ready Readers', prescriptionRequired: false },
      { name: 'Low Vision Aids', prescriptionRequired: true },
    ],
  },
  {
    id: 'FRAMES',
    label: 'Frames',
    items: [
      { name: 'Frames', prescriptionRequired: true },
      { name: 'Full Rim Frames', prescriptionRequired: true },
      { name: 'Semi-Rimless Frames', prescriptionRequired: true },
      { name: 'Rimless Frames', prescriptionRequired: true },
      { name: 'Kids Frames', prescriptionRequired: true },
      { name: 'Sunglasses', prescriptionRequired: true },
      { name: 'Sports Eyewear', prescriptionRequired: true },
      { name: 'Safety Eyewear', prescriptionRequired: true },
    ],
  },
  {
    id: 'CONTACTS',
    label: 'Contact lenses',
    items: [
      { name: 'Contact Lenses', prescriptionRequired: true },
      { name: 'Spherical Contacts', prescriptionRequired: true },
      { name: 'Toric Contacts', prescriptionRequired: true },
      { name: 'Multifocal Contacts', prescriptionRequired: true },
    ],
  },
  {
    id: 'SUPPLIES',
    label: 'Shop supplies',
    items: [
      { name: 'Coatings', prescriptionRequired: false },
      { name: 'Lens Treatments', prescriptionRequired: false },
      { name: 'Tints', prescriptionRequired: false },
      { name: 'Cases', prescriptionRequired: false },
      { name: 'Cleaning Solutions', prescriptionRequired: false },
      { name: 'Cloths', prescriptionRequired: false },
      { name: 'Accessories', prescriptionRequired: false },
      { name: 'Cords and Chains', prescriptionRequired: false },
      { name: 'Nose Pads', prescriptionRequired: false },
      { name: 'Screws and Tools', prescriptionRequired: false },
      { name: 'Clip-ons', prescriptionRequired: false },
      { name: 'Magnifiers', prescriptionRequired: false },
      { name: 'Display Material', prescriptionRequired: false },
      { name: 'Equipment', prescriptionRequired: false },
      { name: 'Spare Parts', prescriptionRequired: false },
      { name: 'Other', prescriptionRequired: false },
    ],
  },
] as const;

export const INVENTORY_CATEGORIES = INVENTORY_CATEGORY_GROUPS.flatMap((group) =>
  group.items.map((item) => item.name),
);

export type InventoryCategoryDefinition = {
  name: string;
  prescriptionRequired: boolean;
};

export function findInventoryCategory(name: string): InventoryCategoryDefinition | null {
  const key = name.trim().toLowerCase();
  for (const group of INVENTORY_CATEGORY_GROUPS) {
    for (const item of group.items) {
      if (item.name.toLowerCase() === key) {
        return item;
      }
    }
  }
  return null;
}

export function categoryRequiresPrescription(
  category: string,
  productName = '',
  stored?: boolean | null,
): boolean {
  if (stored === true) {
    return true;
  }
  if (stored === false) {
    return false;
  }
  const known = findInventoryCategory(category);
  if (known) {
    return known.prescriptionRequired;
  }
  const value = `${category} ${productName}`.toLowerCase();
  return value.includes('lens') || value.includes('frame');
}

export const STOCK_ADJUST_REASONS = ['RECEIVED', 'DAMAGED', 'CORRECTION'] as const;

export const STOCK_MOVEMENT_TYPES = [
  'OPENING',
  'SALE',
  'RECEIVED',
  'DAMAGED',
  'LOST',
  'CORRECTION',
] as const;

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);
const label = z.string().trim().min(1).max(40);

export const INVENTORY_SORTS = ['NAME', 'STOCK', 'PRICE'] as const;

export const InventoryListQuerySchema = z.object({
  q: z.string().trim().optional().default(''),
  category: z.string().trim().optional().default(''),
  lowStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  bestSelling: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  mostProfitable: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  minPrice: money.optional(),
  maxPrice: money.optional(),
  minStock: z.coerce.number().int().min(0).max(1_000_000).optional(),
  maxStock: z.coerce.number().int().min(0).max(1_000_000).optional(),
  sort: z.enum(INVENTORY_SORTS).optional().default('NAME'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export type InventoryListQuery = z.infer<typeof InventoryListQuerySchema>;

export const InventoryBatchSchema = z.object({
  id: z.string().uuid(),
  priceCode: z.string(),
  prefix: z.string(),
  productName: z.string(),
  brand: z.string().nullable(),
  category: z.string(),
  salePrice: money,
  costPrice: money.nullable(),
  stockQty: z.number().int(),
  lowStockThreshold: z.number().int(),
  lowStock: z.boolean(),
  outOfStock: z.boolean(),
  prescriptionRequired: z.boolean().nullable(),
  unitsSold: z.number().int().nonnegative(),
  profit: money.nullable(),
  archivedAt: z.string().datetime().nullable(),
  archiveReason: z.string().nullable(),
  archivedBy: z.string().nullable(),
});

export const InventoryArchiveNoteSchema = z.object({
  reason: z.string().trim().min(1, 'Enter the reason.').max(500),
});

export type InventoryArchiveNote = z.infer<typeof InventoryArchiveNoteSchema>;

export type InventoryBatchRecord = z.infer<typeof InventoryBatchSchema>;

export const InventoryCategoryRuleSchema = z.object({
  name: z.string(),
  prescriptionRequired: z.boolean(),
});

export type InventoryCategoryRule = z.infer<typeof InventoryCategoryRuleSchema>;

export const InventoryListSchema = z.object({
  rows: z.array(InventoryBatchSchema),
  categories: z.array(z.string()),
  categoryRules: z.array(InventoryCategoryRuleSchema),
  meta: PageMetaSchema,
});

export type InventoryList = z.infer<typeof InventoryListSchema>;

const InventoryFieldsSchema = z.object({
  prefix: z.string().trim().min(1).max(12),
  pricePart: z.string().trim().max(24).optional().default(''),
  priceCode: z.string().trim().max(40).optional().default(''),
  manualPriceCode: z.boolean().optional().default(false),
  productName: z.string().trim().min(1).max(160),
  brand: z
    .union([z.string().trim().max(80), z.null()])
    .optional()
    .transform((value) => (value ? value : null)),
  category: label,
  prescriptionRequired: z.boolean().optional(),
  salePrice: money,
  costPrice: money.optional(),
  lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export const CreateInventorySchema = InventoryFieldsSchema.extend({
  stockQty: z.coerce.number().int().min(0).max(1_000_000),
}).superRefine((value, ctx) => {
  if (value.manualPriceCode) {
    if (!value.priceCode) {
      ctx.addIssue({ code: 'custom', path: ['priceCode'], message: 'Enter a product code' });
    }
    return;
  }
  if (!value.pricePart) {
    ctx.addIssue({ code: 'custom', path: ['pricePart'], message: 'Enter the suffix code' });
  }
});

export type CreateInventoryRequest = z.infer<typeof CreateInventorySchema>;

export const UpdateInventorySchema = z.object({
  salePrice: money,
  lowStockThreshold: z.coerce.number().int().min(0).max(1_000_000),
});

export type UpdateInventoryRequest = z.infer<typeof UpdateInventorySchema>;

export const AdjustStockSchema = z
  .object({
    reason: z.enum(STOCK_ADJUST_REASONS),
    quantity: z.coerce.number().int().positive().max(1_000_000),
    direction: z.enum(['ADD', 'REMOVE']).optional(),
    costPrice: money.optional(),
    note: z
      .string()
      .trim()
      .max(240)
      .optional()
      .transform((value) => (value && value.length > 0 ? value : undefined)),
  })
  .superRefine((value, ctx) => {
    if (value.reason === 'CORRECTION' && !value.direction) {
      ctx.addIssue({
        code: 'custom',
        path: ['direction'],
        message: 'Choose whether this correction adds or removes stock',
      });
    }
  });

export type AdjustStockRequest = z.infer<typeof AdjustStockSchema>;

export const StockMovementSchema = z.object({
  id: z.string(),
  occurredAt: z.string().datetime(),
  type: z.enum(STOCK_MOVEMENT_TYPES),
  quantityChange: z.number().int(),
  balance: z.number().int(),
  changedBy: z.string().nullable(),
  note: z.string().nullable(),
});

export type StockMovementRow = z.infer<typeof StockMovementSchema>;

export const CostReceiptSchema = z.object({
  id: z.string(),
  occurredAt: z.string().datetime(),
  kind: z.enum(['OPENING', 'RECEIVED']),
  quantity: z.number().int().positive(),
  unitCost: money.nullable(),
  lineCost: money.nullable(),
});

export type CostReceipt = z.infer<typeof CostReceiptSchema>;

export const DamagedEntrySchema = z.object({
  id: z.string(),
  occurredAt: z.string().datetime(),
  quantity: z.number().int().positive(),
  enteredBy: z.string().nullable(),
  reason: z.string().nullable(),
});

export type DamagedEntry = z.infer<typeof DamagedEntrySchema>;

export const ConnectedWholesalerSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string(),
});

export type ConnectedWholesaler = z.infer<typeof ConnectedWholesalerSchema>;

export const InventoryDetailSchema = z.object({
  batch: InventoryBatchSchema,
  movements: z.array(StockMovementSchema),
  wholesalers: z.array(ConnectedWholesalerSchema),
  acquiredQty: z.number().int().nonnegative(),
  damagedQty: z.number().int().nonnegative(),
  soldQty: z.number().int().nonnegative(),
  saleTotal: money,
  costTotal: money.nullable(),
  costReceipts: z.array(CostReceiptSchema),
  damagedEntries: z.array(DamagedEntrySchema),
});

export type InventoryDetail = z.infer<typeof InventoryDetailSchema>;

export const RetailerSettingsSchema = z.object({
  defaultLowStockThreshold: z.number().int().min(0),
  businessName: z.string(),
  paymentTermDays: z.number().int().min(0),
  reminderBeforeEnabled: z.boolean(),
  reminderBeforeDays: z.number().int().min(0),
  reminderOnDueEnabled: z.boolean(),
  reminderAfterEnabled: z.boolean(),
  reminderAfterDays: z.number().int().min(0),
  billHeading: z.string(),
  billTagline: z.string(),
  billTerms: z.string(),
  billLogoUrl: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  address: z.string().nullable(),
  username: z.string().nullable(),
});

export type RetailerSettings = z.infer<typeof RetailerSettingsSchema>;

export const UpdateRetailerSettingsSchema = z
  .object({
    defaultLowStockThreshold: z.coerce.number().int().min(0).max(1_000_000).optional(),
    paymentTermDays: z.coerce.number().int().min(0).max(365).optional(),
    reminderBeforeEnabled: z.boolean().optional(),
    reminderBeforeDays: z.coerce.number().int().min(0).max(90).optional(),
    reminderOnDueEnabled: z.boolean().optional(),
    reminderAfterEnabled: z.boolean().optional(),
    reminderAfterDays: z.coerce.number().int().min(0).max(90).optional(),
    billHeading: z.string().trim().max(120).optional(),
    billTagline: z.string().trim().max(160).optional(),
    billTerms: z.string().trim().max(2000).optional(),
    phone: z.string().trim().max(40).optional(),
    city: z.string().trim().max(80).optional(),
    address: z.string().trim().max(500).optional(),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]{3,32}$/, 'Use 3 to 32 letters or numbers.')
      .optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: 'Choose a setting to save',
  });

export type UpdateRetailerSettingsRequest = z.infer<typeof UpdateRetailerSettingsSchema>;

export const UploadBillLogoSchema = z.object({
  image: z.string().trim().min(32).max(1_500_000),
});

export type UploadBillLogoRequest = z.infer<typeof UploadBillLogoSchema>;

export function combinePriceCode(prefix: string, pricePart: string): string {
  return `${prefix.trim()}${pricePart.trim()}`;
}
