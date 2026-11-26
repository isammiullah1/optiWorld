import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  isSameSaleDay,
  labJobNeedsLabDecision,
  moneyToCents,
  prescriptionIssuePaths,
  type AuthSessionUser,
  type EditInvoiceSaleRequest,
  type FinalizeInvoiceLabRequest,
  type InvoiceNotice,
  type JobStatus,
  type ReceiptPrescription,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { isShopOwner, requiredShopOrgId } from '../lib/shop-org.js';
import { refreshDeliveryForInvoice } from './deliveries.service.js';
import { recordSaleMovements, returnMovementNote } from './inventory.service.js';
import {
  requestReceivedCancellation,
  requestReceivedPrescription,
} from './lab-job-requests.service.js';
import { notifyCustomerJobStatus } from './lab-jobs.service.js';
import { attachLineLabJobs } from './pos-billing.service.js';

function labJobOpen(status: string): boolean {
  return status !== 'CANCELLED' && status !== 'OUTSOURCED';
}

function canReleaseLabJob(status: string): boolean {
  return status === 'SUBMITTED' || status === 'CONFIRMED' || status === 'REJECTED';
}

function pastReceived(status: string): boolean {
  return (
    status === 'CUTTING' ||
    status === 'FITTING' ||
    status === 'QC' ||
    status === 'READY' ||
    status === 'DISPATCHED'
  );
}

export async function cancelRetailerInvoice(
  auth: AuthSessionUser,
  invoiceId: string,
  reason: string,
): Promise<InvoiceNotice> {
  const orgId = requireOwner(auth);
  const savedReason = reason.trim();
  const invoice = await loadBill(orgId, invoiceId);
  if (invoice.cancelledAt) {
    throw new AppError(409, 'ORDER_LOCKED', 'This bill is already cancelled');
  }
  if (invoice.labJobs.some((job) => labJobNeedsLabDecision(job.status as JobStatus))) {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'The laboratory has this job. Request cancellation and wait for the laboratory to accept before cancelling the bill.',
    );
  }
  await prisma.$transaction(async (tx) => {
    for (const item of invoice.items) {
      const restore = Math.max(0, item.quantity - item.stockShortfall);
      if (!item.inventoryBatchId || restore === 0) {
        continue;
      }
      await tx.inventoryBatch.updateMany({
        where: { id: item.inventoryBatchId, orgId },
        data: { stockQty: { increment: restore } },
      });
    }
    for (const job of invoice.labJobs) {
      if (
        job.status === 'CANCELLED' ||
        job.status === 'OUTSOURCED' ||
        job.status === 'DISPATCHED'
      ) {
        continue;
      }
      await tx.labJob.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });
      await tx.labJobStatusHistory.create({
        data: {
          labJobId: job.id,
          status: 'CANCELLED',
          notes: savedReason,
          changedByUserId: auth.userId,
        },
      });
      await tx.alert.create({
        data: {
          orgId: job.labOrgId,
          type: 'LAB_JOB_STATUS',
          title: 'Lab job cancelled',
          body: `${job.referenceNumber} was cancelled because the shop cancelled the bill. ${savedReason}`,
          relatedEntityId: job.id,
          relatedEntityType: 'LabJob',
        },
      });
    }
    const delivery = await tx.delivery.findUnique({ where: { invoiceId: invoice.id } });
    if (delivery && delivery.status !== 'DELIVERED') {
      await tx.delivery.delete({ where: { id: delivery.id } });
    }
    await tx.invoice.update({ where: { id: invoice.id }, data: { cancelledAt: new Date() } });
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'INVOICE_CANCELLED',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: { invoiceNumber: invoice.invoiceNumber, reason: savedReason },
      },
    });
  });
  const reference =
    invoice.labJobs.find((job) => labJobOpen(job.status))?.referenceNumber ??
    `Invoice #${invoice.invoiceNumber}`;
  const shopName = invoice.org.name;
  const text =
    `${shopName}: ${reference} for ${invoice.customer.name} was cancelled. ${savedReason}`.slice(
      0,
      1024,
    );
  const notice = await notifyCustomerJobStatus(
    auth,
    invoice.id,
    'Invoice',
    customerPhone(invoice.customer),
    shopName,
    reference,
    'Cancelled',
    text,
    'The bill was cancelled.',
  );
  return { id: invoice.id, sent: notice.sent, message: notice.message };
}

export async function sendInvoiceToLab(
  auth: AuthSessionUser,
  invoiceId: string,
  labOrgId: string,
  serviceIds: readonly string[],
): Promise<InvoiceNotice> {
  const orgId = requireOwner(auth);
  const invoice = await loadBill(orgId, invoiceId);
  assertOpen(invoice.cancelledAt);
  if (invoice.labJobs.some((job) => labJobOpen(job.status))) {
    throw new AppError(409, 'ORDER_LOCKED', 'This bill is already with a laboratory');
  }
  const linked = await prisma.labClient.findFirst({
    where: { labOrgId, linkedOrgId: orgId, status: 'APPROVED' },
    select: { id: true },
  });
  if (!linked) {
    throw new AppError(
      403,
      'CONNECTION_REQUIRED',
      'That laboratory has not accepted this connection',
    );
  }
  const lines = invoice.items.map((item) => ({
    productName: item.productName,
    category: item.inventoryBatch?.category ?? '',
    prescriptionRequired: item.inventoryBatch?.prescriptionRequired ?? null,
    reading: storedReading(item.prescription),
    labOrgId,
    serviceIds,
  }));
  if (!lines.some((line) => line.reading)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'This bill has no prescription to send');
  }
  await prisma.$transaction(async (tx) => {
    const skipped = await attachLineLabJobs(tx, {
      orgId,
      userId: auth.userId,
      invoiceId: invoice.id,
      customerName: invoice.customer.name,
      billLabOrgId: labOrgId,
      assignAllToLab: true,
      lines,
    });
    if (skipped) {
      throw new AppError(
        403,
        'CONNECTION_REQUIRED',
        'That laboratory has not accepted this connection',
      );
    }
    await refreshDeliveryForInvoice(tx, invoice.id);
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'INVOICE_SENT_TO_LAB',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: { invoiceNumber: invoice.invoiceNumber, labOrgId },
      },
    });
  });
  return { id: invoice.id, sent: false, message: 'The prescription was sent to the laboratory.' };
}

export async function unsendInvoiceLab(
  auth: AuthSessionUser,
  invoiceId: string,
): Promise<InvoiceNotice> {
  const orgId = requireOwner(auth);
  const invoice = await loadBill(orgId, invoiceId);
  assertOpen(invoice.cancelledAt);
  const active = invoice.labJobs.filter((job) => labJobOpen(job.status));
  if (active.length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'This bill is not with a laboratory');
  }
  if (active.some((job) => labJobNeedsLabDecision(job.status as JobStatus))) {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'This job is with the laboratory. Request cancellation and wait for them to accept.',
    );
  }
  if (active.some((job) => !canReleaseLabJob(job.status))) {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'The laboratory has already started this job. Cancel the lab job instead.',
    );
  }
  await prisma.$transaction(async (tx) => {
    for (const job of active) {
      await tx.alert.create({
        data: {
          orgId: job.labOrgId,
          type: 'LAB_JOB_STATUS',
          title: 'Lab job taken back',
          body: `${job.referenceNumber} was taken back by the shop before work started.`,
          relatedEntityId: job.id,
          relatedEntityType: 'LabJob',
        },
      });
      await tx.labJob.delete({ where: { id: job.id } });
    }
    await refreshDeliveryForInvoice(tx, invoice.id);
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'INVOICE_LAB_UNSENT',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          references: active.map((job) => job.referenceNumber),
        },
      },
    });
  });
  return { id: invoice.id, sent: false, message: 'The laboratory no longer has this job.' };
}

export async function cancelInvoiceLab(
  auth: AuthSessionUser,
  invoiceId: string,
  reason: string,
): Promise<InvoiceNotice> {
  const orgId = requireOwner(auth);
  const savedReason = reason.trim();
  const invoice = await loadBill(orgId, invoiceId);
  assertOpen(invoice.cancelledAt);
  const active = invoice.labJobs.filter((job) => labJobOpen(job.status));
  if (active.length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'This bill is not with a laboratory');
  }
  if (active.some((job) => job.status === 'DISPATCHED')) {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'The laboratory has finished this job, so it cannot be cancelled.',
    );
  }
  const held = active.filter((job) => labJobNeedsLabDecision(job.status as JobStatus));
  const immediate = active.filter((job) => !labJobNeedsLabDecision(job.status as JobStatus));
  for (const job of held) {
    await requestReceivedCancellation(auth, job.id, savedReason);
  }
  if (immediate.length === 0) {
    return {
      id: invoice.id,
      sent: false,
      message: 'The request was sent to the laboratory. The job stays as it is until they accept.',
    };
  }
  await prisma.$transaction(async (tx) => {
    for (const job of immediate) {
      await tx.labJob.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });
      await tx.labJobStatusHistory.create({
        data: {
          labJobId: job.id,
          status: 'CANCELLED',
          notes: savedReason,
          changedByUserId: auth.userId,
        },
      });
      await tx.alert.create({
        data: {
          orgId: job.labOrgId,
          type: 'LAB_JOB_STATUS',
          title: 'Lab job cancelled',
          body: `${job.referenceNumber} was cancelled by the shop. ${savedReason}`,
          relatedEntityId: job.id,
          relatedEntityType: 'LabJob',
        },
      });
    }
    await refreshDeliveryForInvoice(tx, invoice.id);
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'INVOICE_LAB_CANCELLED',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: { invoiceNumber: invoice.invoiceNumber, reason: savedReason },
      },
    });
  });
  return { id: invoice.id, sent: false, message: 'The laboratory job was cancelled.' };
}

export async function updateInvoicePrescription(
  auth: AuthSessionUser,
  invoiceId: string,
  items: readonly { itemId: string; prescription: ReceiptPrescription }[],
): Promise<InvoiceNotice> {
  const orgId = requireOwner(auth);
  const invoice = await loadBill(orgId, invoiceId);
  assertOpen(invoice.cancelledAt);
  const active = invoice.labJobs.filter((job) => labJobOpen(job.status));
  if (active.some((job) => pastReceived(job.status))) {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'Once processing starts, only a cancellation can be requested.',
    );
  }
  const byId = new Map(items.map((item) => [item.itemId, item.prescription]));
  const targets = invoice.items.filter(
    (item) => byId.has(item.id) && storedReading(item.prescription),
  );
  if (targets.length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Choose a prescription line on this bill');
  }
  const receivedJobs = active.filter((job) => job.status === 'RECEIVED');
  const directJobs = active.filter((job) => job.status !== 'RECEIVED');
  const heldItemIds = new Set<string>();
  for (const job of receivedJobs) {
    const match =
      targets.find((item) => item.productName === job.specialInstructions) ??
      (targets.length === 1 ? targets[0] : undefined);
    const prescription = match ? byId.get(match.id) : undefined;
    if (!match || !prescription) {
      continue;
    }
    heldItemIds.add(match.id);
    await requestReceivedPrescription(
      auth,
      {
        id: job.id,
        labOrgId: job.labOrgId,
        referenceNumber: job.referenceNumber,
        retailerOrgId: orgId,
      },
      {
        title: prescription.title?.trim() ?? '',
        right: prescription.right,
        left: prescription.left,
        add: prescription.add,
        pd: prescription.pd,
        notes: prescription.notes,
        invoiceItemId: match.id,
      },
    );
  }
  const directTargets = targets.filter((item) => !heldItemIds.has(item.id));
  if (directTargets.length === 0 && directJobs.length === 0) {
    return {
      id: invoice.id,
      sent: false,
      message:
        'The prescription change was sent to the laboratory. The job stays as it is until they accept.',
    };
  }
  await prisma.$transaction(async (tx) => {
    for (const item of directTargets) {
      const prescription = byId.get(item.id);
      if (!prescription) {
        continue;
      }
      await tx.invoiceItem.update({
        where: { id: item.id },
        data: {
          prescription: {
            title: prescription.title?.trim() ?? '',
            right: prescription.right,
            left: prescription.left,
            add: prescription.add,
            pd: prescription.pd,
            notes: prescription.notes,
          },
        },
      });
    }
    for (const job of directJobs) {
      const match =
        targets.find((item) => item.productName === job.specialInstructions) ??
        (targets.length === 1 ? targets[0] : undefined);
      const prescription = match ? byId.get(match.id) : undefined;
      if (!prescription) {
        continue;
      }
      await tx.labJob.update({
        where: { id: job.id },
        data: {
          prescription: {
            title: prescription.title?.trim() ?? '',
            right: prescription.right,
            left: prescription.left,
            add: prescription.add,
            pd: prescription.pd,
          },
          notes: prescription.notes.trim() || null,
        },
      });
      await tx.alert.create({
        data: {
          orgId: job.labOrgId,
          type: 'LAB_JOB_STATUS',
          title: 'Prescription updated',
          body: `${job.referenceNumber} has an updated prescription from the shop.`,
          relatedEntityId: job.id,
          relatedEntityType: 'LabJob',
        },
      });
    }
    const changes = directTargets.flatMap((item) => {
      const next = byId.get(item.id);
      if (!next) {
        return [];
      }
      const before = describeReading(item.prescription);
      const after = describeReading(next);
      if (before === after) {
        return [];
      }
      return before.length === 0
        ? [`Added a prescription on ${item.productName}: ${after}.`]
        : [`Updated the prescription on ${item.productName} from ${before} to ${after}.`];
    });
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'INVOICE_PRESCRIPTION_UPDATED',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          details: changes.length > 0 ? changes : ['Updated the prescription.'],
        },
      },
    });
  });
  const reference = active[0]?.referenceNumber ?? `Invoice #${invoice.invoiceNumber}`;
  const shopName = invoice.org.name;
  const text =
    `${shopName}: the prescription on ${reference} for ${invoice.customer.name} was updated.`.slice(
      0,
      1024,
    );
  const notice = await notifyCustomerJobStatus(
    auth,
    invoice.id,
    'Invoice',
    customerPhone(invoice.customer),
    shopName,
    reference,
    'Prescription updated',
    text,
    'The prescription was updated.',
  );
  return { id: invoice.id, sent: notice.sent, message: notice.message };
}

export async function finalizeInvoiceLabEdit(
  auth: AuthSessionUser,
  invoiceId: string,
  input: FinalizeInvoiceLabRequest,
): Promise<InvoiceNotice> {
  const orgId = requireOwner(auth);
  if (input.prescriptions.length === 0 && input.additions.length === 0) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Add a prescription or an item before finalising the sale.',
    );
  }
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId },
    select: {
      id: true,
      invoiceNumber: true,
      cancelledAt: true,
      discount: true,
      customer: { select: { id: true, name: true } },
      payments: { select: { amount: true } },
      delivery: { select: { charge: true } },
      items: {
        select: {
          id: true,
          productName: true,
          prescription: true,
          unitPrice: true,
          quantity: true,
        },
      },
      labJobs: {
        select: {
          id: true,
          status: true,
          labOrgId: true,
          specialInstructions: true,
          referenceNumber: true,
        },
      },
    },
  });
  if (!invoice) {
    throw new AppError(404, 'NOT_FOUND', 'Invoice was not found');
  }
  assertOpen(invoice.cancelledAt);
  const active = invoice.labJobs.filter((job) => labJobOpen(job.status));
  if (
    active.some(
      (job) => pastReceived(job.status) || labJobNeedsLabDecision(job.status as JobStatus),
    )
  ) {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'The laboratory has started this job. The sale stays as it is.',
    );
  }
  const byId = new Map(invoice.items.map((item) => [item.id, item]));
  for (const change of input.prescriptions) {
    if (!byId.has(change.itemId)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'One of the items is not on this sale');
    }
    const issues = prescriptionIssuePaths(change.prescription);
    if (issues.length > 0) {
      throw new AppError(422, 'VALIDATION_ERROR', issues[0]?.message ?? 'Check the prescription.');
    }
  }
  for (const addition of input.additions) {
    if (!addition.prescription) {
      continue;
    }
    const issues = prescriptionIssuePaths(addition.prescription);
    if (issues.length > 0) {
      throw new AppError(422, 'VALIDATION_ERROR', issues[0]?.message ?? 'Check the prescription.');
    }
  }
  const earlyLabId =
    active.length === 1 && canReleaseLabJob(active[0]?.status ?? '')
      ? (active[0]?.labOrgId ?? null)
      : null;
  await prisma.$transaction(async (tx) => {
    for (const change of input.prescriptions) {
      await tx.invoiceItem.update({
        where: { id: change.itemId },
        data: { prescription: change.prescription },
      });
    }
    const createdLines: Array<{
      id: string;
      inventoryBatchId: string | null;
      quantity: number;
      stockShortfall: number;
      productName: string;
      prescription: ReceiptPrescription | null;
    }> = [];
    for (const addition of input.additions) {
      const batch = await tx.inventoryBatch.findFirst({
        where: { id: addition.inventoryBatchId, orgId, deletedAt: null },
        select: {
          id: true,
          productName: true,
          priceCode: true,
          salePrice: true,
          stockQty: true,
          category: true,
          prescriptionRequired: true,
        },
      });
      if (!batch) {
        throw new AppError(422, 'VALIDATION_ERROR', 'A product in this sale is not in the shop');
      }
      const deducted = Math.min(batch.stockQty, addition.quantity);
      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: { stockQty: { decrement: deducted } },
      });
      const created = await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          inventoryBatchId: batch.id,
          productName: batch.productName,
          priceCode: batch.priceCode,
          quantity: addition.quantity,
          unitPrice: addition.unitPrice,
          salePrice: batch.salePrice,
          stockShortfall: addition.quantity - deducted,
          ...(addition.prescription ? { prescription: addition.prescription } : {}),
        },
        select: {
          id: true,
          inventoryBatchId: true,
          quantity: true,
          stockShortfall: true,
          productName: true,
        },
      });
      createdLines.push({ ...created, prescription: addition.prescription ?? null });
    }
    await recordSaleMovements(tx, orgId, createdLines, auth.userId);
    if (earlyLabId) {
      const job = active[0];
      const matched = job
        ? (input.prescriptions.find(
            (change) => byId.get(change.itemId)?.productName === job.specialInstructions,
          ) ?? (input.prescriptions.length === 1 ? input.prescriptions[0] : undefined))
        : undefined;
      if (job && matched) {
        await tx.labJob.update({
          where: { id: job.id },
          data: {
            prescription: {
              title: matched.prescription.title?.trim() ?? '',
              right: matched.prescription.right,
              left: matched.prescription.left,
              add: matched.prescription.add,
              pd: matched.prescription.pd,
            },
            notes: matched.prescription.notes.trim() || null,
          },
        });
      }
      const freshLines = createdLines.filter((line) => line.prescription);
      if (freshLines.length > 0) {
        await attachLineLabJobs(tx, {
          orgId,
          userId: auth.userId,
          invoiceId: invoice.id,
          customerName: invoice.customer.name,
          billLabOrgId: earlyLabId,
          assignAllToLab: true,
          lines: freshLines.map((line) => ({
            productName: line.productName,
            category: '',
            prescriptionRequired: true,
            reading: line.prescription,
            labOrgId: earlyLabId,
          })),
        });
      }
    }
    const items = await tx.invoiceItem.findMany({
      where: { invoiceId: invoice.id },
      select: { unitPrice: true, quantity: true },
    });
    const subtotal = items.reduce(
      (sum, item) => sum + moneyToCents(item.unitPrice.toFixed(2)) * item.quantity,
      0,
    );
    const discount = moneyToCents(invoice.discount.toFixed(2));
    const delivery = invoice.delivery ? moneyToCents(invoice.delivery.charge.toFixed(2)) : 0;
    if (discount > subtotal) {
      throw new AppError(422, 'VALIDATION_ERROR', 'The discount is higher than the sale.');
    }
    const total = subtotal - discount + delivery;
    const paid = invoice.payments.reduce(
      (sum, payment) => sum + moneyToCents(payment.amount.toFixed(2)),
      0,
    );
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { total: centsToMoney(total), status: paid >= total ? 'PAID' : 'CREDIT' },
    });
    await refreshDeliveryForInvoice(tx, invoice.id);
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'INVOICE_UPDATED',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          added: createdLines.map((line) => line.productName),
          total: centsToMoney(total),
          details: [
            ...createdLines.map((line) => `Added ${line.quantity} × ${line.productName}.`),
            `Total is now ${rupees(total)}.`,
          ],
        },
      },
    });
  });
  return {
    id: invoice.id,
    sent: false,
    message: 'The sale was updated. The total includes the new lines.',
  };
}

export async function editInvoiceSale(
  auth: AuthSessionUser,
  invoiceId: string,
  input: EditInvoiceSaleRequest,
): Promise<InvoiceNotice> {
  const orgId = requireOwner(auth);
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId },
    select: {
      id: true,
      invoiceNumber: true,
      issuedAt: true,
      cancelledAt: true,
      customerId: true,
      discount: true,
      paymentType: true,
      total: true,
      payments: { select: { amount: true } },
      delivery: { select: { charge: true } },
      items: {
        select: {
          id: true,
          productName: true,
          quantity: true,
          stockShortfall: true,
          inventoryBatchId: true,
          unitPrice: true,
        },
      },
    },
  });
  if (!invoice) {
    throw new AppError(404, 'NOT_FOUND', 'Invoice was not found');
  }
  assertOpen(invoice.cancelledAt);
  const sameDay = isSameSaleDay(invoice.issuedAt);
  if (!sameDay && input.additions.length > 0) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'A bill from an earlier day cannot gain items or a higher quantity.',
    );
  }
  const seen = new Set<string>();
  for (const line of input.items) {
    if (seen.has(line.itemId)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'An item was sent twice.');
    }
    seen.add(line.itemId);
  }
  const byId = new Map(invoice.items.map((item) => [item.id, item]));
  for (const line of input.items) {
    const current = byId.get(line.itemId);
    if (!current) {
      throw new AppError(422, 'VALIDATION_ERROR', 'One of the items is not on this bill.');
    }
    if (!sameDay && line.quantity > current.quantity) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        'A bill from an earlier day cannot gain items or a higher quantity.',
      );
    }
  }
  const removed = invoice.items.filter((item) => !seen.has(item.id));
  const quantityChanged = input.items.some(
    (line) => byId.get(line.itemId)?.quantity !== line.quantity,
  );
  const priceChanged = input.items.some((line) => {
    const item = byId.get(line.itemId);
    return (
      item !== undefined && moneyToCents(item.unitPrice.toFixed(2)) !== moneyToCents(line.unitPrice)
    );
  });
  const paidCents = invoice.payments.reduce(
    (sum, payment) => sum + moneyToCents(payment.amount.toFixed(2)),
    0,
  );
  const discountChanged =
    moneyToCents(input.discount) !== moneyToCents(invoice.discount.toFixed(2));
  const paymentChanged =
    input.paymentType !== invoice.paymentType ||
    (input.paymentType === 'CREDIT' && moneyToCents(input.amountReceived ?? '0') !== paidCents);
  if (
    removed.length === 0 &&
    !quantityChanged &&
    !priceChanged &&
    !discountChanged &&
    !paymentChanged &&
    input.additions.length === 0
  ) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Nothing on this bill was changed.');
  }
  if (input.items.length + input.additions.length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Keep at least one item, or cancel the bill.');
  }

  let refunded = 0;
  let collected = 0;
  await prisma.$transaction(async (tx) => {
    const demand = new Map<string, number>();
    const restores = new Map<string, number>();
    const added = new Map<string, number>();
    const note = (bucket: Map<string, number>, batchId: string | null, units: number): void => {
      if (!batchId || units === 0) {
        return;
      }
      bucket.set(batchId, (bucket.get(batchId) ?? 0) + units);
    };

    for (const item of invoice.items) {
      const next = input.items.find((line) => line.itemId === item.id);
      const newQty = next?.quantity ?? 0;
      const sold = Math.max(0, item.quantity - item.stockShortfall);
      if (newQty > item.quantity) {
        note(demand, item.inventoryBatchId, newQty - item.quantity);
      } else {
        note(restores, item.inventoryBatchId, sold - Math.min(sold, newQty));
      }
    }
    const additionBatches = [];
    for (const addition of input.additions) {
      const batch = await tx.inventoryBatch.findFirst({
        where: { id: addition.inventoryBatchId, orgId, deletedAt: null },
        select: { id: true, productName: true, priceCode: true, salePrice: true, stockQty: true },
      });
      if (!batch) {
        throw new AppError(422, 'VALIDATION_ERROR', 'A product in this sale is not in the shop.');
      }
      additionBatches.push({ ...addition, batch });
      note(added, batch.id, addition.quantity);
    }

    const batchIds = new Set<string>([...demand.keys(), ...restores.keys(), ...added.keys()]);
    for (const batchId of batchIds) {
      const net =
        (demand.get(batchId) ?? 0) + (added.get(batchId) ?? 0) - (restores.get(batchId) ?? 0);
      if (net <= 0) {
        continue;
      }
      const taken = await tx.inventoryBatch.updateMany({
        where: { id: batchId, orgId, stockQty: { gte: net } },
        data: { stockQty: { decrement: net } },
      });
      if (taken.count !== 1) {
        throw new AppError(422, 'VALIDATION_ERROR', 'There is not enough stock for this change.');
      }
    }
    for (const batchId of batchIds) {
      const net =
        (restores.get(batchId) ?? 0) - (demand.get(batchId) ?? 0) - (added.get(batchId) ?? 0);
      if (net <= 0) {
        continue;
      }
      await tx.inventoryBatch.updateMany({
        where: { id: batchId, orgId },
        data: { stockQty: { increment: net } },
      });
    }

    for (const item of removed) {
      await tx.stockMovement.updateMany({
        where: { invoiceItemId: item.id },
        data: { invoiceItemId: null },
      });
      await tx.invoiceItem.delete({ where: { id: item.id } });
    }
    for (const line of input.items) {
      const item = byId.get(line.itemId);
      if (!item) {
        continue;
      }
      const rateChanged = moneyToCents(item.unitPrice.toFixed(2)) !== moneyToCents(line.unitPrice);
      if (line.quantity === item.quantity) {
        if (rateChanged) {
          await tx.invoiceItem.update({
            where: { id: item.id },
            data: { unitPrice: line.unitPrice },
          });
        }
        continue;
      }
      const sold = Math.max(0, item.quantity - item.stockShortfall);
      const newSold =
        line.quantity > item.quantity
          ? sold + (line.quantity - item.quantity)
          : Math.min(sold, line.quantity);
      await tx.invoiceItem.update({
        where: { id: item.id },
        data: {
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          stockShortfall: line.quantity - newSold,
        },
      });
    }

    const createdLines = [];
    for (const addition of additionBatches) {
      const created = await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          inventoryBatchId: addition.batch.id,
          productName: addition.batch.productName,
          priceCode: addition.batch.priceCode,
          quantity: addition.quantity,
          unitPrice: addition.unitPrice,
          salePrice: addition.batch.salePrice,
          stockShortfall: 0,
        },
        select: { id: true, inventoryBatchId: true, quantity: true, stockShortfall: true },
      });
      createdLines.push(created);
    }
    await recordSaleMovements(tx, orgId, createdLines, auth.userId);

    const touched = new Set<string>([...demand.keys(), ...restores.keys()]);
    for (const batchId of touched) {
      const batch = await tx.inventoryBatch.findFirst({
        where: { id: batchId, orgId },
        select: { stockQty: true, productName: true },
      });
      const net = (restores.get(batchId) ?? 0) - (demand.get(batchId) ?? 0);
      if (!batch || net === 0) {
        continue;
      }
      const returned = net > 0;
      await tx.stockMovement.create({
        data: {
          orgId,
          batchId,
          type: 'CORRECTION',
          quantityChange: net,
          balanceAfter: batch.stockQty,
          note: returned
            ? returnMovementNote(net, batch.productName, invoice.invoiceNumber, auth.name)
            : `Sold ${Math.abs(net)} × ${batch.productName} on invoice #${invoice.invoiceNumber} by ${auth.name}`,
          createdByUserId: auth.userId,
        },
      });
    }

    const items = await tx.invoiceItem.findMany({
      where: { invoiceId: invoice.id },
      select: { unitPrice: true, quantity: true, stockShortfall: true },
    });
    const subtotal = items.reduce(
      (sum, item) => sum + moneyToCents(item.unitPrice.toFixed(2)) * item.quantity,
      0,
    );
    const previousDiscount = moneyToCents(invoice.discount.toFixed(2));
    let discount = moneyToCents(input.discount);
    const discountReduced = discount > subtotal;
    if (discountReduced) {
      discount = subtotal;
    }
    const delivery = invoice.delivery ? moneyToCents(invoice.delivery.charge.toFixed(2)) : 0;
    const total = subtotal - discount + delivery;
    const desiredPaid =
      input.paymentType === 'CASH'
        ? total
        : Math.min(total, moneyToCents(input.amountReceived ?? '0'));
    const settlement = await alignBillReceipt(
      tx,
      invoice.id,
      invoice.invoiceNumber,
      desiredPaid,
      invoice.customerId,
      orgId,
    );
    refunded = settlement.refunded;
    collected = settlement.collected;
    const previousTotal = moneyToCents(invoice.total.toFixed(2));
    const details = editDetails({
      lines: input.items,
      current: byId,
      removed,
      additions: additionBatches.map((line) => ({
        productName: line.batch.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        catalogPrice: line.batch.salePrice.toFixed(2),
      })),
      previousTotal,
      total,
      previousDiscount,
      discountReduced,
      discount,
      paymentType: input.paymentType,
      previousPaymentType: invoice.paymentType,
      refunded: settlement.refunded,
      collected: settlement.collected,
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        total: centsToMoney(total),
        discount: centsToMoney(discount),
        paymentType: input.paymentType,
        status: settlement.paid >= total ? 'PAID' : 'CREDIT',
        needsReview: items.some((item) => item.stockShortfall > 0),
      },
    });
    await refreshDeliveryForInvoice(tx, invoice.id);
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'INVOICE_UPDATED',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          removed: removed.map((item) => item.productName),
          added: additionBatches.map((line) => line.batch.productName),
          total: centsToMoney(total),
          ...(settlement.refunded > 0 ? { refunded: centsToMoney(settlement.refunded) } : {}),
          ...(settlement.collected > 0 ? { collected: centsToMoney(settlement.collected) } : {}),
          details,
        },
      },
    });
  });

  return {
    id: invoice.id,
    sent: false,
    message:
      refunded > 0
        ? `The bill was updated. ${rupees(refunded)} already received was brought in line with the new total.`
        : collected > 0
          ? `The bill was updated. ${rupees(collected)} was recorded as received.`
          : 'The bill was updated.',
  };
}

type BillTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function alignBillReceipt(
  tx: BillTx,
  invoiceId: string,
  invoiceNumber: number,
  target: number,
  customerId: string,
  orgId: string,
): Promise<{ paid: number; refunded: number; collected: number }> {
  const payments = await tx.payment.findMany({
    where: { invoiceId },
    orderBy: { recordedAt: 'desc' },
    select: { id: true, amount: true, notes: true },
  });
  const paid = payments.reduce((sum, payment) => sum + moneyToCents(payment.amount.toFixed(2)), 0);
  if (paid === target) {
    return { paid, refunded: 0, collected: 0 };
  }
  if (paid < target) {
    const extra = target - paid;
    await tx.payment.create({
      data: {
        customerId,
        invoiceId,
        orgId,
        amount: centsToMoney(extra),
        method: 'CASH',
        notes: `Amount received on invoice #${invoiceNumber}.`,
      },
    });
    return { paid: target, refunded: 0, collected: extra };
  }
  let excess = paid - target;
  for (const payment of payments) {
    if (excess <= 0) {
      break;
    }
    const amount = moneyToCents(payment.amount.toFixed(2));
    const take = Math.min(amount, excess);
    const left = amount - take;
    excess -= take;
    if (left === 0) {
      await tx.payment.delete({ where: { id: payment.id } });
      continue;
    }
    const refund = `Refunded ${rupees(take)} on invoice #${invoiceNumber}.`;
    const notes = payment.notes?.trim() ? `${payment.notes.trim()} ${refund}` : refund;
    await tx.payment.update({
      where: { id: payment.id },
      data: { amount: centsToMoney(left), notes },
    });
  }
  return { paid: target, refunded: paid - target, collected: 0 };
}

function editDetails(input: {
  lines: readonly { itemId: string; quantity: number; unitPrice: string }[];
  current: ReadonlyMap<
    string,
    { productName: string; quantity: number; unitPrice: { toFixed(digits: number): string } }
  >;
  removed: readonly { productName: string; quantity: number }[];
  additions: readonly {
    productName: string;
    quantity: number;
    unitPrice: string;
    catalogPrice: string;
  }[];
  previousTotal: number;
  total: number;
  previousDiscount: number;
  discountReduced: boolean;
  discount: number;
  paymentType: 'CASH' | 'CREDIT';
  previousPaymentType: string;
  refunded: number;
  collected: number;
}): string[] {
  const details: string[] = [];
  for (const line of input.lines) {
    const item = input.current.get(line.itemId);
    if (!item) {
      continue;
    }
    if (line.quantity !== item.quantity) {
      const change = Math.abs(item.quantity - line.quantity);
      details.push(
        line.quantity < item.quantity
          ? `Returned ${change} × ${item.productName}. Quantity ${item.quantity} → ${line.quantity}.`
          : `Increased ${item.productName} from ${item.quantity} to ${line.quantity}.`,
      );
    }
    const previousRate = moneyToCents(item.unitPrice.toFixed(2));
    const nextRate = moneyToCents(line.unitPrice);
    if (previousRate !== nextRate) {
      details.push(`${item.productName} rate ${rupees(previousRate)} → ${rupees(nextRate)}.`);
    }
  }
  for (const item of input.removed) {
    details.push(`Returned ${item.quantity} × ${item.productName}. Removed from the bill.`);
  }
  for (const addition of input.additions) {
    const billed = moneyToCents(addition.unitPrice);
    const catalog = moneyToCents(addition.catalogPrice);
    details.push(
      billed === catalog
        ? `Added ${addition.quantity} × ${addition.productName}.`
        : `Added ${addition.quantity} × ${addition.productName} at ${rupees(billed)}.`,
    );
  }
  if (input.discountReduced) {
    details.push(`Discount reduced to ${rupees(input.discount)} so it fits the new sale.`);
  } else if (input.previousDiscount !== input.discount) {
    details.push(`Discount ${rupees(input.previousDiscount)} → ${rupees(input.discount)}.`);
  }
  if (input.paymentType !== input.previousPaymentType) {
    details.push(
      input.paymentType === 'CASH' ? 'Marked the bill as cash.' : 'Marked the bill as credit.',
    );
  }
  details.push(`Total ${rupees(input.previousTotal)} → ${rupees(input.total)}.`);
  if (input.collected > 0) {
    details.push(`Recorded ${rupees(input.collected)} received.`);
  }
  if (input.refunded > 0) {
    details.push(
      `Refunded ${rupees(input.refunded)} so the amount received matches the new total.`,
    );
  }
  return details;
}

function rupees(cents: number): string {
  return `₨ ${centsToMoney(cents)}`;
}

async function loadBill(orgId: string, invoiceId: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId },
    select: {
      id: true,
      invoiceNumber: true,
      cancelledAt: true,
      org: { select: { name: true } },
      customer: { select: { name: true, phone: true, whatsappNumber: true } },
      items: {
        select: {
          id: true,
          productName: true,
          quantity: true,
          stockShortfall: true,
          inventoryBatchId: true,
          prescription: true,
          inventoryBatch: { select: { category: true, prescriptionRequired: true } },
        },
      },
      labJobs: {
        select: {
          id: true,
          status: true,
          referenceNumber: true,
          labOrgId: true,
          specialInstructions: true,
        },
      },
    },
  });
  if (!invoice) {
    throw new AppError(404, 'NOT_FOUND', 'Invoice was not found');
  }
  return invoice;
}

function assertOpen(cancelledAt: Date | null): void {
  if (cancelledAt) {
    throw new AppError(409, 'ORDER_LOCKED', 'This bill is cancelled');
  }
}

function requireOwner(auth: AuthSessionUser): string {
  const orgId = requiredShopOrgId(auth);
  if (!isShopOwner(auth)) {
    throw new AppError(403, 'FORBIDDEN', 'Only the shop owner can change a bill');
  }
  return orgId;
}

function customerPhone(customer: { phone: string | null; whatsappNumber: string | null }): string {
  return (customer.whatsappNumber ?? customer.phone ?? '').replace(/\D/g, '');
}

function describeReading(value: unknown): string {
  const reading = storedReading(value);
  if (!reading) {
    return '';
  }
  const rightAdd = eyeAdd(reading.right, reading.add);
  const leftAdd = eyeAdd(reading.left, reading.add);
  const parts = [
    `R ${eyeLine(reading.right, rightAdd, leftAdd)} · L ${eyeLine(reading.left, leftAdd, rightAdd)}`,
  ];
  if (rightAdd && rightAdd === leftAdd) {
    parts[0] = `R ${eyeLine(reading.right)} · L ${eyeLine(reading.left)}`;
    parts.push(`Add ${rightAdd}`);
  }
  if (reading.pd.trim()) {
    parts.push(`PD ${reading.pd.trim()}`);
  }
  if (reading.notes.trim()) {
    parts.push(reading.notes.trim());
  }
  return parts.join(' · ');
}

function eyeLine(
  eye: { sphere: string; cylinder: string; axis: string },
  add = '',
  otherAdd = '',
): string {
  const parts = [
    eye.sphere.trim() ? `SPH ${eye.sphere.trim()}` : '',
    eye.cylinder.trim() ? `CYL ${eye.cylinder.trim()}` : '',
    eye.axis.trim() ? `Axis ${eye.axis.trim()}` : '',
    add && add !== otherAdd ? `Add ${add}` : '',
  ].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(' ') : '—';
}

function eyeAdd(eye: { add?: string }, shared: string): string {
  return typeof eye.add === 'string' ? eye.add.trim() : shared.trim();
}

function storedReading(value: unknown): {
  right: ReceiptPrescription['right'];
  left: ReceiptPrescription['left'];
  add: string;
  pd: string;
  notes: string;
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const reading = {
    right: storedEye(record.right),
    left: storedEye(record.left),
    add: typeof record.add === 'string' ? record.add : '',
    pd: typeof record.pd === 'string' ? record.pd : '',
    notes: typeof record.notes === 'string' ? record.notes : '',
  };
  const filled = [
    reading.right.sphere,
    reading.right.cylinder,
    reading.right.axis,
    reading.left.sphere,
    reading.left.cylinder,
    reading.left.axis,
    reading.add,
    reading.pd,
    reading.notes,
  ].some((part) => part.trim().length > 0);
  return filled ? reading : null;
}

function storedEye(value: unknown): ReceiptPrescription['right'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { sphere: '', cylinder: '', axis: '' };
  }
  const eye = value as Record<string, unknown>;
  const reading = {
    sphere: typeof eye.sphere === 'string' ? eye.sphere : '',
    cylinder: typeof eye.cylinder === 'string' ? eye.cylinder : '',
    axis: typeof eye.axis === 'string' ? eye.axis : '',
  };
  return typeof eye.add === 'string' ? { ...reading, add: eye.add } : reading;
}
