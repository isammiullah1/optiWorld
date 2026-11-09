import './setup-env.js';

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const email = 'pos-retailer@example.com';
const precisionLabId = '10000000-0000-4000-8000-000000000004';

describe('retailer POS billing', () => {
  after(async () => {
    await removeOrg(email);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('searches stock and customers, saves a sale, and records a WhatsApp attempt', async () => {
    await removeOrg(email);
    const stale = await prisma.labJob.findMany({
      where: { referenceNumber: 'OW-LAB-2026-ABCDE' },
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.labJobStatusHistory.deleteMany({
        where: { labJobId: { in: stale.map((job) => job.id) } },
      });
      await prisma.labJob.deleteMany({ where: { id: { in: stale.map((job) => job.id) } } });
    }
    const created = await request(app).post('/api/v1/onboarding/complete').send({
      orgType: 'RETAILER',
      businessName: 'POS Optics',
      city: 'Lahore',
      phone: '+92 300 5550188',
      fullName: 'Hina Malik',
      email,
      password,
    });
    assert.equal(created.status, 201);
    const orgId = created.body.data.user.orgId as string;
    await prisma.organisation.update({
      where: { id: orgId },
      data: { subscriptionStatus: 'ACTIVE' },
    });
    const login = await request(app).post('/api/v1/auth/login').send({ email, password });
    const token = login.body.data.accessToken as string;

    const customer = await prisma.customer.create({
      data: { orgId, name: 'Sana Ali', phone: '+92 321 5550188', creditLimit: '5000.00' },
    });
    const batch = await prisma.inventoryBatch.create({
      data: {
        orgId,
        priceCode: 'SV500',
        prefix: 'LN',
        productName: 'Single Vision',
        brand: 'Bright',
        category: 'Lenses',
        salePrice: '500.00',
        stockQty: 8,
        lowStockThreshold: 2,
      },
    });
    await prisma.labClient.create({
      data: { labOrgId: precisionLabId, name: 'POS Optics', linkedOrgId: orgId },
    });

    const products = await request(app)
      .get('/api/v1/retailer/inventory/search?q=SV500')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(products.status, 200);
    assert.equal(products.body.data[0].priceCode, 'SV500');
    assert.equal(products.body.data[0].lowStock, false);

    const added = await request(app)
      .post('/api/v1/retailer/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Walk In', phone: '+92 300 1112233', whatsappNumber: '+92 300 1112233' });
    assert.equal(added.status, 201);
    assert.equal(added.body.data.name, 'Walk In');
    assert.equal(added.body.data.phone, '+92 300 1112233');
    assert.equal(added.body.data.outstanding, '0.00');
    assert.equal(added.body.data.creditLimit, '0.00');

    const customers = await request(app)
      .get('/api/v1/retailer/customers/search?q=Sana')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(customers.status, 200);
    assert.equal(customers.body.data[0].outstanding, '0.00');
    assert.equal(customers.body.data[0].creditLimit, '5000.00');

    const labs = await request(app)
      .get('/api/v1/retailer/laboratories')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(labs.status, 200);
    assert.equal(labs.body.data[0].id, precisionLabId);

    const localId = randomUUID();
    const sale = await request(app)
      .post('/api/v1/retailer/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        localId,
        customerId: customer.id,
        paymentType: 'CASH',
        discount: '50.00',
        items: [{ inventoryBatchId: batch.id, quantity: 2, unitPrice: '500.00' }],
        labPrescription: {
          labOrgId: precisionLabId,
          referenceNumber: 'OW-LAB-2026-ABCDE',
          right: { sphere: '-1.25', cylinder: '-0.50', axis: '90' },
          left: { sphere: '-1.00', cylinder: '', axis: '' },
          add: '1.50',
          pd: '62',
          notes: 'Plastic frame',
        },
      });
    assert.equal(sale.status, 201);
    assert.equal(sale.body.data.total, '950.00');
    assert.equal(sale.body.data.subtotal, '1000.00');
    assert.equal(sale.body.data.discount, '50.00');
    assert.equal(sale.body.data.status, 'PAID');
    assert.equal(sale.body.data.labReference, 'OW-LAB-2026-ABCDE');
    assert.equal(sale.body.data.businessName, 'POS Optics');

    const replay = await request(app)
      .post('/api/v1/retailer/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        localId,
        customerId: customer.id,
        paymentType: 'CASH',
        discount: '50.00',
        items: [{ inventoryBatchId: batch.id, quantity: 2, unitPrice: '500.00' }],
      });
    assert.equal(replay.status, 201);
    assert.equal(replay.body.data.invoiceNumber, sale.body.data.invoiceNumber);

    const stock = await prisma.inventoryBatch.findUnique({ where: { id: batch.id } });
    assert.equal(stock?.stockQty, 6);

    const lineSale = await request(app)
      .post('/api/v1/retailer/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        localId: randomUUID(),
        customerId: customer.id,
        paymentType: 'CASH',
        discount: '0.00',
        assignAllToLab: true,
        billLabOrgId: precisionLabId,
        items: [
          {
            inventoryBatchId: batch.id,
            quantity: 1,
            unitPrice: '500.00',
            prescription: {
              right: { sphere: '-2.00', cylinder: '-0.75', axis: '180' },
              left: { sphere: '-1.75', cylinder: '-0.50', axis: '170' },
              add: '',
              pd: '64',
              notes: 'Line lens',
              remember: false,
            },
          },
          {
            inventoryBatchId: batch.id,
            quantity: 1,
            unitPrice: '500.00',
          },
        ],
      });
    assert.equal(lineSale.status, 201);
    assert.match(lineSale.body.data.labReference, /^OW-\d{4}-\d{3}$/);
    const sentJobs = await prisma.labJob.findMany({
      where: { retailerInvoiceId: lineSale.body.data.id },
    });
    assert.equal(sentJobs.length, 1);
    assert.equal(sentJobs[0]?.labOrgId, precisionLabId);
    assert.equal(sentJobs[0]?.status, 'SUBMITTED');
    assert.equal(sentJobs[0]?.patientName, 'Sana Ali');
    const sentReading = sentJobs[0]?.prescription as { right?: { sphere?: string } };
    assert.equal(sentReading.right?.sphere, '-2.00');

    const whatsapp = await request(app)
      .post('/api/v1/whatsapp/send-receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ invoiceId: sale.body.data.id });
    assert.equal(whatsapp.status, 200);
    assert.equal(whatsapp.body.data.sent, false);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: sale.body.data.id, action: 'WHATSAPP_RECEIPT_FAILED' },
    });
    assert.ok(audit);

    const wholesaler = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@lensline.example',
      password,
    });
    const denied = await request(app)
      .get('/api/v1/retailer/inventory/search?q=SV500')
      .set('Authorization', `Bearer ${wholesaler.body.data.accessToken}`);
    assert.equal(denied.status, 403);
  });
});

async function removeOrg(address: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: address } });
  if (!user) {
    return;
  }
  const orgId = user.orgId;
  const jobs = await prisma.labJob.findMany({
    where: { retailerOrgId: orgId },
    select: { id: true },
  });
  await prisma.labJobStatusHistory.deleteMany({
    where: { labJobId: { in: jobs.map((job) => job.id) } },
  });
  await prisma.labJob.deleteMany({ where: { retailerOrgId: orgId } });
  await prisma.labClient.deleteMany({ where: { linkedOrgId: orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { orgId } } });
  await prisma.payment.deleteMany({ where: { orgId } });
  await prisma.invoice.deleteMany({ where: { orgId } });
  await prisma.invoiceSequence.deleteMany({ where: { orgId } });
  await prisma.customer.deleteMany({ where: { orgId } });
  await prisma.inventoryBatch.deleteMany({ where: { orgId } });
  await prisma.alert.deleteMany({ where: { orgId } });
  await prisma.subscription.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organisation.delete({ where: { id: orgId } });
}
