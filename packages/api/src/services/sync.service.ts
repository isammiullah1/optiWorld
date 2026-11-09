import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  moneyToCents,
  type AuthSessionUser,
  type OfflineInvoice,
  type ResolveConflictRequest,
  type ResolveConflictResponse,
  type ServerInvoice,
  type SyncInvoiceResult,
  type SyncPullResponse,
} from '@optiworld/shared';

import { persistLinePrescription } from './customers.service.js';
import { recordSaleMovements } from './inventory.service.js';
import { recordInvoiceDelivery } from './deliveries.service.js';
import { attachInvoiceLabJob, attachLineLabJobs } from './pos-billing.service.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

type LockedBatch = {
  stockQty: number;
  productName: string;
  priceCode: string;
  salePrice: string;
  category: string;
  prescriptionRequired: boolean | null;
};

type StoredItem = {
  id: string;
  inventoryBatchId: string | null;
  productName: string;
  priceCode: string;
  quantity: number;
  unitPrice: { toFixed: (digits: number) => string };
  salePrice: { toFixed: (digits: number) => string };
  stockShortfall: number;
};

type StoredInvoice = {
  id: string;
  orgId: string;
  customerId: string;
  localId: string | null;
  invoiceNumber: number;
  status: ServerInvoice['status'];
  total: { toFixed: (digits: number) => string };
  discount: { toFixed: (digits: number) => string };
  paymentType: ServerInvoice['paymentType'];
  issuedAt: Date;
  needsReview: boolean;
  reviewReason: string | null;
  updatedAt: Date;
  items: StoredItem[];
};

class SaleNotApplied extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaleNotApplied';
  }
}

export async function pushOfflineInvoices(
  auth: AuthSessionUser,
  invoices: readonly OfflineInvoice[],
): Promise<{
  results: SyncInvoiceResult[];
  invoices: Array<{
    localId: string;
    serverId: string | null;
    invoiceNumber: number | null;
  }>;
}> {
  const orgId = requiredOrgId(auth);
  const results: SyncInvoiceResult[] = [];
  for (const invoice of invoices) {
    results.push(await syncOneInvoice(orgId, auth.userId, invoice));
  }
  logger.info('Offline invoices pushed', { orgId, count: invoices.length });
  return {
    results,
    invoices: results.map((result) => ({
      localId: result.localId,
      serverId: result.serverId,
      invoiceNumber: result.invoiceNumber,
    })),
  };
}

export async function pullChanges(
  auth: AuthSessionUser,
  since: Date | null,
): Promise<SyncPullResponse> {
  const orgId = requiredOrgId(auth);
  const serverTime = new Date();
  const changedSince = since ? { gte: since } : undefined;

  const [customers, deletedCustomers, batches, deletedBatches, invoices] = await Promise.all([
    prisma.customer.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(changedSince ? { updatedAt: changedSince } : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        creditLimit: true,
        updatedAt: true,
      },
    }),
    since
      ? prisma.customer.findMany({
          where: { orgId, deletedAt: { gte: since } },
          select: { id: true },
        })
      : Promise.resolve([]),
    prisma.inventoryBatch.findMany({
      where: {
        orgId,
        deletedAt: null,
        ...(changedSince ? { updatedAt: changedSince } : {}),
      },
      select: {
        id: true,
        priceCode: true,
        prefix: true,
        productName: true,
        category: true,
        prescriptionRequired: true,
        salePrice: true,
        stockQty: true,
        lowStockThreshold: true,
        updatedAt: true,
      },
    }),
    since
      ? prisma.inventoryBatch.findMany({
          where: { orgId, deletedAt: { gte: since } },
          select: { id: true },
        })
      : Promise.resolve([]),
    prisma.invoice.findMany({
      where: { orgId, ...(changedSince ? { updatedAt: changedSince } : {}) },
      include: { items: true },
      orderBy: { invoiceNumber: 'asc' },
    }),
  ]);

  const changedAt = serverTime.toISOString();
  return {
    serverTime: changedAt,
    changedAt,
    customers: {
      upserted: customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        creditLimit: customer.creditLimit.toFixed(2),
        updatedAt: customer.updatedAt.toISOString(),
      })),
      deletedIds: deletedCustomers.map((customer) => customer.id),
    },
    inventoryBatches: {
      upserted: batches.map((batch) => ({
        id: batch.id,
        priceCode: batch.priceCode,
        prefix: batch.prefix,
        productName: batch.productName,
        category: batch.category,
        prescriptionRequired: batch.prescriptionRequired,
        salePrice: batch.salePrice.toFixed(2),
        stockQty: batch.stockQty,
        lowStockThreshold: batch.lowStockThreshold,
        updatedAt: batch.updatedAt.toISOString(),
      })),
      deletedIds: deletedBatches.map((batch) => batch.id),
    },
    invoices: invoices.map((invoice) => toServerInvoice(invoice)),
  };
}

export async function discardOfflineConflict(
  auth: AuthSessionUser,
  localId: string,
): Promise<ResolveConflictResponse> {
  const invoice = await findByLocalId(requiredOrgId(auth), localId);
  return {
    resolution: 'ACCEPT_SERVER',
    invoice: invoice ? toServerInvoice(invoice) : null,
  };
}

export async function resolveSyncConflict(
  auth: AuthSessionUser,
  request: ResolveConflictRequest,
): Promise<ResolveConflictResponse> {
  const orgId = requiredOrgId(auth);
  if (request.resolution !== 'ACCEPT_SERVER' && auth.role !== 'OWNER') {
    throw new AppError(403, 'FORBIDDEN', 'Only the retailer owner can resolve a sale');
  }

  if (request.resolution === 'ACCEPT_SERVER') {
    const invoice = await findByLocalId(orgId, request.clientLocalId);
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', 'This sale is not on the server yet');
    }
    return { resolution: 'ACCEPT_SERVER', invoice: toServerInvoice(invoice) };
  }

  if (request.resolution === 'ACKNOWLEDGE_REVIEW') {
    const updated = await prisma.invoice.updateMany({
      where: { orgId, localId: request.clientLocalId, needsReview: true },
      data: { needsReview: false },
    });
    const invoice = await findByLocalId(orgId, request.clientLocalId);
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', 'This sale is not on the server yet');
    }
    if (updated.count === 0) {
      throw new AppError(409, 'SYNC_CONFLICT', 'This sale is not waiting for review');
    }
    await prisma.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'OFFLINE_INVOICE_REVIEWED',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: { clientLocalId: request.clientLocalId },
      },
    });
    return {
      resolution: 'ACKNOWLEDGE_REVIEW',
      invoice: toServerInvoice({ ...invoice, needsReview: false }),
    };
  }

  const payload = request.invoice;
  if (!payload) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The device copy of the sale is required');
  }

  const existing = await findByLocalId(orgId, request.clientLocalId);
  if (!existing) {
    const created = await syncOneInvoice(orgId, auth.userId, payload);
    if (created.syncStatus === 'CONFLICT' || !created.serverId) {
      throw new AppError(
        409,
        'SYNC_CONFLICT',
        created.reviewReason ?? 'The sale could not be saved',
      );
    }
    const invoice = await findByLocalId(orgId, request.clientLocalId);
    return { resolution: 'ACCEPT_LOCAL', invoice: invoice ? toServerInvoice(invoice) : null };
  }

  if (sameSale(existing, payload)) {
    return { resolution: 'ACCEPT_LOCAL', invoice: toServerInvoice(existing) };
  }

  try {
    const replaced = await replaceOfflineInvoice(orgId, auth.userId, existing, payload);
    return { resolution: 'ACCEPT_LOCAL', invoice: replaced };
  } catch (error) {
    if (error instanceof SaleNotApplied) {
      throw new AppError(409, 'SYNC_CONFLICT', error.message);
    }
    throw error;
  }
}

async function syncOneInvoice(
  orgId: string,
  userId: string,
  invoice: OfflineInvoice,
): Promise<SyncInvoiceResult> {
  const pricing = priceInvoice(invoice);
  if (!pricing.ok) {
    await recordConflictAlert(orgId, pricing.reason);
    return conflictResult(invoice.localId, pricing.reason);
  }

  const existing = await findByLocalId(orgId, invoice.localId);
  if (existing) {
    const replay = existingResult(existing, invoice);
    if (replay.syncStatus === 'CONFLICT') {
      await recordConflictAlert(orgId, replay.reviewReason ?? 'This sale needs an owner.');
    }
    return replay;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const found = await tx.customer.findFirst({
        where: { id: invoice.customerId, orgId, deletedAt: null },
        select: { id: true, name: true },
      });
      const customer =
        found ??
        (invoice.customerName
          ? await tx.customer.create({
              data: {
                id: invoice.customerId,
                orgId,
                name: invoice.customerName,
                phone: invoice.customerPhone ?? null,
                creditLimit: '0.00',
              },
              select: { id: true, name: true },
            })
          : null);
      if (!customer) {
        throw new SaleNotApplied(
          'This customer is not in the organisation. The sale is still on this device.',
        );
      }

      const locked = await lockBatches(
        tx,
        orgId,
        invoice.items.map((item) => item.inventoryBatchId),
      );
      const prescriptions = await linePrescriptions(orgId, invoice.customerId, invoice.items);
      const applied = applySaleToStock(invoice, locked, prescriptions);
      const settled = openingReceipt(invoice, pricing.total);
      const created = await tx.invoice.create({
        data: {
          orgId,
          customerId: invoice.customerId,
          localId: invoice.localId,
          invoiceNumber: await nextInvoiceNumber(tx, orgId),
          status: settled.status,
          total: pricing.total,
          discount: pricing.discount,
          paymentType: invoice.paymentType,
          isOffline: true,
          issuedAt: new Date(invoice.issuedAt),
          syncedAt: new Date(),
          needsReview: applied.needsReview,
          reviewReason: applied.reviewReason,
          items: {
            create: applied.lines,
          },
        },
        include: { items: true },
      });

      for (const [batchId, stockQty] of applied.stockWrites) {
        await tx.inventoryBatch.update({
          where: { id: batchId },
          data: { stockQty },
        });
      }
      await recordSaleMovements(tx, orgId, created.items, userId);

      if (settled.amount) {
        await tx.payment.create({
          data: {
            customerId: invoice.customerId,
            invoiceId: created.id,
            orgId,
            amount: settled.amount,
            method: 'CASH',
            ...(invoice.paymentType === 'CREDIT' ? { notes: 'Amount received' } : {}),
          },
        });
      }

      if (invoice.labJob) {
        const reference = await attachInvoiceLabJob(tx, {
          orgId,
          userId,
          invoiceId: created.id,
          customerName: customer.name,
          prescription: invoice.labJob,
        });
        if (!reference && !created.needsReview) {
          await tx.invoice.update({
            where: { id: created.id },
            data: {
              needsReview: true,
              reviewReason:
                'The laboratory prescription was kept on this device because that lab is not connected.',
            },
          });
        }
      }

      const missingLineLab = await attachLineLabJobs(tx, {
        orgId,
        userId,
        invoiceId: created.id,
        customerName: customer.name,
        billLabOrgId: invoice.billLabOrgId,
        assignAllToLab: invoice.assignAllToLab === true,
        lines: invoice.items.map((item, index) => {
          const batch = locked.get(item.inventoryBatchId);
          return {
            productName: applied.lines[index]?.productName ?? batch?.productName ?? '',
            category: batch?.category ?? '',
            prescriptionRequired: batch?.prescriptionRequired ?? null,
            reading: item.prescription
              ? {
                  right: item.prescription.right,
                  left: item.prescription.left,
                  add: item.prescription.add,
                  pd: item.prescription.pd,
                  notes: item.prescription.notes,
                }
              : null,
            labOrgId: item.prescription?.labOrgId,
          };
        }),
      });
      if (missingLineLab && !created.needsReview) {
        await tx.invoice.update({
          where: { id: created.id },
          data: {
            needsReview: true,
            reviewReason:
              'A prescription was kept on this device because that lab is not connected.',
          },
        });
      }

      const deliveryAddress = invoice.deliveryAddress?.trim() ?? '';
      if (deliveryAddress) {
        await recordInvoiceDelivery(tx, {
          orgId,
          invoiceId: created.id,
          address: deliveryAddress,
          chargeCents: moneyToCents(invoice.deliveryCharge ?? '0'),
        });
      }

      if (applied.needsReview) {
        await notifyOwners(tx, orgId, created.id, created.invoiceNumber, applied.reviewReason);
      }

      await tx.auditLog.create({
        data: {
          orgId,
          userId,
          action: 'OFFLINE_INVOICE_SYNCED',
          entityType: 'Invoice',
          entityId: created.id,
          metadata: {
            clientLocalId: invoice.localId,
            invoiceNumber: created.invoiceNumber,
            needsReview: applied.needsReview,
          },
        },
      });

      return syncedResult(created);
    });
  } catch (error) {
    if (error instanceof SaleNotApplied) {
      await recordConflictAlert(orgId, error.message);
      return conflictResult(invoice.localId, error.message);
    }
    if (!isUniqueConstraint(error)) {
      throw error;
    }
    const raced = await findByLocalId(orgId, invoice.localId);
    if (!raced) {
      throw error;
    }
    return existingResult(raced, invoice);
  }
}

async function replaceOfflineInvoice(
  orgId: string,
  userId: string,
  existing: StoredInvoice,
  invoice: OfflineInvoice,
): Promise<ServerInvoice> {
  const pricing = priceInvoice(invoice);
  if (!pricing.ok) {
    throw new AppError(409, 'SYNC_CONFLICT', pricing.reason);
  }

  return prisma.$transaction(async (tx) => {
    const found = await tx.customer.findFirst({
      where: { id: invoice.customerId, orgId, deletedAt: null },
      select: { id: true },
    });
    const customer =
      found ??
      (invoice.customerName
        ? await tx.customer.create({
            data: {
              id: invoice.customerId,
              orgId,
              name: invoice.customerName,
              phone: invoice.customerPhone ?? null,
              creditLimit: '0.00',
            },
            select: { id: true },
          })
        : null);
    if (!customer) {
      throw new AppError(409, 'SYNC_CONFLICT', 'This customer is not in the organisation');
    }

    const batchIds = [
      ...existing.items.map((item) => requiredBatchId(item.inventoryBatchId)),
      ...invoice.items.map((item) => item.inventoryBatchId),
    ];
    const locked = await lockBatches(tx, orgId, batchIds);
    for (const item of existing.items) {
      const batch = locked.get(requiredBatchId(item.inventoryBatchId));
      if (!batch) {
        throw new AppError(
          409,
          'SYNC_CONFLICT',
          'A product on the saved sale is no longer available',
        );
      }
      batch.stockQty += Math.max(0, item.quantity - item.stockShortfall);
    }

    const prescriptions = await linePrescriptions(orgId, invoice.customerId, invoice.items);
    const applied = applySaleToStock(invoice, locked, prescriptions);
    const settled = openingReceipt(invoice, pricing.total);
    await tx.payment.deleteMany({ where: { invoiceId: existing.id } });
    await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
    const updated = await tx.invoice.update({
      where: { id: existing.id },
      data: {
        customerId: invoice.customerId,
        status: settled.status,
        total: pricing.total,
        discount: pricing.discount,
        paymentType: invoice.paymentType,
        issuedAt: new Date(invoice.issuedAt),
        syncedAt: new Date(),
        needsReview: applied.needsReview,
        reviewReason: applied.reviewReason,
        items: { create: applied.lines },
      },
      include: { items: true },
    });

    for (const [batchId, stockQty] of applied.stockWrites) {
      await tx.inventoryBatch.update({
        where: { id: batchId },
        data: { stockQty },
      });
    }
    await recordSaleMovements(tx, orgId, updated.items, userId);

    if (settled.amount) {
      await tx.payment.create({
        data: {
          customerId: invoice.customerId,
          invoiceId: updated.id,
          orgId,
          amount: settled.amount,
          method: 'CASH',
          ...(invoice.paymentType === 'CREDIT' ? { notes: 'Amount received' } : {}),
        },
      });
    }

    const deliveryAddress = invoice.deliveryAddress?.trim() ?? '';
    if (deliveryAddress) {
      await recordInvoiceDelivery(tx, {
        orgId,
        invoiceId: updated.id,
        address: deliveryAddress,
        chargeCents: moneyToCents(invoice.deliveryCharge ?? '0'),
      });
    }

    if (applied.needsReview) {
      await notifyOwners(tx, orgId, updated.id, updated.invoiceNumber, applied.reviewReason);
    }

    await tx.auditLog.create({
      data: {
        orgId,
        userId,
        action: 'OFFLINE_INVOICE_REPLACED',
        entityType: 'Invoice',
        entityId: updated.id,
        metadata: { clientLocalId: invoice.localId, invoiceNumber: updated.invoiceNumber },
      },
    });

    return toServerInvoice(updated);
  });
}

async function linePrescriptions(
  orgId: string,
  customerId: string,
  items: OfflineInvoice['items'],
): Promise<Map<string, { summary: string }>> {
  const snapshots = new Map<string, { summary: string }>();
  for (const item of items) {
    if (!item.prescription) {
      continue;
    }
    snapshots.set(
      item.localItemId,
      await persistLinePrescription(orgId, customerId, item.prescription),
    );
  }
  return snapshots;
}

function applySaleToStock(
  invoice: OfflineInvoice,
  locked: Map<string, LockedBatch>,
  prescriptions: Map<string, { summary: string }> = new Map(),
): {
  lines: Array<{
    inventoryBatchId: string;
    productName: string;
    priceCode: string;
    quantity: number;
    unitPrice: string;
    salePrice: string;
    stockShortfall: number;
    prescription?: { summary: string };
  }>;
  stockWrites: Map<string, number>;
  needsReview: boolean;
  reviewReason: string | null;
  shortfalls: SyncInvoiceResult['stockShortfalls'];
} {
  const lines = [];
  let shortUnits = 0;
  const shortfalls: SyncInvoiceResult['stockShortfalls'] = [];

  for (const item of invoice.items) {
    const batch = locked.get(item.inventoryBatchId);
    if (!batch) {
      throw new SaleNotApplied(
        'A product on this sale is not in the organisation. The sale is still on this device.',
      );
    }
    const deducted = Math.min(batch.stockQty, item.quantity);
    const shortfall = item.quantity - deducted;
    batch.stockQty -= deducted;
    shortUnits += shortfall;
    const unitPrice = centsToMoney(moneyToCents(item.unitPrice));
    lines.push({
      inventoryBatchId: item.inventoryBatchId,
      productName: batch.productName,
      priceCode: batch.priceCode,
      quantity: item.quantity,
      unitPrice,
      salePrice: batch.salePrice,
      stockShortfall: shortfall,
      ...(prescriptions.get(item.localItemId)
        ? { prescription: prescriptions.get(item.localItemId) }
        : {}),
    });
    shortfalls.push({
      inventoryBatchId: item.inventoryBatchId,
      requested: item.quantity,
      deducted,
      shortfall,
    });
  }

  const stockWrites = new Map<string, number>();
  for (const [batchId, batch] of locked) {
    stockWrites.set(batchId, batch.stockQty);
  }

  const reviewReason =
    shortUnits > 0
      ? `Stock was short by ${shortUnits} units. The sale was kept and needs an owner review.`
      : null;

  return {
    lines,
    stockWrites,
    needsReview: shortUnits > 0,
    reviewReason,
    shortfalls,
  };
}

async function lockBatches(
  tx: Pick<typeof prisma, '$queryRaw'>,
  orgId: string,
  batchIds: readonly string[],
): Promise<Map<string, LockedBatch>> {
  const locked = new Map<string, LockedBatch>();
  for (const batchId of [...new Set(batchIds)].sort()) {
    const rows = await tx.$queryRaw<
      Array<{
        stock_qty: number;
        product_name: string;
        price_code: string;
        sale_price: string;
        category: string;
        prescription_required: boolean | null;
      }>
    >`
      SELECT stock_qty, product_name, price_code, sale_price::text AS sale_price, category, prescription_required
      FROM inventory_batches
      WHERE id = ${batchId}::uuid
        AND org_id = ${orgId}::uuid
        AND deleted_at IS NULL
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) {
      throw new SaleNotApplied(
        'A product on this sale is not in the organisation. The sale is still on this device.',
      );
    }
    locked.set(batchId, {
      stockQty: Number(row.stock_qty),
      productName: row.product_name,
      priceCode: row.price_code,
      salePrice: centsToMoney(moneyToCents(row.sale_price)),
      category: row.category,
      prescriptionRequired: row.prescription_required,
    });
  }
  return locked;
}

async function nextInvoiceNumber(
  tx: Pick<typeof prisma, 'invoiceSequence'>,
  orgId: string,
): Promise<number> {
  const sequence = await tx.invoiceSequence.upsert({
    where: { orgId },
    create: { orgId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return sequence.lastNumber;
}

async function recordConflictAlert(orgId: string, reason: string): Promise<void> {
  const owners = await prisma.user.findMany({
    where: { orgId, role: 'OWNER', isActive: true },
    select: { id: true },
  });
  const recipients = owners.length > 0 ? owners.map((owner) => owner.id) : [null];
  await prisma.alert.createMany({
    data: recipients.map((userId) => ({
      orgId,
      userId,
      type: 'INVOICE_REVIEW' as const,
      title: 'Offline sale needs attention',
      body: reason,
      relatedEntityType: 'Invoice',
    })),
  });
}

async function notifyOwners(
  tx: Pick<typeof prisma, 'user' | 'alert'>,
  orgId: string,
  invoiceId: string,
  invoiceNumber: number,
  reviewReason: string | null,
): Promise<void> {
  const owners = await tx.user.findMany({
    where: { orgId, role: 'OWNER', isActive: true },
    select: { id: true },
  });
  const body = `Invoice ${invoiceNumber}: ${reviewReason ?? 'This offline sale needs review.'}`;
  const recipients = owners.length > 0 ? owners.map((owner) => owner.id) : [null];
  await tx.alert.createMany({
    data: recipients.map((userId) => ({
      orgId,
      userId,
      type: 'INVOICE_REVIEW',
      title: 'Offline sale needs review',
      body,
      relatedEntityId: invoiceId,
      relatedEntityType: 'Invoice',
    })),
  });
}

function openingReceipt(
  invoice: OfflineInvoice,
  total: string,
): { status: 'PAID' | 'CREDIT'; amount: string | null } {
  const totalCents = moneyToCents(total);
  if (invoice.paymentType === 'CASH' && invoice.amountReceived === undefined) {
    return { status: 'PAID', amount: total };
  }
  const received = invoice.amountReceived === undefined ? 0 : moneyToCents(invoice.amountReceived);
  if (received > totalCents) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Enter an amount from zero up to the bill total');
  }
  return {
    status: received >= totalCents ? 'PAID' : 'CREDIT',
    amount: received > 0 ? centsToMoney(received) : null,
  };
}

function priceInvoice(
  invoice: OfflineInvoice,
): { ok: true; total: string; discount: string } | { ok: false; reason: string } {
  const subtotal = invoice.items.reduce(
    (sum, item) => sum + moneyToCents(item.unitPrice) * item.quantity,
    0,
  );
  const discount = moneyToCents(invoice.discount);
  if (discount > subtotal) {
    return {
      ok: false,
      reason: 'The discount is larger than the sale total. The sale is still on this device.',
    };
  }
  const deliveryAddress = invoice.deliveryAddress?.trim() ?? '';
  const charge = deliveryAddress ? moneyToCents(invoice.deliveryCharge ?? '0') : 0;
  return {
    ok: true,
    total: centsToMoney(subtotal - discount + charge),
    discount: centsToMoney(discount),
  };
}

function existingResult(existing: StoredInvoice, invoice: OfflineInvoice): SyncInvoiceResult {
  if (sameSale(existing, invoice)) {
    return syncedResult(existing);
  }
  return conflictResult(
    invoice.localId,
    'This sale was already synced with different details. It stays on this device until an owner resolves it.',
    existing,
  );
}

function sameSale(existing: StoredInvoice, invoice: OfflineInvoice): boolean {
  if (
    existing.customerId !== invoice.customerId ||
    existing.status !== invoice.status ||
    existing.paymentType !== invoice.paymentType ||
    moneyToCents(existing.discount.toFixed(2)) !== moneyToCents(invoice.discount) ||
    existing.items.length !== invoice.items.length
  ) {
    return false;
  }

  const stored = existing.items
    .map(
      (item) =>
        `${item.inventoryBatchId}:${item.quantity}:${moneyToCents(item.unitPrice.toFixed(2))}`,
    )
    .sort();
  const incoming = invoice.items
    .map((item) => `${item.inventoryBatchId}:${item.quantity}:${moneyToCents(item.unitPrice)}`)
    .sort();
  return stored.every((line, index) => line === incoming[index]);
}

function syncedResult(invoice: StoredInvoice): SyncInvoiceResult {
  return {
    localId: invoice.localId ?? invoice.id,
    syncStatus: 'SYNCED',
    serverId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    needsReview: invoice.needsReview,
    reviewReason: invoice.reviewReason,
    stockShortfalls: invoice.items.map((item) => ({
      inventoryBatchId: requiredBatchId(item.inventoryBatchId),
      requested: item.quantity,
      deducted: item.quantity - item.stockShortfall,
      shortfall: item.stockShortfall,
    })),
  };
}

function conflictResult(
  localId: string,
  reason: string,
  existing?: StoredInvoice,
): SyncInvoiceResult {
  return {
    localId,
    syncStatus: 'CONFLICT',
    serverId: existing?.id ?? null,
    invoiceNumber: existing?.invoiceNumber ?? null,
    needsReview: existing?.needsReview ?? false,
    reviewReason: reason,
    stockShortfalls: [],
  };
}

function toServerInvoice(invoice: StoredInvoice): ServerInvoice {
  return {
    id: invoice.id,
    localId: invoice.localId ?? invoice.id,
    clientLocalId: invoice.localId,
    serverId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    status: invoice.status,
    paymentType: invoice.paymentType,
    total: invoice.total.toFixed(2),
    discount: invoice.discount.toFixed(2),
    needsReview: invoice.needsReview,
    reviewReason: invoice.reviewReason,
    issuedAt: invoice.issuedAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    items: invoice.items.map((item) => ({
      localItemId: item.id,
      inventoryBatchId: requiredBatchId(item.inventoryBatchId),
      productName: item.productName,
      priceCode: item.priceCode,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      salePrice: item.salePrice.toFixed(2),
      stockShortfall: item.stockShortfall,
    })),
  };
}

async function findByLocalId(orgId: string, localId: string): Promise<StoredInvoice | null> {
  return prisma.invoice.findFirst({
    where: { orgId, localId },
    include: { items: true },
  });
}

function requiredBatchId(inventoryBatchId: string | null): string {
  if (!inventoryBatchId) {
    throw new AppError(409, 'SYNC_CONFLICT', 'A product on the saved sale is no longer available');
  }
  return inventoryBatchId;
}

function requiredOrgId(auth: AuthSessionUser): string {
  if (!auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'A retailer organisation is required');
  }
  return auth.orgId;
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
