import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  moneyToCents,
  type AuthSessionUser,
  type DeliveryList,
  type DeliveryListQuery,
  type DeliveryRow,
  type MarkDeliveredResult,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function recordInvoiceDelivery(
  tx: Tx,
  input: { orgId: string; invoiceId: string; address: string; chargeCents: number },
): Promise<void> {
  const address = input.address.trim();
  if (!address) {
    return;
  }
  const jobs = await tx.labJob.findMany({
    where: { retailerInvoiceId: input.invoiceId },
    select: { status: true, completedAt: true },
  });
  const active = jobs.filter((job) => job.status !== 'CANCELLED');
  const pending = active.filter((job) => job.status !== 'OUTSOURCED' && job.completedAt === null);
  const readyNow = jobs.length === 0 || (active.length > 0 && pending.length === 0);
  await tx.delivery.upsert({
    where: { invoiceId: input.invoiceId },
    create: {
      orgId: input.orgId,
      invoiceId: input.invoiceId,
      address,
      charge: centsToMoney(input.chargeCents),
      status: readyNow ? 'READY' : 'WAITING',
      readyAt: readyNow ? new Date() : null,
    },
    update: {
      address,
      charge: centsToMoney(input.chargeCents),
    },
  });
}

export async function refreshDeliveryForInvoice(tx: Tx, invoiceId: string | null): Promise<void> {
  if (!invoiceId) {
    return;
  }
  const delivery = await tx.delivery.findUnique({ where: { invoiceId } });
  if (!delivery || delivery.status === 'DELIVERED') {
    return;
  }
  const jobs = await tx.labJob.findMany({
    where: { retailerInvoiceId: invoiceId },
    select: { status: true, completedAt: true },
  });
  const active = jobs.filter((job) => job.status !== 'CANCELLED');
  const pending = active.filter((job) => job.status !== 'OUTSOURCED' && job.completedAt === null);
  const ready = jobs.length === 0 || (active.length > 0 && pending.length === 0);
  if (ready && delivery.status !== 'READY') {
    await tx.delivery.update({
      where: { id: delivery.id },
      data: { status: 'READY', readyAt: new Date() },
    });
    return;
  }
  if (!ready && delivery.status === 'READY') {
    await tx.delivery.update({
      where: { id: delivery.id },
      data: { status: 'WAITING', readyAt: null },
    });
  }
}

export async function listDeliveries(
  auth: AuthSessionUser,
  query: DeliveryListQuery,
): Promise<DeliveryList> {
  const orgId = requireRetailer(auth);
  const [readyTotal, deliveredTotal, ready, delivered] = await Promise.all([
    prisma.delivery.count({ where: { orgId, status: 'READY' } }),
    prisma.delivery.count({ where: { orgId, status: 'DELIVERED' } }),
    prisma.delivery.findMany({
      where: { orgId, status: 'READY' },
      orderBy: { readyAt: 'desc' },
      skip: (query.readyPage - 1) * query.limit,
      take: query.limit,
      select: deliverySelect,
    }),
    prisma.delivery.findMany({
      where: { orgId, status: 'DELIVERED' },
      orderBy: { deliveredAt: 'desc' },
      skip: (query.deliveredPage - 1) * query.limit,
      take: query.limit,
      select: deliverySelect,
    }),
  ]);
  return {
    ready: ready.map(toRow),
    readyTotal,
    delivered: delivered.map(toRow),
    deliveredTotal,
  };
}

export async function markDelivered(
  auth: AuthSessionUser,
  deliveryId: string,
): Promise<MarkDeliveredResult> {
  const orgId = requireRetailer(auth);
  const delivery = await prisma.delivery.findFirst({
    where: { id: deliveryId, orgId },
    select: {
      id: true,
      status: true,
      address: true,
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          customer: { select: { name: true, phone: true, whatsappNumber: true } },
          labJobs: { select: { referenceNumber: true, status: true, patientPhone: true } },
          org: { select: { name: true } },
        },
      },
    },
  });
  if (!delivery) {
    throw new AppError(404, 'NOT_FOUND', 'Delivery was not found');
  }
  if (delivery.status !== 'READY') {
    throw new AppError(409, 'ORDER_LOCKED', 'This order is not ready for delivery');
  }
  await prisma.$transaction(async (tx) => {
    await tx.delivery.update({
      where: { id: delivery.id },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'DELIVERY_MARKED',
        entityType: 'Delivery',
        entityId: delivery.id,
        metadata: { invoiceNumber: delivery.invoice.invoiceNumber },
      },
    });
  });
  const activeJob = delivery.invoice.labJobs.find((job) => job.status !== 'CANCELLED');
  const phone = digitsOnly(
    activeJob?.patientPhone ||
      delivery.invoice.customer.whatsappNumber ||
      delivery.invoice.customer.phone ||
      '',
  );
  const shopName = delivery.invoice.org.name;
  const reference = activeJob?.referenceNumber ?? `Invoice #${delivery.invoice.invoiceNumber}`;
  const text =
    `${shopName}: ${reference} for ${delivery.invoice.customer.name} was delivered to ${delivery.address}.`.slice(
      0,
      1024,
    );
  const whatsapp = await sendDeliveryWhatsApp(auth, delivery.id, phone, shopName, reference, text);
  return { id: delivery.id, sent: whatsapp.sent, message: whatsapp.message };
}

const deliverySelect = {
  id: true,
  invoiceId: true,
  address: true,
  charge: true,
  readyAt: true,
  deliveredAt: true,
  invoice: {
    select: {
      invoiceNumber: true,
      total: true,
      customer: { select: { name: true } },
      labJobs: { select: { referenceNumber: true, status: true } },
    },
  },
} as const;

function toRow(row: {
  id: string;
  invoiceId: string;
  address: string;
  charge: { toFixed: (digits: number) => string };
  readyAt: Date | null;
  deliveredAt: Date | null;
  invoice: {
    invoiceNumber: number;
    total: { toFixed: (digits: number) => string };
    customer: { name: string };
    labJobs: readonly { referenceNumber: string; status: string }[];
  };
}): DeliveryRow {
  const references = row.invoice.labJobs
    .filter((job) => job.status !== 'CANCELLED')
    .map((job) => job.referenceNumber);
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoice.invoiceNumber,
    customerName: row.invoice.customer.name,
    address: row.address,
    charge: row.charge.toFixed(2),
    total: row.invoice.total.toFixed(2),
    references: references.join(', '),
    readyAt: row.readyAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
  };
}

function requireRetailer(auth: AuthSessionUser): string {
  if (auth.orgType !== 'RETAILER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'Only a retailer can use this');
  }
  return auth.orgId;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

async function sendDeliveryWhatsApp(
  auth: AuthSessionUser,
  deliveryId: string,
  phone: string,
  shopName: string,
  reference: string,
  text: string,
): Promise<{ sent: boolean; message: string }> {
  const orgId = auth.orgId ?? '';
  if (!phone) {
    await logDeliveryWhatsApp(
      orgId,
      auth.userId,
      deliveryId,
      false,
      'Customer has no phone number',
    );
    return {
      sent: false,
      message: 'The order was marked delivered. This customer has no phone number for WhatsApp.',
    };
  }
  const token = process.env.WHATSAPP_API_TOKEN ?? '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  if (!token || !phoneNumberId) {
    await logDeliveryWhatsApp(orgId, auth.userId, deliveryId, false, 'WhatsApp is not configured');
    return {
      sent: false,
      message: 'The order was marked delivered. WhatsApp is not configured yet.',
    };
  }
  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: 'optiworld_job_status',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: shopName },
                { type: 'text', text: reference },
                { type: 'text', text: 'Delivered' },
              ],
            },
          ],
        },
      }),
    });
    if (!response.ok) {
      await logDeliveryWhatsApp(
        orgId,
        auth.userId,
        deliveryId,
        false,
        `WhatsApp returned ${response.status}`,
      );
      return {
        sent: false,
        message: 'The order was marked delivered. WhatsApp could not send the update.',
      };
    }
    await logDeliveryWhatsApp(orgId, auth.userId, deliveryId, true, text);
    return {
      sent: true,
      message: 'The order was marked delivered and the customer was notified on WhatsApp.',
    };
  } catch (error) {
    logger.error('WhatsApp delivery notice failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    await logDeliveryWhatsApp(orgId, auth.userId, deliveryId, false, 'WhatsApp request failed');
    return {
      sent: false,
      message: 'The order was marked delivered. WhatsApp could not send the update.',
    };
  }
}

async function logDeliveryWhatsApp(
  orgId: string,
  userId: string,
  deliveryId: string,
  sent: boolean,
  detail: string,
): Promise<void> {
  if (!orgId) {
    return;
  }
  await prisma.auditLog.create({
    data: {
      orgId,
      userId,
      action: sent ? 'WHATSAPP_JOB_STATUS_SENT' : 'WHATSAPP_JOB_STATUS_FAILED',
      entityType: 'Delivery',
      entityId: deliveryId,
      metadata: { detail: detail.slice(0, 500) },
    },
  });
}

export function deliveryChargeCents(charge: string | undefined): number {
  if (!charge) {
    return 0;
  }
  return moneyToCents(charge);
}
