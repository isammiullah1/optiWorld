import { prisma } from '@optiworld/db';
import {
  categoryRequiresPrescription,
  centsToMoney,
  labDayMonth,
  moneyToCents,
  nextProductTag,
  type AuthSessionUser,
  type ConnectedLab,
  type CreatePosInvoiceRequest,
  type CustomerSearchHit,
  type InventorySearchHit,
  type LabPrescription,
  type PosReceipt,
  ReceiptPrescriptionSchema,
  type SendReceiptResult,
} from '@optiworld/shared';

import { billLogoPath } from '../lib/bill-logo-store.js';
import { AppError } from '../lib/errors.js';
import { deliveryChargeCents, recordInvoiceDelivery } from './deliveries.service.js';
import { invoiceActivity } from './record-activity.js';
import { persistLinePrescription } from './customers.service.js';
import { frameJson, labJobAssignedAlert, prescriptionJson } from './lab-jobs.service.js';
import { recordSaleMovements } from './inventory.service.js';
import { logger } from '../lib/logger.js';

const SEARCH_LIMIT = 24;

type SaleTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function searchInventory(
  auth: AuthSessionUser,
  query: string,
): Promise<InventorySearchHit[]> {
  const orgId = requiredRetailerOrgId(auth);
  const q = query.trim();
  const rows = await prisma.inventoryBatch.findMany({
    where: {
      orgId,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { productName: { contains: q, mode: 'insensitive' } },
              { brand: { contains: q, mode: 'insensitive' } },
              { priceCode: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ productName: 'asc' }],
    take: SEARCH_LIMIT,
    select: {
      id: true,
      priceCode: true,
      productName: true,
      brand: true,
      category: true,
      prescriptionRequired: true,
      salePrice: true,
      stockQty: true,
      lowStockThreshold: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    priceCode: row.priceCode,
    productName: row.productName,
    brand: row.brand,
    category: row.category,
    prescriptionRequired: row.prescriptionRequired,
    salePrice: money(row.salePrice),
    stockQty: row.stockQty,
    lowStock: row.stockQty <= row.lowStockThreshold,
  }));
}

export async function searchCustomers(
  auth: AuthSessionUser,
  query: string,
): Promise<CustomerSearchHit[]> {
  const orgId = requiredRetailerOrgId(auth);
  const q = query.trim();
  const customers = await prisma.customer.findMany({
    where: {
      orgId,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q, mode: 'insensitive' } },
              { whatsappNumber: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    take: 15,
    select: {
      id: true,
      name: true,
      phone: true,
      whatsappNumber: true,
      gender: true,
      dateOfBirth: true,
      referredBy: true,
      creditLimit: true,
    },
  });
  const ids = customers.map((customer) => customer.id);
  const [outstanding, lastPurchase] = await Promise.all([
    outstandingByCustomer(orgId, ids),
    lastPurchaseByCustomer(orgId, ids),
  ]);
  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    whatsappNumber: customer.whatsappNumber,
    gender: customer.gender,
    dateOfBirth: formatDateOnly(customer.dateOfBirth),
    referredBy: customer.referredBy,
    creditLimit: money(customer.creditLimit),
    outstanding: centsToMoney(outstanding.get(customer.id) ?? 0),
    lastPurchaseAt: lastPurchase.get(customer.id)?.toISOString() ?? null,
  }));
}

async function lastPurchaseByCustomer(
  orgId: string,
  customerIds: readonly string[],
): Promise<Map<string, Date>> {
  const latest = new Map<string, Date>();
  await Promise.all(
    customerIds.map(async (customerId) => {
      const invoice = await prisma.invoice.findFirst({
        where: { orgId, customerId },
        orderBy: { issuedAt: 'desc' },
        select: { issuedAt: true },
      });
      if (invoice) {
        latest.set(customerId, invoice.issuedAt);
      }
    }),
  );
  return latest;
}

function formatDateOnly(value: Date | null): string | null {
  if (!value) {
    return null;
  }
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function listConnectedLabs(auth: AuthSessionUser): Promise<ConnectedLab[]> {
  const orgId = requiredRetailerOrgId(auth);
  const links = await prisma.labClient.findMany({
    where: {
      linkedOrgId: orgId,
      status: 'APPROVED',
      lab: { type: 'LABORATORY', status: 'ACTIVE', deletedAt: null },
    },
    select: { lab: { select: { id: true, name: true } } },
    orderBy: { lab: { name: 'asc' } },
  });
  const seen = new Set<string>();
  const labs: ConnectedLab[] = [];
  for (const link of links) {
    if (seen.has(link.lab.id)) {
      continue;
    }
    seen.add(link.lab.id);
    labs.push({ id: link.lab.id, name: link.lab.name });
  }
  return labs;
}

export async function createPosInvoice(
  auth: AuthSessionUser,
  input: CreatePosInvoiceRequest,
): Promise<PosReceipt> {
  const orgId = requiredRetailerOrgId(auth);
  const existing = await prisma.invoice.findFirst({
    where: { orgId, localId: input.localId },
    select: { id: true },
  });
  if (existing) {
    return getPosReceipt(auth, existing.id);
  }

  const chosenLabs = new Set<string>();
  if (input.labPrescription) {
    chosenLabs.add(input.labPrescription.labOrgId);
  }
  if (input.assignAllToLab && input.billLabOrgId) {
    chosenLabs.add(input.billLabOrgId);
  }
  if (!input.assignAllToLab) {
    for (const item of input.items) {
      if (item.prescription?.labOrgId) {
        chosenLabs.add(item.prescription.labOrgId);
      }
    }
  }
  for (const labOrgId of chosenLabs) {
    const linked = await labIsConnected(orgId, labOrgId);
    if (!linked) {
      throw new AppError(
        403,
        'CONNECTION_REQUIRED',
        'That laboratory has not accepted this connection',
      );
    }
  }

  const subtotal = input.items.reduce(
    (sum, item) => sum + moneyToCents(item.unitPrice) * item.quantity,
    0,
  );
  const discount = moneyToCents(input.discount);
  if (discount > subtotal) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The discount is larger than the sale total');
  }

  const linePrescriptions: Array<Awaited<ReturnType<typeof persistLinePrescription>> | null> = [];
  for (const item of input.items) {
    linePrescriptions.push(
      item.prescription
        ? await persistLinePrescription(orgId, input.customerId, item.prescription)
        : null,
    );
  }

  const invoiceId = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, orgId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!customer) {
      throw new AppError(404, 'NOT_FOUND', 'Choose a customer from this shop');
    }

    const locked = await lockBatches(
      tx,
      orgId,
      input.items.map((item) => item.inventoryBatchId),
    );
    const lines = [];
    let shortUnits = 0;
    for (const [index, item] of input.items.entries()) {
      const batch = locked.get(item.inventoryBatchId);
      if (!batch) {
        throw new AppError(422, 'VALIDATION_ERROR', 'A product in the cart is not in this shop');
      }
      const deducted = Math.min(batch.stockQty, item.quantity);
      const shortfall = item.quantity - deducted;
      batch.stockQty -= deducted;
      shortUnits += shortfall;
      lines.push({
        inventoryBatchId: item.inventoryBatchId,
        productName: batch.productName,
        priceCode: batch.priceCode,
        quantity: item.quantity,
        unitPrice: centsToMoney(moneyToCents(item.unitPrice)),
        salePrice: batch.salePrice,
        stockShortfall: shortfall,
        ...(linePrescriptions[index] ? { prescription: linePrescriptions[index] } : {}),
      });
    }

    const deliveryAddress = input.deliveryAddress?.trim() ?? '';
    const requestedCharge = deliveryChargeCents(input.deliveryCharge);
    if (requestedCharge > 0 && !deliveryAddress) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Enter the delivery address');
    }
    const chargeCents = deliveryAddress ? requestedCharge : 0;
    const totalCents = subtotal - discount + chargeCents;
    const receivedCents = receivedOnBill(input.paymentType, input.amountReceived, totalCents);
    const created = await tx.invoice.create({
      data: {
        orgId,
        customerId: customer.id,
        localId: input.localId,
        invoiceNumber: await nextInvoiceNumber(tx, orgId),
        status: receivedCents >= totalCents ? 'PAID' : 'CREDIT',
        total: centsToMoney(totalCents),
        discount: centsToMoney(discount),
        paymentType: input.paymentType,
        isOffline: false,
        issuedAt: new Date(),
        syncedAt: new Date(),
        needsReview: shortUnits > 0,
        reviewReason:
          shortUnits > 0
            ? `Stock was short by ${shortUnits} units. The sale was kept and needs an owner review.`
            : null,
        items: { create: lines },
      },
      select: {
        id: true,
        invoiceNumber: true,
        items: {
          select: { id: true, inventoryBatchId: true, quantity: true, stockShortfall: true },
        },
      },
    });

    for (const [batchId, batch] of locked) {
      await tx.inventoryBatch.update({
        where: { id: batchId },
        data: { stockQty: batch.stockQty },
      });
    }
    await recordSaleMovements(tx, orgId, created.items, auth.userId);

    if (receivedCents > 0) {
      await tx.payment.create({
        data: {
          customerId: customer.id,
          invoiceId: created.id,
          orgId,
          amount: centsToMoney(receivedCents),
          method: 'CASH',
          ...(input.paymentType === 'CREDIT' ? { notes: 'Amount received' } : {}),
        },
      });
    }

    if (input.labPrescription) {
      await attachInvoiceLabJob(tx, {
        orgId,
        userId: auth.userId,
        invoiceId: created.id,
        customerName: customer.name,
        prescription: input.labPrescription,
      });
    }

    await attachLineLabJobs(tx, {
      orgId,
      userId: auth.userId,
      invoiceId: created.id,
      customerName: customer.name,
      billLabOrgId: input.billLabOrgId,
      assignAllToLab: input.assignAllToLab === true,
      lines: input.items.map((item, index) => {
        const batch = locked.get(item.inventoryBatchId);
        return {
          productName: batch?.productName ?? '',
          category: batch?.category ?? '',
          prescriptionRequired: batch?.prescriptionRequired ?? null,
          reading: linePrescriptions[index] ?? null,
          labOrgId: item.prescription?.labOrgId,
        };
      }),
    });

    if (deliveryAddress) {
      await recordInvoiceDelivery(tx, {
        orgId,
        invoiceId: created.id,
        address: deliveryAddress,
        chargeCents,
      });
    }

    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'POS_INVOICE_CREATED',
        entityType: 'Invoice',
        entityId: created.id,
        metadata: { invoiceNumber: created.invoiceNumber, localId: input.localId },
      },
    });

    return created.id;
  });

  return getPosReceipt(auth, invoiceId);
}

export async function getPosReceipt(auth: AuthSessionUser, invoiceId: string): Promise<PosReceipt> {
  const orgId = requiredRetailerOrgId(auth);
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, orgId },
    select: {
      id: true,
      invoiceNumber: true,
      issuedAt: true,
      status: true,
      cancelledAt: true,
      total: true,
      discount: true,
      paymentType: true,
      delivery: { select: { charge: true, address: true } },
      payments: {
        select: { amount: true, recordedAt: true, notes: true },
        orderBy: { recordedAt: 'asc' },
      },
      customer: {
        select: { name: true, phone: true, whatsappNumber: true, gender: true, dateOfBirth: true },
      },
      org: {
        select: {
          name: true,
          phone: true,
          city: true,
          address: true,
          billHeading: true,
          billTagline: true,
          billTerms: true,
          billLogoKey: true,
        },
      },
      items: {
        select: {
          id: true,
          productName: true,
          priceCode: true,
          quantity: true,
          unitPrice: true,
          prescription: true,
        },
        orderBy: { productName: 'asc' },
      },
      labJobs: {
        select: {
          id: true,
          referenceNumber: true,
          status: true,
          labOrgId: true,
          lab: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!invoice) {
    throw new AppError(404, 'NOT_FOUND', 'Invoice was not found');
  }
  const activity = await invoiceActivity(
    orgId,
    invoice.id,
    invoice.items.map((item) => `${item.productName} ${item.priceCode} × ${item.quantity}`),
  );
  const discountCents = moneyToCents(money(invoice.discount));
  const totalCents = moneyToCents(money(invoice.total));
  const deliveryCents = invoice.delivery ? moneyToCents(money(invoice.delivery.charge)) : 0;
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.issuedAt.toISOString(),
    businessName: invoice.org.name,
    billHeading: invoice.org.billHeading ?? '',
    billTagline: invoice.org.billTagline ?? '',
    billTerms: invoice.org.billTerms ?? '',
    billLogoUrl: billLogoPath(invoice.org.billLogoKey),
    businessPhone: invoice.org.phone,
    businessAddress: shopAddress(invoice.org.address, invoice.org.city),
    customerName: invoice.customer.name,
    customerPhone: invoice.customer.phone,
    customerWhatsapp: invoice.customer.whatsappNumber,
    customerGender: invoice.customer.gender,
    customerDateOfBirth: formatDateOnly(invoice.customer.dateOfBirth),
    paymentType: invoice.paymentType,
    outstanding: receiptOutstanding(invoice),
    amountPaid: centsToMoney(
      invoice.payments.reduce((sum, payment) => sum + moneyToCents(money(payment.amount)), 0),
    ),
    payments: invoice.payments.map((payment) => ({
      amount: money(payment.amount),
      recordedAt: payment.recordedAt.toISOString(),
      notes: payment.notes,
    })),
    status: invoice.status,
    subtotal: centsToMoney(totalCents + discountCents - deliveryCents),
    discount: centsToMoney(discountCents),
    deliveryCharge: centsToMoney(deliveryCents),
    deliveryAddress: invoice.delivery?.address ?? null,
    total: centsToMoney(totalCents),
    labReference: invoice.labJobs.map((job) => job.referenceNumber).join(', ') || null,
    cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
    labJobs: invoice.labJobs.map((job) => ({
      id: job.id,
      referenceNumber: job.referenceNumber,
      status: job.status,
      labOrgId: job.labOrgId,
      labName: job.lab.name,
    })),
    items: invoice.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      priceCode: item.priceCode,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      lineTotal: centsToMoney(moneyToCents(money(item.unitPrice)) * item.quantity),
      prescriptionSummary: prescriptionText(item.prescription),
      prescription: receiptReading(item.prescription),
    })),
    activity,
  };
}

export async function sendReceiptWhatsApp(
  auth: AuthSessionUser,
  invoiceId: string,
): Promise<SendReceiptResult> {
  const orgId = requiredRetailerOrgId(auth);
  const receipt = await getPosReceipt(auth, invoiceId);
  const phone = digitsOnly(receipt.customerPhone ?? '');
  if (!phone) {
    await logWhatsApp(orgId, auth.userId, invoiceId, false, 'Customer has no phone number');
    return { sent: false, message: 'This customer has no phone number on file.' };
  }

  const text = receiptMessage(receipt);
  const token = process.env.WHATSAPP_API_TOKEN ?? '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  if (!token || !phoneNumberId) {
    await logWhatsApp(orgId, auth.userId, invoiceId, false, 'WhatsApp is not configured');
    return {
      sent: false,
      message: 'WhatsApp is not configured yet. The receipt is already saved.',
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
          name: 'optiworld_receipt',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: receipt.billHeading.trim() || receipt.businessName },
                { type: 'text', text: String(receipt.invoiceNumber) },
                { type: 'text', text: receipt.total },
                ...(receipt.billTerms.trim()
                  ? [{ type: 'text' as const, text: receipt.billTerms.trim().slice(0, 400) }]
                  : []),
              ],
            },
          ],
        },
      }),
    });
    if (!response.ok) {
      await logWhatsApp(
        orgId,
        auth.userId,
        invoiceId,
        false,
        `WhatsApp returned ${response.status}`,
      );
      return { sent: false, message: 'WhatsApp could not send the receipt. The invoice is saved.' };
    }
    await logWhatsApp(orgId, auth.userId, invoiceId, true, text);
    return { sent: true, message: 'Receipt sent on WhatsApp.' };
  } catch (error) {
    logger.error('WhatsApp receipt failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    await logWhatsApp(orgId, auth.userId, invoiceId, false, 'WhatsApp request failed');
    return { sent: false, message: 'WhatsApp could not send the receipt. The invoice is saved.' };
  }
}

async function allocateLabReference(tx: Pick<SaleTx, 'labJob'>): Promise<string> {
  const prefix = `OW-${labDayMonth()}-`;
  const rows = await tx.labJob.findMany({
    where: { referenceNumber: { startsWith: prefix } },
    select: { referenceNumber: true },
  });
  try {
    return nextProductTag(new Set(rows.map((row) => row.referenceNumber)));
  } catch {
    throw new AppError(422, 'VALIDATION_ERROR', 'A job reference could not be reserved');
  }
}

export async function attachInvoiceLabJob(
  tx: Pick<SaleTx, 'labClient' | 'labJob' | 'organisation' | 'alert'>,
  input: {
    orgId: string;
    userId: string;
    invoiceId: string;
    customerName: string;
    prescription: LabPrescription;
  },
): Promise<string | null> {
  const link = await tx.labClient.findFirst({
    where: { labOrgId: input.prescription.labOrgId, linkedOrgId: input.orgId, status: 'APPROVED' },
    select: { id: true },
  });
  if (!link) {
    return null;
  }

  let reference = input.prescription.referenceNumber;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const taken = await tx.labJob.findFirst({
      where: { referenceNumber: reference },
      select: { id: true, retailerOrgId: true, labOrgId: true },
    });
    if (!taken) {
      break;
    }
    if (taken.retailerOrgId === input.orgId && taken.labOrgId === input.prescription.labOrgId) {
      await tx.labJob.update({
        where: { id: taken.id },
        data: {
          retailerInvoiceId: input.invoiceId,
          patientName: input.customerName,
          prescription: prescriptionJson(input.prescription),
          ...(frameJson(input.prescription) ? { frameDetails: frameJson(input.prescription) } : {}),
          specialInstructions: blank(input.prescription.specialInstructions),
          notes: blank(input.prescription.notes),
        },
      });
      return reference;
    }
    reference = await allocateLabReference(tx);
  }

  const created = await tx.labJob.create({
    data: {
      labOrgId: input.prescription.labOrgId,
      retailerOrgId: input.orgId,
      retailerInvoiceId: input.invoiceId,
      referenceNumber: reference,
      patientName: input.customerName,
      prescription: prescriptionJson(input.prescription),
      frameDetails: frameJson(input.prescription),
      specialInstructions: blank(input.prescription.specialInstructions),
      notes: blank(input.prescription.notes),
      status: 'SUBMITTED',
      statusHistory: {
        create: { status: 'SUBMITTED', changedByUserId: input.userId },
      },
    },
    select: { id: true },
  });
  const shop = await tx.organisation.findFirst({
    where: { id: input.orgId },
    select: { name: true },
  });
  await tx.alert.create({
    data: labJobAssignedAlert({
      labOrgId: input.prescription.labOrgId,
      jobId: created.id,
      referenceNumber: reference,
      patientName: input.customerName,
      shopName: shop?.name ?? 'A connected shop',
    }),
  });
  return reference;
}

function isLabProduct(line: {
  category: string;
  productName: string;
  prescriptionRequired: boolean | null;
}): boolean {
  return categoryRequiresPrescription(line.category, line.productName, line.prescriptionRequired);
}

type LineReading = {
  right: LabPrescription['right'];
  left: LabPrescription['left'];
  add: string;
  pd: string;
  notes: string;
};

export async function attachLineLabJobs(
  tx: Pick<SaleTx, 'labClient' | 'labJob' | 'organisation' | 'alert'>,
  input: {
    orgId: string;
    userId: string;
    invoiceId: string;
    customerName: string;
    billLabOrgId?: string;
    assignAllToLab?: boolean;
    lines: ReadonlyArray<{
      productName: string;
      category: string;
      prescriptionRequired: boolean | null;
      reading: LineReading | null;
      labOrgId?: string;
    }>;
  },
): Promise<boolean> {
  let missingLab = false;
  for (const line of input.lines) {
    if (!line.reading || !isLabProduct(line)) {
      continue;
    }
    const labOrgId = input.assignAllToLab ? input.billLabOrgId : line.labOrgId;
    if (!labOrgId) {
      continue;
    }
    const reference = await attachInvoiceLabJob(tx, {
      orgId: input.orgId,
      userId: input.userId,
      invoiceId: input.invoiceId,
      customerName: input.customerName,
      prescription: {
        labOrgId,
        referenceNumber: await allocateLabReference(tx),
        right: line.reading.right,
        left: line.reading.left,
        add: line.reading.add,
        pd: line.reading.pd,
        notes: line.reading.notes,
        specialInstructions: line.productName,
      },
    });
    if (!reference) {
      missingLab = true;
    }
  }
  return missingLab;
}

function blank(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

async function labIsConnected(orgId: string, labOrgId: string): Promise<boolean> {
  const link = await prisma.labClient.findFirst({
    where: { labOrgId, linkedOrgId: orgId, status: 'APPROVED' },
    select: { id: true },
  });
  return link !== null;
}

async function outstandingByCustomer(
  orgId: string,
  customerIds: readonly string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (customerIds.length === 0) {
    return totals;
  }
  const invoices = await prisma.invoice.findMany({
    where: { orgId, customerId: { in: [...customerIds] }, status: 'CREDIT', cancelledAt: null },
    select: {
      customerId: true,
      total: true,
      payments: { select: { amount: true } },
    },
  });
  for (const invoice of invoices) {
    const paid = invoice.payments.reduce(
      (sum, payment) => sum + moneyToCents(money(payment.amount)),
      0,
    );
    const due = Math.max(0, moneyToCents(money(invoice.total)) - paid);
    totals.set(invoice.customerId, (totals.get(invoice.customerId) ?? 0) + due);
  }
  return totals;
}

async function lockBatches(
  tx: Pick<SaleTx, '$queryRaw'>,
  orgId: string,
  batchIds: readonly string[],
): Promise<
  Map<
    string,
    {
      stockQty: number;
      productName: string;
      priceCode: string;
      salePrice: string;
      category: string;
      prescriptionRequired: boolean | null;
    }
  >
> {
  const locked = new Map<
    string,
    {
      stockQty: number;
      productName: string;
      priceCode: string;
      salePrice: string;
      category: string;
      prescriptionRequired: boolean | null;
    }
  >();
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
      continue;
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
  tx: Pick<SaleTx, 'invoiceSequence'>,
  orgId: string,
): Promise<number> {
  const sequence = await tx.invoiceSequence.upsert({
    where: { orgId },
    create: { orgId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return sequence.lastNumber;
}

async function logWhatsApp(
  orgId: string,
  userId: string,
  invoiceId: string,
  sent: boolean,
  detail: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId,
      userId,
      action: sent ? 'WHATSAPP_RECEIPT_SENT' : 'WHATSAPP_RECEIPT_FAILED',
      entityType: 'Invoice',
      entityId: invoiceId,
      metadata: { detail: detail.slice(0, 500) },
    },
  });
}

function receiptMessage(receipt: PosReceipt): string {
  const status = receipt.status === 'PAID' ? 'Paid' : 'On credit';
  const heading = receipt.billHeading.trim() || receipt.businessName;
  const credit =
    receipt.paymentType === 'CREDIT'
      ? ` Amount paid ${receipt.amountPaid}. Balance -${receipt.outstanding}.`
      : '';
  const delivery = receipt.deliveryAddress ? ` Delivery charge ${receipt.deliveryCharge}.` : '';
  const base = `${heading} invoice #${receipt.invoiceNumber} for ${receipt.customerName}. Total ${receipt.total}.${credit}${delivery} ${status}.`;
  const terms = receipt.billTerms.trim();
  if (!terms) {
    return base;
  }
  const room = 1024 - base.length - 1;
  if (room < 12) {
    return base;
  }
  const clipped = terms.length > room ? `${terms.slice(0, room - 1)}…` : terms;
  return `${base}\n${clipped}`;
}

function shopAddress(address: string | null, city: string | null): string | null {
  const line = [address?.trim(), city?.trim()].filter((part) => part && part.length > 0).join(', ');
  return line.length > 0 ? line : null;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function receivedOnBill(
  paymentType: 'CASH' | 'CREDIT',
  amountReceived: string | undefined,
  totalCents: number,
): number {
  if (paymentType === 'CASH') {
    return totalCents;
  }
  const received = amountReceived === undefined ? 0 : moneyToCents(amountReceived);
  if (received < 0 || received > totalCents) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Enter an amount from zero up to the bill total');
  }
  return received;
}

function receiptOutstanding(invoice: {
  status: 'PAID' | 'CREDIT';
  cancelledAt?: Date | null;
  total: { toFixed: (digits: number) => string };
  payments: readonly { amount: { toFixed: (digits: number) => string } }[];
}): string {
  if (invoice.cancelledAt || invoice.status !== 'CREDIT') {
    return '0.00';
  }
  const paid = invoice.payments.reduce(
    (sum, payment) => sum + moneyToCents(money(payment.amount)),
    0,
  );
  return centsToMoney(Math.max(0, moneyToCents(money(invoice.total)) - paid));
}

function receiptReading(value: unknown): PosReceipt['items'][number]['prescription'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const reading = {
    right: receiptEye(record.right),
    left: receiptEye(record.left),
    add: receiptText(record.add),
    pd: receiptText(record.pd),
    notes: receiptText(record.notes),
  };
  const parsed = ReceiptPrescriptionSchema.safeParse(reading);
  if (!parsed.success) {
    return null;
  }
  const filled = [
    parsed.data.right.sphere,
    parsed.data.right.cylinder,
    parsed.data.right.axis,
    parsed.data.left.sphere,
    parsed.data.left.cylinder,
    parsed.data.left.axis,
    parsed.data.add,
    parsed.data.pd,
    parsed.data.notes,
  ].some((part) => part.trim().length > 0);
  return filled ? parsed.data : null;
}

function receiptEye(value: unknown): { sphere: string; cylinder: string; axis: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { sphere: '', cylinder: '', axis: '' };
  }
  const eye = value as Record<string, unknown>;
  return {
    sphere: receiptText(eye.sphere),
    cylinder: receiptText(eye.cylinder),
    axis: receiptText(eye.axis),
  };
}

function receiptText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function prescriptionText(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.summary === 'string' && record.summary.length > 0) {
    return record.summary;
  }
  const right = eyeText(record.right);
  const left = eyeText(record.left);
  if (!right && !left) {
    return null;
  }
  const parts = [`R ${right ?? '—'} · L ${left ?? '—'}`];
  if (typeof record.add === 'string' && record.add.trim()) {
    parts.push(`Add ${record.add.trim()}`);
  }
  if (typeof record.pd === 'string' && record.pd.trim()) {
    parts.push(`PD ${record.pd.trim()}`);
  }
  if (typeof record.notes === 'string' && record.notes.trim()) {
    parts.push(record.notes.trim());
  }
  return parts.join(' · ');
}

function eyeText(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const eye = value as Record<string, unknown>;
  const sphere = typeof eye.sphere === 'string' ? eye.sphere : '';
  const cylinder = typeof eye.cylinder === 'string' ? eye.cylinder : '';
  const axis = typeof eye.axis === 'string' ? eye.axis : '';
  if (!sphere && !cylinder && !axis) {
    return null;
  }
  return `${sphere || '—'} / ${cylinder || '—'} × ${axis || '—'}`;
}

function money(value: { toFixed: (digits: number) => string }): string {
  return value.toFixed(2);
}

function requiredRetailerOrgId(auth: AuthSessionUser): string {
  if (auth.orgType !== 'RETAILER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'A retailer organisation is required');
  }
  return auth.orgId;
}
