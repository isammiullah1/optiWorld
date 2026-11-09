import { prisma } from '@optiworld/db';
import {
  categoryRequiresPrescription,
  centsToMoney,
  combinePriceCode,
  findInventoryCategory,
  moneyToCents,
  type AdjustStockRequest,
  type AuthSessionUser,
  type ConnectedWholesaler,
  type CostReceipt,
  type DamagedEntry,
  type CreateInventoryRequest,
  type InventoryBatchRecord,
  type InventoryDetail,
  type InventoryCategoryRule,
  type InventoryList,
  type InventoryListQuery,
  type RetailerSettings,
  type StockMovementRow,
  type UpdateInventoryRequest,
  type UpdateRetailerSettingsRequest,
} from '@optiworld/shared';

import { billLogoPath } from '../lib/bill-logo-store.js';
import { AppError } from '../lib/errors.js';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type BatchRow = {
  id: string;
  priceCode: string;
  prefix: string;
  productName: string;
  brand: string | null;
  category: string;
  salePrice: { toFixed: (digits: number) => string };
  costPrice: { toFixed: (digits: number) => string };
  stockQty: number;
  lowStockThreshold: number;
  prescriptionRequired: boolean | null;
  createdAt: Date;
};

type SaleLine = {
  id: string;
  inventoryBatchId: string | null;
  quantity: number;
  stockShortfall: number;
};

const batchSelect = {
  id: true,
  priceCode: true,
  prefix: true,
  productName: true,
  brand: true,
  category: true,
  salePrice: true,
  costPrice: true,
  stockQty: true,
  lowStockThreshold: true,
  prescriptionRequired: true,
  createdAt: true,
} as const;

export async function listInventory(
  auth: AuthSessionUser,
  query: InventoryListQuery,
): Promise<InventoryList> {
  const orgId = requiredRetailerOrgId(auth);
  const rows = await prisma.inventoryBatch.findMany({
    where: { orgId },
    select: {
      ...batchSelect,
      deletedAt: true,
      stockMovements: { where: { type: 'SALE' }, select: { quantityChange: true } },
    },
    orderBy: [{ productName: 'asc' }],
  });
  const liveRows = rows.filter((row) => row.deletedAt === null);
  const pool = query.archived ? rows.filter((row) => row.deletedAt !== null) : liveRows;
  const profits = query.mostProfitable ? await profitByBatch(orgId, pool) : null;
  const q = query.q.trim().toLowerCase();
  const filtered = pool.filter((row) => {
    if (query.category && row.category !== query.category) {
      return false;
    }
    if (query.lowStock && row.stockQty > row.lowStockThreshold) {
      return false;
    }
    if (query.bestSelling && unitsSoldOf(row.stockMovements) === 0) {
      return false;
    }
    if (query.mostProfitable && (profits?.get(row.id) ?? 0) <= 0) {
      return false;
    }
    const price = moneyToCents(row.salePrice.toFixed(2));
    if (query.minPrice !== undefined && price < moneyToCents(query.minPrice)) {
      return false;
    }
    if (query.maxPrice !== undefined && price > moneyToCents(query.maxPrice)) {
      return false;
    }
    if (query.minStock !== undefined && row.stockQty < query.minStock) {
      return false;
    }
    if (query.maxStock !== undefined && row.stockQty > query.maxStock) {
      return false;
    }
    if (!q) {
      return true;
    }
    const code = `${row.prefix}${row.priceCode}`.toLowerCase();
    return (
      row.productName.toLowerCase().includes(q) ||
      row.priceCode.toLowerCase().includes(q) ||
      code.includes(q) ||
      (row.brand ?? '').toLowerCase().includes(q)
    );
  });
  const start = (query.page - 1) * query.limit;
  const categories = [...new Set(liveRows.map((row) => row.category))].sort((a, b) =>
    a.localeCompare(b),
  );
  const sorted = [...filtered].sort((left, right) => {
    if (query.mostProfitable && profits) {
      return (
        (profits.get(right.id) ?? 0) - (profits.get(left.id) ?? 0) ||
        left.productName.localeCompare(right.productName)
      );
    }
    if (query.bestSelling) {
      return (
        unitsSoldOf(right.stockMovements) - unitsSoldOf(left.stockMovements) ||
        left.productName.localeCompare(right.productName)
      );
    }
    return compareBatches(left, right, query.sort);
  });
  const pageRows = sorted.slice(start, start + query.limit);
  const notes = query.archived
    ? await loadArchiveNotes(
        orgId,
        pageRows.map((row) => row.id),
      )
    : new Map<string, ArchiveNote>();
  return {
    rows: pageRows.map((row) => {
      const note = notes.get(row.id);
      return {
        ...toRecord(row, auth.role === 'OWNER'),
        unitsSold: unitsSoldOf(row.stockMovements),
        profit: auth.role === 'OWNER' && profits ? centsToMoney(profits.get(row.id) ?? 0) : null,
        archivedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
        archiveReason: note?.reason ?? null,
        archivedBy: note?.by ?? null,
      };
    }),
    categories,
    categoryRules: customCategoryRules(liveRows),
    meta: { total: filtered.length, page: query.page, limit: query.limit },
  };
}

function customCategoryRules(
  rows: readonly { category: string; productName: string; prescriptionRequired: boolean | null }[],
): InventoryCategoryRule[] {
  const rules = new Map<string, boolean>();
  for (const row of rows) {
    if (findInventoryCategory(row.category)) {
      continue;
    }
    const required =
      row.prescriptionRequired ?? categoryRequiresPrescription(row.category, row.productName, null);
    rules.set(row.category, rules.get(row.category) === true || required);
  }
  return [...rules.entries()]
    .map(([name, prescriptionRequired]) => ({ name, prescriptionRequired }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function resolvedCategory(input: { category: string; prescriptionRequired?: boolean }): {
  name: string;
  prescriptionRequired: boolean;
  custom: boolean;
} {
  const known = findInventoryCategory(input.category);
  if (known) {
    return { name: known.name, prescriptionRequired: known.prescriptionRequired, custom: false };
  }
  return {
    name: input.category.trim(),
    prescriptionRequired: input.prescriptionRequired === true,
    custom: true,
  };
}

function unitsSoldOf(movements: readonly { quantityChange: number }[]): number {
  return movements.reduce((sum, movement) => sum + Math.abs(movement.quantityChange), 0);
}

async function profitByBatch(
  orgId: string,
  batches: readonly { id: string; costPrice: { toFixed: (digits: number) => string } }[],
): Promise<Map<string, number>> {
  const profits = new Map<string, number>();
  if (batches.length === 0) {
    return profits;
  }
  const unitCost = new Map(
    batches.map((batch) => [batch.id, moneyToCents(batch.costPrice.toFixed(2))]),
  );
  const lines = await prisma.invoiceItem.findMany({
    where: {
      inventoryBatchId: { in: batches.map((batch) => batch.id) },
      invoice: { orgId, cancelledAt: null, NOT: { reviewReason: 'Opening credit' } },
    },
    select: { inventoryBatchId: true, quantity: true, stockShortfall: true, unitPrice: true },
  });
  for (const line of lines) {
    if (!line.inventoryBatchId) {
      continue;
    }
    const sold = Math.max(0, line.quantity - line.stockShortfall);
    const revenue = sold * moneyToCents(line.unitPrice.toFixed(2));
    const cost = sold * (unitCost.get(line.inventoryBatchId) ?? 0);
    profits.set(line.inventoryBatchId, (profits.get(line.inventoryBatchId) ?? 0) + revenue - cost);
  }
  return profits;
}

function compareBatches(
  left: {
    productName: string;
    stockQty: number;
    salePrice: { toFixed: (digits: number) => string };
  },
  right: {
    productName: string;
    stockQty: number;
    salePrice: { toFixed: (digits: number) => string };
  },
  sort: InventoryListQuery['sort'],
): number {
  if (sort === 'STOCK') {
    return left.stockQty - right.stockQty || left.productName.localeCompare(right.productName);
  }
  if (sort === 'PRICE') {
    return (
      moneyToCents(left.salePrice.toFixed(2)) - moneyToCents(right.salePrice.toFixed(2)) ||
      left.productName.localeCompare(right.productName)
    );
  }
  return left.productName.localeCompare(right.productName);
}

export async function removeInventoryBatch(
  auth: AuthSessionUser,
  batchId: string,
  reason: string,
): Promise<void> {
  const orgId = requiredRetailerOrgId(auth);
  const existing = await prisma.inventoryBatch.findFirst({
    where: { id: batchId, orgId, deletedAt: null },
    select: { id: true, productName: true, stockQty: true },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'This batch was not found');
  }
  await prisma.$transaction(async (tx) => {
    await tx.inventoryBatch.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await tx.stockMovement.create({
      data: {
        orgId,
        batchId: existing.id,
        type: 'CORRECTION',
        quantityChange: 0,
        balanceAfter: existing.stockQty,
        note: `Archived. ${reason}`,
        createdByUserId: auth.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'INVENTORY_BATCH_REMOVED',
        entityType: 'InventoryBatch',
        entityId: existing.id,
        metadata: { productName: existing.productName, reason },
      },
    });
  });
}

export async function restoreInventoryBatch(
  auth: AuthSessionUser,
  batchId: string,
  reason: string,
): Promise<InventoryBatchRecord> {
  const orgId = requiredRetailerOrgId(auth);
  const existing = await prisma.inventoryBatch.findFirst({
    where: { id: batchId, orgId, deletedAt: { not: null } },
    select: batchSelect,
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'This archived product was not found');
  }
  try {
    const restored = await prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.update({
        where: { id: existing.id },
        data: { deletedAt: null },
        select: batchSelect,
      });
      await tx.stockMovement.create({
        data: {
          orgId,
          batchId: existing.id,
          type: 'CORRECTION',
          quantityChange: 0,
          balanceAfter: existing.stockQty,
          note: `Restocked. ${reason}`,
          createdByUserId: auth.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          orgId,
          userId: auth.userId,
          action: 'INVENTORY_BATCH_RESTORED',
          entityType: 'InventoryBatch',
          entityId: existing.id,
          metadata: { productName: existing.productName, reason },
        },
      });
      return batch;
    });
    return toRecord(restored, auth.role === 'OWNER');
  } catch (error) {
    if (isUniqueError(error)) {
      throw new AppError(409, 'VALIDATION_ERROR', 'A live product already uses this product code');
    }
    throw error;
  }
}

export async function createInventoryBatch(
  auth: AuthSessionUser,
  input: CreateInventoryRequest,
): Promise<InventoryBatchRecord> {
  const orgId = requiredRetailerOrgId(auth);
  const org = await prisma.organisation.findFirst({
    where: { id: orgId, deletedAt: null },
    select: { defaultLowStockThreshold: true },
  });
  if (!org) {
    throw new AppError(404, 'NOT_FOUND', 'This shop was not found');
  }
  const code = resolvedCode(input);
  const category = resolvedCategory(input);
  const threshold = input.lowStockThreshold ?? org.defaultLowStockThreshold;
  const cost = auth.role === 'OWNER' && input.costPrice ? input.costPrice : '0.00';
  try {
    const created = await prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.create({
        data: {
          orgId,
          prefix: code.prefix,
          priceCode: code.priceCode,
          productName: input.productName,
          brand: input.brand,
          category: category.name,
          prescriptionRequired: category.prescriptionRequired,
          salePrice: centsToMoney(moneyToCents(input.salePrice)),
          costPrice: centsToMoney(moneyToCents(cost)),
          stockQty: input.stockQty,
          lowStockThreshold: threshold,
        },
        select: batchSelect,
      });
      await tx.stockMovement.create({
        data: {
          orgId,
          batchId: batch.id,
          type: 'OPENING',
          quantityChange: input.stockQty,
          balanceAfter: input.stockQty,
          note: input.stockQty > 0 ? `Unit cost ${centsToMoney(moneyToCents(cost))}` : null,
          createdByUserId: auth.userId,
        },
      });
      if (category.custom) {
        await tx.inventoryBatch.updateMany({
          where: { orgId, category: category.name, deletedAt: null },
          data: { prescriptionRequired: category.prescriptionRequired },
        });
      }
      await ensureLowStockAlert(tx, orgId, batch);
      return batch;
    });
    return toRecord(created, auth.role === 'OWNER');
  } catch (error) {
    if (isUniqueError(error)) {
      throw new AppError(409, 'VALIDATION_ERROR', 'A batch with this product code already exists');
    }
    throw error;
  }
}

export async function updateInventoryBatch(
  auth: AuthSessionUser,
  batchId: string,
  input: UpdateInventoryRequest,
): Promise<InventoryBatchRecord> {
  const orgId = requiredRetailerOrgId(auth);
  const existing = await prisma.inventoryBatch.findFirst({
    where: { id: batchId, orgId, deletedAt: null },
    select: batchSelect,
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'This batch was not found');
  }
  const salePrice = centsToMoney(moneyToCents(input.salePrice));
  const threshold = input.lowStockThreshold;
  const notes: string[] = [];
  if (salePrice !== existing.salePrice.toFixed(2)) {
    notes.push(`Sale price ₨ ${existing.salePrice.toFixed(2)} to ₨ ${salePrice}`);
  }
  if (threshold !== existing.lowStockThreshold) {
    notes.push(`Low stock threshold ${existing.lowStockThreshold} to ${threshold}`);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const batch = await tx.inventoryBatch.update({
      where: { id: existing.id },
      data: {
        salePrice,
        lowStockThreshold: threshold,
      },
      select: batchSelect,
    });
    if (notes.length > 0) {
      await tx.stockMovement.create({
        data: {
          orgId,
          batchId: existing.id,
          type: 'CORRECTION',
          quantityChange: 0,
          balanceAfter: existing.stockQty,
          note: notes.join('. '),
          createdByUserId: auth.userId,
        },
      });
    }
    await ensureLowStockAlert(tx, orgId, batch);
    return batch;
  });
  return toRecord(updated, auth.role === 'OWNER');
}

export async function getInventoryDetail(
  auth: AuthSessionUser,
  batchId: string,
): Promise<InventoryDetail> {
  const orgId = requiredRetailerOrgId(auth);
  const batch = await prisma.inventoryBatch.findFirst({
    where: { id: batchId, orgId },
    select: { ...batchSelect, deletedAt: true },
  });
  if (!batch) {
    throw new AppError(404, 'NOT_FOUND', 'This batch was not found');
  }
  const owner = auth.role === 'OWNER';
  const [movements, wholesalers, figures, note] = await Promise.all([
    owner ? loadMovements(orgId, batch) : Promise.resolve([]),
    loadWholesalers(orgId),
    loadBatchFigures(orgId, batch, owner),
    batch.deletedAt
      ? loadArchiveNotes(orgId, [batch.id])
      : Promise.resolve(new Map<string, ArchiveNote>()),
  ]);
  const archive = note.get(batch.id);
  return {
    batch: {
      ...toRecord(batch, owner),
      archivedAt: batch.deletedAt ? batch.deletedAt.toISOString() : null,
      archiveReason: archive?.reason ?? null,
      archivedBy: archive?.by ?? null,
    },
    movements,
    wholesalers,
    ...figures,
  };
}

export async function listStockMovements(
  auth: AuthSessionUser,
  batchId: string,
): Promise<StockMovementRow[]> {
  if (auth.role !== 'OWNER') {
    throw new AppError(403, 'FORBIDDEN', 'Stock movement is visible to the owner');
  }
  const detail = await getInventoryDetail(auth, batchId);
  return detail.movements;
}

export async function adjustInventoryStock(
  auth: AuthSessionUser,
  batchId: string,
  input: AdjustStockRequest,
): Promise<InventoryDetail> {
  const orgId = requiredRetailerOrgId(auth);
  if (input.reason === 'RECEIVED' && auth.role === 'OWNER' && !input.costPrice) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Enter the cost price for the stock received');
  }
  const direction = adjustmentDirection(input);
  const change = direction === 'ADD' ? input.quantity : -input.quantity;
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ stock_qty: number; cost_price: unknown }>>`
      SELECT stock_qty, cost_price
      FROM inventory_batches
      WHERE id = ${batchId}::uuid
        AND org_id = ${orgId}::uuid
        AND deleted_at IS NULL
      FOR UPDATE
    `;
    const locked = rows[0];
    if (!locked) {
      throw new AppError(404, 'NOT_FOUND', 'This batch was not found');
    }
    const currentQty = Number(locked.stock_qty);
    const next = currentQty + change;
    if (next < 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Stock cannot go below zero');
    }
    const receivedCost = input.reason === 'RECEIVED' ? input.costPrice : undefined;
    const blended = receivedCost
      ? centsToMoney(
          blendUnitCost(
            currentQty,
            moneyToCents(decimalText(locked.cost_price)),
            input.quantity,
            moneyToCents(receivedCost),
          ),
        )
      : null;
    const batch = await tx.inventoryBatch.update({
      where: { id: batchId },
      data: {
        stockQty: next,
        ...(blended ? { costPrice: blended } : {}),
      },
      select: batchSelect,
    });
    await tx.stockMovement.create({
      data: {
        orgId,
        batchId,
        type: input.reason,
        quantityChange: change,
        balanceAfter: next,
        note:
          receivedCost && blended
            ? `Received ${input.quantity} at ${receivedCost}. Average cost ${blended}.`
            : input.reason === 'DAMAGED'
              ? (input.note ?? null)
              : null,
        createdByUserId: auth.userId,
      },
    });
    await ensureLowStockAlert(tx, orgId, batch);
  });
  return getInventoryDetail(auth, batchId);
}

export async function getRetailerSettings(auth: AuthSessionUser): Promise<RetailerSettings> {
  const orgId = requiredRetailerOrgId(auth);
  const org = await prisma.organisation.findFirst({
    where: { id: orgId, deletedAt: null },
    select: settingsSelect,
  });
  if (!org) {
    throw new AppError(404, 'NOT_FOUND', 'This shop was not found');
  }
  return toSettings(org);
}

export async function updateRetailerSettings(
  auth: AuthSessionUser,
  input: UpdateRetailerSettingsRequest,
): Promise<RetailerSettings> {
  const orgId = requiredRetailerOrgId(auth);
  if (input.username !== undefined) {
    throw new AppError(403, 'FORBIDDEN', 'The shop username can only be changed by OptiWorld.');
  }
  const updated = await prisma.organisation.update({
    where: { id: orgId },
    data: {
      ...(input.defaultLowStockThreshold !== undefined
        ? { defaultLowStockThreshold: input.defaultLowStockThreshold }
        : {}),
      ...(input.paymentTermDays !== undefined ? { paymentTermDays: input.paymentTermDays } : {}),
      ...(input.reminderBeforeEnabled !== undefined
        ? { reminderBeforeEnabled: input.reminderBeforeEnabled }
        : {}),
      ...(input.reminderBeforeDays !== undefined
        ? { reminderBeforeDays: input.reminderBeforeDays }
        : {}),
      ...(input.reminderOnDueEnabled !== undefined
        ? { reminderOnDueEnabled: input.reminderOnDueEnabled }
        : {}),
      ...(input.reminderAfterEnabled !== undefined
        ? { reminderAfterEnabled: input.reminderAfterEnabled }
        : {}),
      ...(input.reminderAfterDays !== undefined
        ? { reminderAfterDays: input.reminderAfterDays }
        : {}),
      ...(input.billHeading !== undefined ? { billHeading: emptyToNull(input.billHeading) } : {}),
      ...(input.billTagline !== undefined ? { billTagline: emptyToNull(input.billTagline) } : {}),
      ...(input.billTerms !== undefined ? { billTerms: emptyToNull(input.billTerms) } : {}),
      ...(input.phone !== undefined ? { phone: emptyToNull(input.phone) } : {}),
      ...(input.city !== undefined ? { city: emptyToNull(input.city) } : {}),
      ...(input.address !== undefined ? { address: emptyToNull(input.address) } : {}),
    },
    select: settingsSelect,
  });
  return toSettings(updated);
}

const settingsSelect = {
  name: true,
  phone: true,
  city: true,
  address: true,
  billHeading: true,
  billTagline: true,
  billTerms: true,
  billLogoKey: true,
  defaultLowStockThreshold: true,
  paymentTermDays: true,
  reminderBeforeEnabled: true,
  reminderBeforeDays: true,
  reminderOnDueEnabled: true,
  reminderAfterEnabled: true,
  reminderAfterDays: true,
  username: true,
} as const;

function toSettings(org: {
  name: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  billHeading: string | null;
  billTagline: string | null;
  billTerms: string | null;
  billLogoKey: string | null;
  defaultLowStockThreshold: number;
  paymentTermDays: number;
  reminderBeforeEnabled: boolean;
  reminderBeforeDays: number;
  reminderOnDueEnabled: boolean;
  reminderAfterEnabled: boolean;
  reminderAfterDays: number;
  username: string | null;
}): RetailerSettings {
  return {
    businessName: org.name,
    phone: org.phone,
    city: org.city,
    address: org.address,
    billHeading: org.billHeading ?? '',
    billTagline: org.billTagline ?? '',
    billTerms: org.billTerms ?? '',
    billLogoUrl: billLogoPath(org.billLogoKey),
    defaultLowStockThreshold: org.defaultLowStockThreshold,
    paymentTermDays: org.paymentTermDays,
    reminderBeforeEnabled: org.reminderBeforeEnabled,
    reminderBeforeDays: org.reminderBeforeDays,
    reminderOnDueEnabled: org.reminderOnDueEnabled,
    reminderAfterEnabled: org.reminderAfterEnabled,
    reminderAfterDays: org.reminderAfterDays,
    username: org.username,
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function recordSaleMovements(
  tx: Tx,
  orgId: string,
  items: readonly SaleLine[],
  userId: string,
): Promise<void> {
  const deductedByBatch = new Map<string, number>();
  const lines: Array<{ id: string; batchId: string; deducted: number }> = [];
  for (const item of items) {
    if (!item.inventoryBatchId) {
      continue;
    }
    const deducted = Math.max(0, item.quantity - item.stockShortfall);
    if (deducted === 0) {
      continue;
    }
    lines.push({ id: item.id, batchId: item.inventoryBatchId, deducted });
    deductedByBatch.set(
      item.inventoryBatchId,
      (deductedByBatch.get(item.inventoryBatchId) ?? 0) + deducted,
    );
  }
  if (lines.length === 0) {
    return;
  }
  const batches = await tx.inventoryBatch.findMany({
    where: { orgId, id: { in: [...deductedByBatch.keys()] }, deletedAt: null },
    select: batchSelect,
  });
  const running = new Map(
    batches.map((batch) => [batch.id, batch.stockQty + (deductedByBatch.get(batch.id) ?? 0)]),
  );
  for (const line of lines) {
    const next = (running.get(line.batchId) ?? line.deducted) - line.deducted;
    running.set(line.batchId, next);
    await tx.stockMovement.create({
      data: {
        orgId,
        batchId: line.batchId,
        type: 'SALE',
        quantityChange: -line.deducted,
        balanceAfter: next,
        invoiceItemId: line.id,
        createdByUserId: userId,
      },
    });
  }
  for (const batch of batches) {
    const stockQty = running.get(batch.id) ?? batch.stockQty;
    await ensureLowStockAlert(tx, orgId, { ...batch, stockQty });
  }
}

const SALE_AUDIT_ACTIONS = [
  'POS_INVOICE_CREATED',
  'OFFLINE_INVOICE_SYNCED',
  'OFFLINE_INVOICE_REPLACED',
] as const;

async function loadMovements(orgId: string, batch: BatchRow): Promise<StockMovementRow[]> {
  const [stored, sales] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { orgId, batchId: batch.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        type: true,
        quantityChange: true,
        note: true,
        createdByUserId: true,
        invoiceItem: { select: { invoiceId: true } },
      },
    }),
    prisma.invoiceItem.findMany({
      where: { inventoryBatchId: batch.id, invoice: { orgId } },
      select: {
        id: true,
        quantity: true,
        stockShortfall: true,
        invoice: { select: { id: true, issuedAt: true } },
        stockMovement: { select: { id: true } },
      },
    }),
  ]);
  const invoiceIds = new Set<string>();
  for (const row of stored) {
    if (!row.createdByUserId && row.invoiceItem) {
      invoiceIds.add(row.invoiceItem.invoiceId);
    }
  }
  for (const sale of sales) {
    if (!sale.stockMovement) {
      invoiceIds.add(sale.invoice.id);
    }
  }
  const invoiceActors = await saleActors(orgId, [...invoiceIds]);
  const names = await staffNames(orgId, [
    ...stored.map((row) => row.createdByUserId),
    ...invoiceActors.values(),
  ]);
  const events: Array<{
    id: string;
    at: Date;
    type: StockMovementRow['type'];
    change: number;
    changedBy: string | null;
    note: string | null;
  }> = stored.map((row) => ({
    id: row.id,
    at: row.createdAt,
    type: row.type,
    change: row.quantityChange,
    changedBy:
      names.get(row.createdByUserId ?? invoiceActors.get(row.invoiceItem?.invoiceId ?? '') ?? '') ??
      null,
    note: row.note,
  }));
  for (const sale of sales) {
    if (sale.stockMovement) {
      continue;
    }
    const deducted = Math.max(0, sale.quantity - sale.stockShortfall);
    if (deducted === 0) {
      continue;
    }
    events.push({
      id: `sale:${sale.id}`,
      at: sale.invoice.issuedAt,
      type: 'SALE',
      change: -deducted,
      changedBy: names.get(invoiceActors.get(sale.invoice.id) ?? '') ?? null,
      note: null,
    });
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
  const hasOpening = events.some((event) => event.type === 'OPENING');
  const summed = events.reduce((total, event) => total + event.change, 0);
  const timeline = hasOpening
    ? events
    : [
        {
          id: `opening:${batch.id}`,
          at: batch.createdAt,
          type: 'OPENING' as const,
          change: batch.stockQty - summed,
          changedBy: null,
          note: null,
        },
        ...events,
      ];
  let balance = 0;
  const rows = timeline.map((event) => {
    balance += event.change;
    return {
      id: event.id,
      occurredAt: event.at.toISOString(),
      type: event.type,
      quantityChange: event.change,
      balance,
      changedBy: event.changedBy,
      note: event.note,
    };
  });
  return rows.reverse();
}

async function saleActors(
  orgId: string,
  invoiceIds: readonly string[],
): Promise<Map<string, string>> {
  const actors = new Map<string, string>();
  if (invoiceIds.length === 0) {
    return actors;
  }
  const audits = await prisma.auditLog.findMany({
    where: {
      orgId,
      entityType: 'Invoice',
      entityId: { in: [...invoiceIds] },
      action: { in: [...SALE_AUDIT_ACTIONS] },
    },
    select: { entityId: true, userId: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const audit of audits) {
    if (audit.userId && !actors.has(audit.entityId)) {
      actors.set(audit.entityId, audit.userId);
    }
  }
  return actors;
}

async function staffNames(
  orgId: string,
  userIds: readonly (string | null)[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null && id.length > 0))];
  if (ids.length === 0) {
    return new Map();
  }
  const users = await prisma.user.findMany({
    where: { orgId, id: { in: ids } },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user.name]));
}

async function loadWholesalers(orgId: string): Promise<ConnectedWholesaler[]> {
  const connections = await prisma.retailerConnection.findMany({
    where: {
      retailerOrgId: orgId,
      status: 'APPROVED',
      wholesaler: { deletedAt: null, status: 'ACTIVE' },
    },
    select: { wholesaler: { select: { id: true, name: true } } },
    orderBy: { wholesaler: { name: 'asc' } },
  });
  return connections.map((connection) => ({
    orgId: connection.wholesaler.id,
    name: connection.wholesaler.name,
  }));
}

async function ensureLowStockAlert(
  tx: Tx,
  orgId: string,
  batch: {
    id: string;
    productName: string;
    priceCode: string;
    stockQty: number;
    lowStockThreshold: number;
  },
): Promise<void> {
  if (batch.stockQty > batch.lowStockThreshold) {
    return;
  }
  const existing = await tx.alert.findFirst({
    where: {
      orgId,
      type: 'LOW_STOCK',
      relatedEntityId: batch.id,
      relatedEntityType: 'InventoryBatch',
      isRead: false,
    },
    select: { id: true },
  });
  if (existing) {
    return;
  }
  await tx.alert.create({
    data: {
      orgId,
      type: 'LOW_STOCK',
      title: 'Low stock',
      body: `${batch.productName} (${batch.priceCode}) is at ${batch.stockQty}. The threshold is ${batch.lowStockThreshold}.`,
      relatedEntityId: batch.id,
      relatedEntityType: 'InventoryBatch',
    },
  });
}

function resolvedCode(input: {
  prefix: string;
  pricePart: string;
  priceCode: string;
  manualPriceCode: boolean;
}): {
  prefix: string;
  priceCode: string;
} {
  const prefix = input.prefix.trim().toUpperCase();
  if (input.manualPriceCode) {
    return { prefix, priceCode: input.priceCode.trim() };
  }
  return { prefix, priceCode: combinePriceCode(prefix, input.pricePart) };
}

async function loadBatchFigures(
  orgId: string,
  batch: BatchRow,
  includeCost: boolean,
): Promise<
  Pick<
    InventoryDetail,
    | 'acquiredQty'
    | 'damagedQty'
    | 'soldQty'
    | 'saleTotal'
    | 'costTotal'
    | 'costReceipts'
    | 'damagedEntries'
  >
> {
  const [movements, sales] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { orgId, batchId: batch.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        type: true,
        quantityChange: true,
        note: true,
        createdByUserId: true,
      },
    }),
    prisma.invoiceItem.findMany({
      where: { inventoryBatchId: batch.id, invoice: { orgId, cancelledAt: null } },
      select: { quantity: true, stockShortfall: true, unitPrice: true },
    }),
  ]);
  const fallbackUnit = moneyToCents(batch.costPrice.toFixed(2));
  let acquiredQty = 0;
  let damagedQty = 0;
  let lostQty = 0;
  let acquiredCost = 0;
  const costReceipts: CostReceipt[] = [];
  const damagedDrafts: Array<{
    id: string;
    occurredAt: string;
    quantity: number;
    userId: string | null;
    reason: string | null;
  }> = [];
  for (const movement of movements) {
    if (
      (movement.type === 'OPENING' || movement.type === 'RECEIVED') &&
      movement.quantityChange > 0
    ) {
      const noted = unitCostFromNote(movement.note);
      const unit = noted ?? fallbackUnit;
      acquiredQty += movement.quantityChange;
      acquiredCost += movement.quantityChange * unit;
      if (includeCost) {
        costReceipts.push({
          id: movement.id,
          occurredAt: movement.createdAt.toISOString(),
          kind: movement.type,
          quantity: movement.quantityChange,
          unitCost: noted === null ? null : centsToMoney(noted),
          lineCost: noted === null ? null : centsToMoney(movement.quantityChange * noted),
        });
      }
    }
    if (movement.type === 'DAMAGED') {
      const quantity = Math.abs(movement.quantityChange);
      damagedQty += quantity;
      if (quantity > 0) {
        damagedDrafts.push({
          id: movement.id,
          occurredAt: movement.createdAt.toISOString(),
          quantity,
          userId: movement.createdByUserId,
          reason: movement.note,
        });
      }
    }
    if (movement.type === 'LOST') {
      lostQty += Math.abs(movement.quantityChange);
    }
  }
  let saleCents = 0;
  let soldQty = 0;
  for (const line of sales) {
    const sold = Math.max(0, line.quantity - line.stockShortfall);
    soldQty += sold;
    saleCents += sold * moneyToCents(line.unitPrice.toFixed(2));
  }
  const onlyReceipt = costReceipts[0];
  if (includeCost && costReceipts.length === 1 && onlyReceipt && onlyReceipt.unitCost === null) {
    costReceipts[0] = {
      ...onlyReceipt,
      unitCost: centsToMoney(fallbackUnit),
      lineCost: centsToMoney(onlyReceipt.quantity * fallbackUnit),
    };
  }
  if (acquiredQty === 0) {
    acquiredQty = batch.stockQty + damagedQty + lostQty + soldQty;
    acquiredCost = acquiredQty * fallbackUnit;
    if (includeCost && acquiredQty > 0) {
      costReceipts.push({
        id: `opening:${batch.id}`,
        occurredAt: batch.createdAt.toISOString(),
        kind: 'OPENING',
        quantity: acquiredQty,
        unitCost: centsToMoney(fallbackUnit),
        lineCost: centsToMoney(acquiredQty * fallbackUnit),
      });
    }
  }
  const names = await staffNames(
    orgId,
    damagedDrafts.map((entry) => entry.userId),
  );
  const damagedEntries: DamagedEntry[] = damagedDrafts
    .map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt,
      quantity: entry.quantity,
      enteredBy: entry.userId ? (names.get(entry.userId) ?? null) : null,
      reason: entry.reason,
    }))
    .reverse();
  return {
    acquiredQty,
    damagedQty,
    soldQty,
    saleTotal: centsToMoney(saleCents),
    costTotal: includeCost ? centsToMoney(acquiredCost) : null,
    costReceipts: includeCost ? costReceipts : [],
    damagedEntries,
  };
}

function unitCostFromNote(note: string | null): number | null {
  if (!note) {
    return null;
  }
  const match = /(?:Unit cost|at) (\d+(?:\.\d{1,2})?)/.exec(note);
  return match?.[1] ? moneyToCents(match[1]) : null;
}

function blendUnitCost(
  currentQty: number,
  currentUnit: number,
  receivedQty: number,
  receivedUnit: number,
): number {
  const total = currentQty + receivedQty;
  if (total <= 0) {
    return receivedUnit;
  }
  return Math.round((currentQty * currentUnit + receivedQty * receivedUnit) / total);
}

function decimalText(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'string') {
    return Number(value).toFixed(2);
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toFixed' in value &&
    typeof value.toFixed === 'function'
  ) {
    return (value.toFixed as (digits: number) => string)(2);
  }
  return '0.00';
}

function adjustmentDirection(input: AdjustStockRequest): 'ADD' | 'REMOVE' {
  if (input.reason === 'RECEIVED') {
    return 'ADD';
  }
  if (input.reason === 'DAMAGED') {
    return 'REMOVE';
  }
  return input.direction ?? 'ADD';
}

function toRecord(row: BatchRow, includeCost: boolean): InventoryBatchRecord {
  return {
    id: row.id,
    priceCode: row.priceCode,
    prefix: row.prefix,
    productName: row.productName,
    brand: row.brand,
    category: row.category,
    salePrice: row.salePrice.toFixed(2),
    costPrice: includeCost ? row.costPrice.toFixed(2) : null,
    stockQty: row.stockQty,
    lowStockThreshold: row.lowStockThreshold,
    lowStock: row.stockQty <= row.lowStockThreshold,
    outOfStock: row.stockQty === 0,
    prescriptionRequired: row.prescriptionRequired,
    unitsSold: 0,
    profit: null,
    archivedAt: null,
    archiveReason: null,
    archivedBy: null,
  };
}

type ArchiveNote = { reason: string | null; by: string | null };

async function loadArchiveNotes(
  orgId: string,
  ids: readonly string[],
): Promise<Map<string, ArchiveNote>> {
  const notes = new Map<string, ArchiveNote>();
  if (ids.length === 0) {
    return notes;
  }
  const logs = await prisma.auditLog.findMany({
    where: {
      orgId,
      entityType: 'InventoryBatch',
      entityId: { in: [...ids] },
      action: 'INVENTORY_BATCH_REMOVED',
    },
    orderBy: { createdAt: 'desc' },
    select: { entityId: true, metadata: true, user: { select: { name: true } } },
  });
  for (const log of logs) {
    if (notes.has(log.entityId)) {
      continue;
    }
    notes.set(log.entityId, {
      reason: reasonFromMetadata(log.metadata),
      by: log.user?.name ?? null,
    });
  }
  return notes;
}

function reasonFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null || !('reason' in metadata)) {
    return null;
  }
  const reason = metadata.reason;
  return typeof reason === 'string' && reason.trim().length > 0 ? reason : null;
}

function requiredRetailerOrgId(auth: AuthSessionUser): string {
  if (!auth.orgId || auth.orgType !== 'RETAILER') {
    throw new AppError(403, 'FORBIDDEN', 'This action is only available to a retailer');
  }
  return auth.orgId;
}

function isUniqueError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
