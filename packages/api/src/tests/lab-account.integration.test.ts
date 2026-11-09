import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const adminEmail = 'account-lab@example.com';
const techEmail = 'account-tech@example.com';

describe('laboratory profile and staff access', () => {
  after(async () => {
    await removeOrg(adminEmail);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('lets an admin update the laboratory and limit a technician', async () => {
    await removeOrg(adminEmail);
    const created = await request(app).post('/api/v1/onboarding/complete').send({
      orgType: 'LABORATORY',
      businessName: 'Account Lab',
      city: 'Lahore',
      phone: '+92 42 5550199',
      fullName: 'Amina Account',
      email: adminEmail,
      password,
    });
    assert.equal(created.status, 201);
    const orgId = created.body.data.user.orgId as string;
    await prisma.organisation.update({
      where: { id: orgId },
      data: { subscriptionStatus: 'ACTIVE' },
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password });
    assert.equal(login.status, 200);
    const token = login.body.data.accessToken as string;

    const saved = await request(app)
      .patch('/api/v1/lab/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Account Lab',
        username: 'accountlab',
        phone: '+92 42 5550199',
        city: 'Karachi',
        address: '1 Test Road',
        whatsappNumber: '+92 300 5550199',
        about: 'Same-day cutting for nearby shops.',
      });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.laboratory.username, 'accountlab');
    assert.equal(saved.body.data.laboratory.city, 'Karachi');
    assert.equal(saved.body.data.laboratory.about, 'Same-day cutting for nearby shops.');
    assert.equal(saved.body.data.features.length, 5);

    const staff = await request(app)
      .post('/api/v1/lab/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Tech Account',
        email: techEmail,
        phone: '',
        password,
        role: 'TECHNICIAN',
        features: ['jobs'],
      });
    assert.equal(staff.status, 201);
    assert.deepEqual(staff.body.data.features, ['jobs']);

    const techLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: techEmail, password });
    assert.equal(techLogin.status, 200);
    const techToken = techLogin.body.data.accessToken as string;
    const jobs = await request(app)
      .get('/api/v1/lab/jobs')
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(jobs.status, 200);
    const inventory = await request(app)
      .get('/api/v1/lab/inventory')
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(inventory.status, 403);
    const notices = await request(app)
      .get('/api/v1/alerts')
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(notices.status, 403);
    const deniedStaff = await request(app)
      .get('/api/v1/lab/staff')
      .set('Authorization', `Bearer ${techToken}`);
    assert.equal(deniedStaff.status, 403);

    const techId = staff.body.data.id as string;
    await prisma.labJob.create({
      data: {
        labOrgId: orgId,
        referenceNumber: 'OW-LAB-2026-DEL01',
        patientName: 'Delete Check',
        prescription: {},
        status: 'RECEIVED',
        statusHistory: { create: { status: 'RECEIVED', changedByUserId: techId } },
      },
    });
    const removed = await request(app)
      .delete(`/api/v1/lab/staff/${techId}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(removed.status, 200);
    const history = await prisma.labJobStatusHistory.findFirst({
      where: { labJob: { referenceNumber: 'OW-LAB-2026-DEL01' } },
    });
    assert.equal(history?.changedByUserId, null);
    const listed = await request(app)
      .get('/api/v1/lab/staff')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(
      listed.body.data.some((row: { email: string }) => row.email === techEmail),
      false,
    );
    const signedOut = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: techEmail, password });
    assert.equal(signedOut.status, 401);
    const self = await request(app)
      .delete(`/api/v1/lab/staff/${saved.body.data.account.id as string}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(self.status, 422);
  });
});

async function removeOrg(address: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: address } });
  if (!user?.orgId) {
    return;
  }
  const orgId = user.orgId;
  const users = await prisma.user.findMany({ where: { orgId }, select: { id: true } });
  const userIds = users.map((row) => row.id);
  const jobs = await prisma.labJob.findMany({ where: { labOrgId: orgId }, select: { id: true } });
  const jobIds = jobs.map((job) => job.id);
  await prisma.labStockMovement.deleteMany({ where: { labOrgId: orgId } });
  await prisma.labJobStatusHistory.deleteMany({ where: { labJobId: { in: jobIds } } });
  await prisma.labJob.deleteMany({ where: { labOrgId: orgId } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.subscription.deleteMany({ where: { orgId } });
  await prisma.alert.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organisation.delete({ where: { id: orgId } });
}
