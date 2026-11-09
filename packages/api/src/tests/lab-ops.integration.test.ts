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
const retailerEmail = 'ops-retailer@example.com';
const labEmail = 'ops-lab@example.com';
const otherEmail = 'ops-other-lab@example.com';

describe('laboratory inventory, clients, and reports', () => {
  after(async () => {
    await removeOrg(retailerEmail);
    await removeOrg(labEmail);
    await removeOrg(otherEmail);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('keeps stock, clients, and job reports inside the laboratory', async () => {
    await removeOrg(retailerEmail);
    await removeOrg(labEmail);
    await removeOrg(otherEmail);
    const retailer = await onboard('RETAILER', 'Ops Optics', retailerEmail, 'Sara Ops');
    const lab = await onboard('LABORATORY', 'Ops Lab', labEmail, 'Usman Ops');
    const other = await onboard('LABORATORY', 'Other Ops Lab', otherEmail, 'Hina Ops');
    const retailerToken = await activate(retailer.orgId, retailerEmail);
    const labToken = await activate(lab.orgId, labEmail);
    const otherToken = await activate(other.orgId, otherEmail);
    const today = new Date().toISOString().slice(0, 10);

    const connected = await request(app)
      .post('/api/v1/retailer/lab-connections')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({ labOrgId: lab.orgId });
    assert.equal(connected.status, 201);
    assert.equal(connected.body.data.status, 'PENDING');
    await acceptLabRequest(app, labToken);

    const denied = await request(app)
      .get('/api/v1/lab/inventory')
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(denied.status, 403);

    const created = await request(app)
      .post('/api/v1/lab/inventory')
      .set('Authorization', `Bearer ${labToken}`)
      .send({
        name: 'CR-39 blank',
        category: 'Lens blank',
        quantity: '10',
        unit: 'pairs',
        reorderLevel: '4',
      });
    assert.equal(created.status, 201);
    const itemId = created.body.data.id as string;
    assert.equal(created.body.data.lowStock, false);

    const patched = await request(app)
      .patch(`/api/v1/lab/inventory/${itemId}`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({
        name: 'CR-39 blank',
        category: 'Lens blank',
        quantity: '3',
        unit: 'pairs',
        reorderLevel: '4',
      });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.data.lowStock, true);

    const received = await request(app)
      .post(`/api/v1/lab/inventory/${itemId}/adjust`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ kind: 'RECEIVED', quantity: '2', occurredOn: today, supplier: 'Blank House' });
    assert.equal(received.status, 200);
    assert.equal(received.body.data.quantity, '5');

    const overdrawn = await request(app)
      .post(`/api/v1/lab/inventory/${itemId}/adjust`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ kind: 'USAGE', quantity: '9' });
    assert.equal(overdrawn.status, 422);

    const hidden = await request(app)
      .get('/api/v1/lab/inventory')
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(hidden.status, 200);
    assert.equal(hidden.body.data.length, 0);

    const clients = await request(app)
      .get('/api/v1/lab/clients')
      .set('Authorization', `Bearer ${labToken}`);
    assert.equal(clients.status, 200);
    const client = clients.body.data.find((row: { name: string }) => row.name === 'Ops Optics');
    assert.ok(client);
    assert.equal(client.type, 'OPTIWORLD');

    const job = await request(app)
      .post('/api/v1/lab/jobs')
      .set('Authorization', `Bearer ${labToken}`)
      .send({
        patientName: 'Ayesha Ops',
        patientPhone: '+92 300 5550101',
        labClientId: client.id,
        lensName: 'Blue Cut',
        lensType: 'Single vision',
        frameName: 'Acetate',
        frameType: 'Full rim',
        prescription: {
          right: { sphere: '-1.00', cylinder: '', axis: '' },
          left: { sphere: '', cylinder: '', axis: '' },
          add: '',
          pd: '',
          notes: '',
        },
      });
    assert.equal(job.status, 201);

    const profile = await request(app)
      .get(`/api/v1/lab/clients/${client.id}/jobs`)
      .set('Authorization', `Bearer ${labToken}`);
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.jobs.length, 1);
    assert.equal(profile.body.data.jobs[0].patientName, 'Ayesha Ops');
    assert.equal(profile.body.data.client.averageTurnaroundHours, null);

    const outsider = await request(app)
      .get(`/api/v1/lab/clients/${client.id}/jobs`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(outsider.status, 404);

    const activity = await request(app)
      .get(`/api/v1/lab/reports/job-activity?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${labToken}`);
    assert.equal(activity.status, 200);
    assert.equal(activity.body.data.days.at(-1).received, 1);
    assert.equal(JSON.stringify(activity.body).includes('revenue'), false);

    const history = await request(app)
      .get(`/api/v1/lab/reports/job-history?q=Ayesha`)
      .set('Authorization', `Bearer ${labToken}`);
    assert.equal(history.status, 200);
    assert.equal(history.body.data.jobs[0].clientName, 'Ops Optics');

    const exported = await request(app)
      .get(`/api/v1/lab/reports/job-history/export?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${labToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    assert.equal(exported.status, 200);
    const file = Buffer.isBuffer(exported.body)
      ? exported.body
      : Buffer.from(exported.text, 'binary');
    assert.equal(file.subarray(0, 2).toString(), 'PK');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file as unknown as ExcelJS.Buffer);
    const headers = JSON.stringify(workbook.worksheets[0]?.getRow(1).values ?? []);
    assert.equal(headers.includes('Reference'), true);
    assert.equal(headers.toLowerCase().includes('revenue'), false);
    assert.equal(headers.toLowerCase().includes('total'), false);

    await prisma.organisation.update({
      where: { id: retailer.orgId },
      data: { username: 'opsoptics' },
    });
    const found = await request(app)
      .get('/api/v1/lab/retailers/search?q=opsoptics')
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(found.status, 200);
    assert.equal(found.body.data.length, 1);
    assert.equal(found.body.data[0].name, 'Ops Optics');
    const invited = await request(app)
      .post('/api/v1/lab/retailers/connect')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ retailerOrgId: found.body.data[0].id });
    assert.equal(invited.status, 201);
    const waiting = await request(app)
      .get('/api/v1/lab/connections')
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(waiting.body.data.outgoing.length, 1);
    const cancelled = await request(app)
      .patch(`/api/v1/lab/connections/${waiting.body.data.outgoing[0].id as string}/cancel`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.status, 'REJECTED');
    const afterCancel = await request(app)
      .get('/api/v1/lab/connections')
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(afterCancel.body.data.outgoing.length, 0);
    const invitedAgain = await request(app)
      .post('/api/v1/lab/retailers/connect')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ retailerOrgId: found.body.data[0].id });
    assert.equal(invitedAgain.status, 201);
    const shopLabs = await request(app)
      .get('/api/v1/retailer/lab-connections')
      .set('Authorization', `Bearer ${retailerToken}`);
    const incoming = shopLabs.body.data.find(
      (row: { name: string }) => row.name === 'Other Ops Lab',
    );
    assert.equal(incoming.incoming, true);
    assert.equal(incoming.status, 'PENDING');
    const acceptedByShop = await request(app)
      .patch(`/api/v1/retailer/lab-connections/${other.orgId}/approve`)
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(acceptedByShop.status, 200);
    assert.equal(acceptedByShop.body.data.status, 'APPROVED');
  });
});

async function onboard(
  orgType: 'RETAILER' | 'LABORATORY',
  businessName: string,
  email: string,
  fullName: string,
): Promise<{ orgId: string }> {
  const created = await request(app).post('/api/v1/onboarding/complete').send({
    orgType,
    businessName,
    city: 'Lahore',
    phone: '+92 42 5550193',
    fullName,
    email,
    password,
  });
  assert.equal(created.status, 201);
  return { orgId: created.body.data.user.orgId as string };
}

async function acceptLabRequest(application: typeof app, labToken: string): Promise<void> {
  const listed = await request(application)
    .get('/api/v1/lab/connections')
    .set('Authorization', `Bearer ${labToken}`);
  assert.equal(listed.status, 200);
  const requestId = listed.body.data.pending[0].id as string;
  const accepted = await request(application)
    .patch(`/api/v1/lab/connections/${requestId}/approve`)
    .set('Authorization', `Bearer ${labToken}`);
  assert.equal(accepted.status, 200);
}

async function activate(orgId: string, email: string): Promise<string> {
  await prisma.organisation.update({
    where: { id: orgId },
    data: { subscriptionStatus: 'ACTIVE' },
  });
  const login = await request(app).post('/api/v1/auth/login').send({ email, password });
  assert.equal(login.status, 200);
  return login.body.data.accessToken as string;
}

async function removeOrg(address: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: address } });
  if (!user?.orgId) {
    return;
  }
  const orgId = user.orgId;
  const jobs = await prisma.labJob.findMany({
    where: { OR: [{ retailerOrgId: orgId }, { labOrgId: orgId }] },
    select: { id: true },
  });
  const jobIds = jobs.map((job) => job.id);
  await prisma.labStockMovement.deleteMany({
    where: { OR: [{ labOrgId: orgId }, { labJobId: { in: jobIds } }] },
  });
  await prisma.labJobStatusHistory.deleteMany({ where: { labJobId: { in: jobIds } } });
  await prisma.alert.deleteMany({
    where: { OR: [{ orgId }, { relatedEntityId: { in: jobIds } }] },
  });
  await prisma.labJob.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.labInventory.deleteMany({ where: { labOrgId: orgId } });
  await prisma.labClient.deleteMany({
    where: { OR: [{ labOrgId: orgId }, { linkedOrgId: orgId }] },
  });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.subscription.deleteMany({ where: { orgId } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organisation.delete({ where: { id: orgId } });
}
