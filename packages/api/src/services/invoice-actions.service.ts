import { prisma } from '@optiworld/db';
import { centsToMoney, moneyToCents, type AuthSessionUser } from '@optiworld/shared';

import { AppError } from '../lib/errors.js';

export async function clearInvoiceCredit(
  auth: AuthSessionUser,
  invoiceId: string,
  amount?: string,
): Promise<{ id: string; status: 'PAID' | 'CREDIT'; outstanding: string }> {
  const orgId = requiredRetailerOrgId(auth);
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId },
      select: {
        id: true,
        customerId: true,
        status: true,
        cancelledAt: true,
        total: true,
        payments: { select: { amount: true } },
      },
    });
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', 'Invoice was not found');
    }
    const paid = invoice.payments.reduce(
      (sum, payment) => sum + moneyToCents(payment.amount.toFixed(2)),
      0,
    );
    const due = Math.max(0, moneyToCents(invoice.total.toFixed(2)) - paid);
    if (invoice.cancelledAt) {
      throw new AppError(409, 'ORDER_LOCKED', 'This bill is cancelled');
    }
    if (invoice.status !== 'CREDIT' || due <= 0) {
      throw new AppError(422, 'VALIDATION_ERROR', 'This sale has no outstanding credit');
    }
    const requested = amount === undefined ? due : moneyToCents(amount);
    if (requested <= 0 || requested > due) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Enter an amount up to the balance');
    }
    const left = due - requested;
    const status = left === 0 ? 'PAID' : 'CREDIT';
    await tx.payment.create({
      data: {
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        orgId,
        amount: centsToMoney(requested),
        method: 'CASH',
        notes: 'Amount received',
      },
    });
    if (status === 'PAID') {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'PAID' },
      });
    }
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'INVOICE_CREDIT_CLEARED',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: { amount: centsToMoney(requested), outstanding: centsToMoney(left) },
      },
    });
    return { id: invoice.id, status, outstanding: centsToMoney(left) };
  });
}

export async function removeInvoice(
  auth: AuthSessionUser,
  invoiceId: string,
): Promise<{ id: string }> {
  const orgId = requiredRetailerOrgId(auth);
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, orgId },
      select: {
        id: true,
        invoiceNumber: true,
        items: { select: { inventoryBatchId: true, quantity: true, stockShortfall: true } },
        labJobs: { select: { id: true } },
      },
    });
    if (!invoice) {
      throw new AppError(404, 'NOT_FOUND', 'Invoice was not found');
    }
    if (invoice.labJobs.length > 0) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        'This sale is linked to a lab job and cannot be removed',
      );
    }
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
    await tx.payment.deleteMany({ where: { invoiceId: invoice.id, orgId } });
    await tx.invoice.delete({ where: { id: invoice.id } });
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'INVOICE_REMOVED',
        entityType: 'Invoice',
        entityId: invoice.id,
        metadata: { invoiceNumber: invoice.invoiceNumber },
      },
    });
  });
  return { id: invoiceId };
}

function requiredRetailerOrgId(auth: AuthSessionUser): string {
  if (auth.orgType !== 'RETAILER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'A retailer organisation is required');
  }
  return auth.orgId;
}
