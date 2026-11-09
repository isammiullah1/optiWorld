import { prisma } from '@optiworld/db';
import type {
  AuthSessionUser,
  SaveCatalogProductRequest,
  WholesalerCatalogItem,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';

type BulkAvailability = {
  ids: string[];
  availabilityStatus: 'AVAILABLE' | 'OUT_OF_STOCK';
};

export async function listCatalog(
  auth: AuthSessionUser,
  filters: {
    q?: string;
    category?: string;
    availability?: 'AVAILABLE' | 'OUT_OF_STOCK';
    priceOnRequest?: 'true' | 'false';
  },
): Promise<WholesalerCatalogItem[]> {
  const orgId = requireWholesaler(auth);
  const rows = await prisma.catalogProduct.findMany({
    where: {
      orgId,
      deletedAt: null,
      ...(filters.q ? { name: { contains: filters.q, mode: 'insensitive' } } : {}),
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.availability ? { availabilityStatus: filters.availability } : {}),
      ...(filters.priceOnRequest === 'true' ? { isPriceOnRequest: true } : {}),
      ...(filters.priceOnRequest === 'false' ? { isPriceOnRequest: false } : {}),
    },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toItem);
}

export async function createCatalogProduct(
  auth: AuthSessionUser,
  input: SaveCatalogProductRequest,
): Promise<WholesalerCatalogItem> {
  const orgId = requireWholesaler(auth);
  const max = await prisma.catalogProduct.aggregate({
    where: { orgId, deletedAt: null },
    _max: { displayOrder: true },
  });
  const created = await prisma.catalogProduct.create({
    data: {
      orgId,
      ...productData(input),
      displayOrder: (max._max.displayOrder ?? 0) + 1,
    },
  });
  return toItem(created);
}

export async function updateCatalogProduct(
  auth: AuthSessionUser,
  productId: string,
  input: SaveCatalogProductRequest,
): Promise<WholesalerCatalogItem> {
  const orgId = requireWholesaler(auth);
  const existing = await prisma.catalogProduct.findFirst({
    where: { id: productId, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Product not found');
  }
  const updated = await prisma.catalogProduct.update({
    where: { id: productId },
    data: productData(input),
  });
  return toItem(updated);
}

export async function deleteCatalogProduct(
  auth: AuthSessionUser,
  productId: string,
): Promise<void> {
  const orgId = requireWholesaler(auth);
  const existing = await prisma.catalogProduct.findFirst({
    where: { id: productId, orgId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Product not found');
  }
  await prisma.catalogProduct.update({
    where: { id: productId },
    data: { deletedAt: new Date() },
  });
}

export async function setCatalogAvailability(
  auth: AuthSessionUser,
  input: BulkAvailability,
): Promise<{ updated: number }> {
  const orgId = requireWholesaler(auth);
  const found = await prisma.catalogProduct.findMany({
    where: { orgId, deletedAt: null, id: { in: input.ids } },
    select: { id: true },
  });
  if (found.length !== input.ids.length) {
    throw new AppError(404, 'NOT_FOUND', 'One or more products were not found');
  }
  const result = await prisma.catalogProduct.updateMany({
    where: { orgId, deletedAt: null, id: { in: input.ids } },
    data: { availabilityStatus: input.availabilityStatus },
  });
  return { updated: result.count };
}

export async function listCatalogCategories(auth: AuthSessionUser): Promise<string[]> {
  const orgId = requireWholesaler(auth);
  const rows = await prisma.catalogProduct.findMany({
    where: { orgId, deletedAt: null },
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  });
  return rows.map((row) => row.category);
}

export function acceptCatalogCategory(auth: AuthSessionUser, name: string): { name: string } {
  requireWholesaler(auth);
  return { name };
}

function requireWholesaler(auth: AuthSessionUser): string {
  if (auth.orgType !== 'WHOLESALER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'A wholesaler account is required');
  }
  return auth.orgId;
}

function productData(input: SaveCatalogProductRequest): {
  name: string;
  category: string;
  description: string | null;
  listedPrice: string | null;
  isPriceOnRequest: boolean;
  availabilityStatus: 'AVAILABLE' | 'OUT_OF_STOCK';
  productCode: string;
} {
  return {
    name: input.name,
    category: input.category,
    description: input.description && input.description.length > 0 ? input.description : null,
    listedPrice: input.isPriceOnRequest ? null : (input.listedPrice ?? null),
    isPriceOnRequest: input.isPriceOnRequest,
    availabilityStatus: input.availabilityStatus,
    productCode: input.productCode && input.productCode.length > 0 ? input.productCode : '',
  };
}

function toItem(row: {
  id: string;
  name: string;
  category: string;
  description: string | null;
  productCode: string;
  listedPrice: { toFixed: (digits: number) => string } | null;
  isPriceOnRequest: boolean;
  availabilityStatus: 'AVAILABLE' | 'OUT_OF_STOCK';
}): WholesalerCatalogItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    productCode: row.productCode,
    listedPrice: row.isPriceOnRequest || !row.listedPrice ? null : row.listedPrice.toFixed(2),
    isPriceOnRequest: row.isPriceOnRequest,
    availabilityStatus: row.availabilityStatus,
  };
}
