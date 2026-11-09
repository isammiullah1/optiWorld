import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

import { prisma } from '@optiworld/db';

const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) {
  loadEnvFile(rootEnv);
}

const brightview = '10000000-0000-4000-8000-000000000001';
const lensline = '10000000-0000-4000-8000-000000000003';
const connectionFull = '70000000-0000-4000-8000-000000000001';
const catalogSv = '60000000-0000-4000-8000-000000000001';
const marker = 'e2e-playwright';

const statePath = resolve(process.cwd(), 'e2e/.runtime.json');

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === 'billing-up') {
    await clearBilling();
    const customer = await prisma.customer.create({
      data: {
        orgId: brightview,
        name: 'Tariq Hussain',
        phone: '+92 300 5550191',
        creditLimit: '5000.00',
        notes: marker,
      },
    });
    const batch = await prisma.inventoryBatch.create({
      data: {
        orgId: brightview,
        priceCode: 'SV500',
        prefix: 'E2',
        productName: 'Single Vision SV500',
        category: 'Lenses',
        salePrice: '1800.00',
        costPrice: '900.00',
        stockQty: 40,
        lowStockThreshold: 5,
      },
    });
    write({ customerId: customer.id, batchId: batch.id, phone: customer.phone });
    return;
  }
  if (command === 'billing-down') {
    await clearBilling();
    return;
  }
  if (command === 'order-up') {
    await clearOrders();
    const order = await prisma.order.create({
      data: {
        wholesalerOrgId: lensline,
        retailerOrgId: brightview,
        connectionId: connectionFull,
        status: 'PENDING',
        totalValue: '900.00',
        notes: marker,
        items: {
          create: {
            catalogProductId: catalogSv,
            productName: 'CR39 SV',
            quantity: 1,
            agreedPrice: '900.00',
          },
        },
        chatThread: { create: {} },
      },
    });
    write({ orderId: order.id, catalogProductId: catalogSv });
    return;
  }
  if (command === 'order-down') {
    await clearOrders();
    return;
  }
  if (command === 'prices-up') {
    await clearPrices();
    const other = await prisma.organisation.create({
      data: {
        name: 'E2E Other Supply',
        type: 'WHOLESALER',
        status: 'ACTIVE',
        planType: 'WHOLESALER_STANDARD',
        subscriptionStatus: 'ACTIVE',
        city: 'Karachi',
        phone: '+92 300 5550198',
      },
    });
    write({
      hiddenWholesalerId: lensline,
      otherWholesalerId: other.id,
    });
    return;
  }
  if (command === 'prices-down') {
    await clearPrices();
    return;
  }
  if (command === 'invoice') {
    const invoice = await prisma.invoice.findUnique({
      where: { id: process.argv[3] },
      include: { customer: true, items: true },
    });
    write({
      customerId: invoice?.customerId ?? '',
      status: invoice?.status ?? '',
      phone: invoice?.customer.phone ?? '',
      priceCodes: invoice?.items.map((item) => item.priceCode).join(',') ?? '',
      invoiceNumber: String(invoice?.invoiceNumber ?? ''),
    });
    return;
  }
  if (command === 'latest-invoice') {
    const customer = await prisma.customer.findFirst({
      where: { orgId: brightview, notes: marker, name: 'Tariq Hussain' },
    });
    const invoice = customer
      ? await prisma.invoice.findFirst({
          where: { customerId: customer.id, items: { some: { priceCode: 'SV500' } } },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    write({
      invoiceId: invoice?.id ?? '',
      invoiceNumber: String(invoice?.invoiceNumber ?? '0'),
    });
    return;
  }
  throw new Error(`Unknown seed command ${command ?? ''}`);
}

function write(data: Record<string, string | null>): void {
  writeFileSync(statePath, JSON.stringify(data));
}

async function clearBilling(): Promise<void> {
  const customers = await prisma.customer.findMany({
    where: { orgId: brightview, notes: marker },
    select: { id: true },
  });
  const customerIds = customers.map((customer) => customer.id);
  if (customerIds.length > 0) {
    const invoices = await prisma.invoice.findMany({
      where: { customerId: { in: customerIds } },
      select: { id: true },
    });
    const invoiceIds = invoices.map((invoice) => invoice.id);
    if (invoiceIds.length > 0) {
      await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
      await prisma.alert.deleteMany({ where: { relatedEntityId: { in: invoiceIds } } });
      await prisma.auditLog.deleteMany({ where: { entityId: { in: invoiceIds } } });
      await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    }
    await prisma.payment.deleteMany({ where: { customerId: { in: customerIds } } });
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
  }
  const batches = await prisma.inventoryBatch.findMany({
    where: { orgId: brightview, prefix: 'E2', priceCode: 'SV500' },
    select: { id: true },
  });
  const batchIds = batches.map((batch) => batch.id);
  if (batchIds.length > 0) {
    await prisma.stockMovement.deleteMany({ where: { batchId: { in: batchIds } } });
    await prisma.inventoryBatch.deleteMany({ where: { id: { in: batchIds } } });
  }
}

async function clearOrders(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { notes: marker },
    select: { id: true },
  });
  const orderIds = orders.map((order) => order.id);
  if (orderIds.length === 0) {
    return;
  }
  await prisma.changeRequest.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.chatMessage.deleteMany({ where: { thread: { orderId: { in: orderIds } } } });
  await prisma.chatThread.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.alert.deleteMany({ where: { relatedEntityId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
}

async function clearPrices(): Promise<void> {
  const orgs = await prisma.organisation.findMany({
    where: { name: 'E2E Other Supply' },
    select: { id: true },
  });
  for (const org of orgs) {
    await prisma.organisation.delete({ where: { id: org.id } });
  }
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Seed failed'}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
