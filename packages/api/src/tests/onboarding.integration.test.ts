import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import ExcelJS from 'exceljs';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const retailerEmail = 'onboarding-retailer@example.com';
const wholesalerEmail = 'onboarding-wholesaler@example.com';

describe('onboarding and retailer import', () => {
  after(async () => {
    await removeOrg(retailerEmail);
    await removeOrg(wholesalerEmail);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('creates a retailer, then previews and imports a customer sheet', async () => {
    const created = await request(app).post('/api/v1/onboarding/complete').send({
      orgType: 'RETAILER',
      businessName: 'Onboarding Optics',
      city: 'Lahore',
      phone: '+92 300 1111111',
      whatsappNumber: '',
      address: 'Mall Road',
      listingProfileNotes: 'Should be ignored',
      fullName: 'Ayesha Khan',
      email: retailerEmail,
      password,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.user.orgType, 'RETAILER');
    assert.equal(created.body.data.user.role, 'OWNER');
    const token = created.body.data.accessToken as string;

    const org = await prisma.organisation.findFirstOrThrow({
      where: { users: { some: { email: retailerEmail } } },
    });
    assert.equal(org.listingProfileNotes, 'Should be ignored');
    assert.equal(org.subscriptionStatus, 'TRIAL');

    const fileBase64 = await sheetBase64([
      ['Name', 'Phone', 'Email', 'Address', 'Credit Limit', 'Outstanding Balance'],
      ['Sana Ali', '+92 321 1000001', 'sana@example.com', 'Gulberg', '5000', '250.50'],
      ['', '+92 321 1000002', '', '', '', ''],
    ]);

    const preview = await request(app)
      .post('/api/v1/import/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileBase64, preview: true });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.preview, true);
    assert.equal(preview.body.data.imported, 0);
    assert.equal(preview.body.data.rows.length, 2);
    assert.equal(preview.body.data.errors[0].message, 'Name is required');

    const imported = await request(app)
      .post('/api/v1/import/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ fileBase64, preview: false });
    assert.equal(imported.status, 200);
    assert.equal(imported.body.data.imported, 1);

    const customer = await prisma.customer.findFirstOrThrow({
      where: { orgId: org.id, phone: '+92 321 1000001' },
    });
    assert.equal(customer.creditLimit.toFixed(2), '5000.00');
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { orgId: org.id } });
    assert.equal(invoice.status, 'CREDIT');
    assert.equal(invoice.total.toFixed(2), '250.50');

    const wholesaler = await request(app).post('/api/v1/onboarding/complete').send({
      orgType: 'WHOLESALER',
      businessName: 'Onboarding Supply',
      city: 'Karachi',
      phone: '+92 300 2222222',
      listingProfileNotes: 'Frames and lenses',
      fullName: 'Omar Shah',
      email: wholesalerEmail,
      password,
    });
    assert.equal(wholesaler.status, 201);
    assert.equal(wholesaler.body.data.user.role, 'ADMIN');
    const note = await prisma.organisation.findFirstOrThrow({
      where: { users: { some: { email: wholesalerEmail } } },
    });
    assert.equal(note.listingProfileNotes, 'Frames and lenses');

    const denied = await request(app)
      .post('/api/v1/import/customers')
      .set('Authorization', `Bearer ${wholesaler.body.data.accessToken}`)
      .send({ fileBase64, preview: true });
    assert.equal(denied.status, 403);
  });
});

async function sheetBase64(rows: string[][]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  for (const row of rows) {
    sheet.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString('base64');
}

async function removeOrg(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }
  const orgId = user.orgId;
  await prisma.invoiceItem.deleteMany({ where: { invoice: { orgId } } });
  await prisma.invoice.deleteMany({ where: { orgId } });
  await prisma.customer.deleteMany({ where: { orgId } });
  await prisma.inventoryBatch.deleteMany({ where: { orgId } });
  await prisma.subscription.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organisation.delete({ where: { id: orgId } });
}
