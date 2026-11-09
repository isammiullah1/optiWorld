import { prisma } from '@optiworld/db';
import type {
  AdjustLabStockRequest,
  AuthSessionUser,
  LabInventoryItem,
  SaveLabInventoryRequest,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';

export async function listLabInventory(auth: AuthSessionUser): Promise<LabInventoryItem[]> {
  const labOrgId = requireLab(auth);
  const rows = await prisma.labInventory.findMany({
    where: { labOrgId },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  return rows.map(toItem);
}

export async function createLabInventory(
  auth: AuthSessionUser,
  input: SaveLabInventoryRequest,
): Promise<LabInventoryItem> {
  const labOrgId = requireLab(auth);
  const created = await prisma.labInventory.create({
    data: {
      labOrgId,
      name: input.name.trim(),
      category: input.category,
      quantity: input.quantity,
      unit: input.unit.trim(),
      reorderLevel: input.reorderLevel,
    },
  });
  return toItem(created);
}

export async function updateLabInventory(
  auth: AuthSessionUser,
  itemId: string,
  input: SaveLabInventoryRequest,
): Promise<LabInventoryItem> {
  const labOrgId = requireLab(auth);
  const existing = await prisma.labInventory.findFirst({
    where: { id: itemId, labOrgId },
    select: { id: true },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'That inventory item could not be found');
  }
  const updated = await prisma.labInventory.update({
    where: { id: existing.id },
    data: {
      name: input.name.trim(),
      category: input.category,
      quantity: input.quantity,
      unit: input.unit.trim(),
      reorderLevel: input.reorderLevel,
    },
  });
  return toItem(updated);
}

export async function adjustLabStock(
  auth: AuthSessionUser,
  itemId: string,
  input: AdjustLabStockRequest,
): Promise<LabInventoryItem> {
  const labOrgId = requireLab(auth);
  const item = await prisma.labInventory.findFirst({ where: { id: itemId, labOrgId } });
  if (!item) {
    throw new AppError(404, 'NOT_FOUND', 'That inventory item could not be found');
  }
  const delta = milli(input.quantity);
  const current = milli(item.quantity.toString());
  const next = input.kind === 'RECEIVED' ? current + delta : current - delta;
  if (next < 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Stock cannot go below zero');
  }
  let labJobId: string | null = null;
  if (input.kind === 'USAGE' && input.labJobId && input.labJobId.length > 0) {
    const job = await prisma.labJob.findFirst({
      where: { id: input.labJobId, labOrgId },
      select: { id: true },
    });
    if (!job) {
      throw new AppError(422, 'VALIDATION_ERROR', 'That job is not in this laboratory');
    }
    labJobId = job.id;
  }
  const balance = fromMilli(next);
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.labInventory.update({
      where: { id: item.id },
      data: { quantity: balance },
    });
    await tx.labStockMovement.create({
      data: {
        labOrgId,
        itemId: item.id,
        kind: input.kind,
        quantity: input.quantity,
        balanceAfter: balance,
        supplier: input.kind === 'RECEIVED' ? blankToNull(input.supplier) : null,
        labJobId,
        occurredAt:
          input.kind === 'RECEIVED' ? new Date(`${input.occurredOn}T00:00:00.000Z`) : new Date(),
        createdByUserId: auth.userId,
      },
    });
    return saved;
  });
  return toItem(updated);
}

function toItem(row: {
  id: string;
  name: string;
  category: string;
  quantity: { toString(): string };
  unit: string;
  reorderLevel: { toString(): string };
}): LabInventoryItem {
  const quantity = formatQty(row.quantity.toString());
  const reorderLevel = formatQty(row.reorderLevel.toString());
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    quantity,
    unit: row.unit,
    reorderLevel,
    lowStock: milli(quantity) <= milli(reorderLevel),
  };
}

function milli(value: string): number {
  const [whole, fraction = ''] = value.split('.');
  const padded = `${fraction}000`.slice(0, 3);
  return Number(whole) * 1000 + Number(padded);
}

function fromMilli(value: number): string {
  const whole = Math.trunc(value / 1000);
  const fraction = String(value % 1000).padStart(3, '0');
  return formatQty(`${whole}.${fraction}`);
}

function formatQty(value: string): string {
  if (!value.includes('.')) {
    return value;
  }
  return value.replace(/0+$/, '').replace(/\.$/, '');
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function requireLab(auth: AuthSessionUser): string {
  if (auth.orgType !== 'LABORATORY' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This action is available to laboratories');
  }
  return auth.orgId;
}
