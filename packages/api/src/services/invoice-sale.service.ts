import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  labJobNeedsLabDecision,
  moneyToCents,
  prescriptionIssuePaths,
  type AuthSessionUser,
  type FinalizeInvoiceLabRequest,
  type InvoiceNotice,
  type JobStatus,
  type ReceiptPrescription,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { refreshDeliveryForInvoice } from './deliveries.service.js';
import { recordSaleMovements } from './inventory.service.js';
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
  if (auth.orgType !== 'RETAILER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'A retailer organisation is required');
  }
  if (auth.role !== 'OWNER') {
    throw new AppError(403, 'FORBIDDEN', 'Only the shop owner can change a bill');
  }
  return auth.orgId;
}

function customerPhone(customer: { phone: string | null; whatsappNumber: string | null }): string {
  return (customer.whatsappNumber ?? customer.phone ?? '').replace(/\D/g, '');
}

function describeReading(value: unknown): string {
  const reading = storedReading(value);
  if (!reading) {
    return '';
  }
  const parts = [`R ${eyeLine(reading.right)} · L ${eyeLine(reading.left)}`];
  if (reading.add.trim()) {
    parts.push(`Add ${reading.add.trim()}`);
  }
  if (reading.pd.trim()) {
    parts.push(`PD ${reading.pd.trim()}`);
  }
  if (reading.notes.trim()) {
    parts.push(reading.notes.trim());
  }
  return parts.join(' · ');
}

function eyeLine(eye: { sphere: string; cylinder: string; axis: string }): string {
  const parts = [
    eye.sphere.trim() ? `SPH ${eye.sphere.trim()}` : '',
    eye.cylinder.trim() ? `CYL ${eye.cylinder.trim()}` : '',
    eye.axis.trim() ? `Axis ${eye.axis.trim()}` : '',
  ].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(' ') : '—';
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
  return {
    sphere: typeof eye.sphere === 'string' ? eye.sphere : '',
    cylinder: typeof eye.cylinder === 'string' ? eye.cylinder : '',
    axis: typeof eye.axis === 'string' ? eye.axis : '',
  };
}
