import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const ownerEmail = 'account-shop@example.com';
const staffEmail = 'account-staff@example.com';

describe('retailer profile and staff access', () => {
  after(async () => {
    await removeOrg(ownerEmail);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('lets an owner manage the shop and limit a staff account', async () => {
    await removeOrg(ownerEmail);
    const created = await request(app).post('/api/v1/onboarding/complete').send({
      orgType: 'RETAILER',
      businessName: 'Account Optics',
      city: 'Lahore',
      phone: '+92 42 5550101',
      fullName: 'Sara Account',
      email: ownerEmail,
      password,
    });
    assert.equal(created.status, 201);
    const orgId = created.body.data.user.orgId as string;
    await prisma.organisation.update({
      where: { id: orgId },
      data: { subscriptionStatus: 'ACTIVE', username: 'accountoptics' },
    });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ownerEmail, password });
    assert.equal(login.status, 200);
    const token = login.body.data.accessToken as string;

    const saved = await request(app)
      .patch('/api/v1/retailer/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Account Optics',
        phone: '+92 42 5550101',
        city: 'Karachi',
        address: '1 Test Road',
        whatsappNumber: '+92 300 5550101',
        about: 'Family optical shop on Mall Road.',
      });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.shop.username, 'accountoptics');
    assert.equal(saved.body.data.shop.city, 'Karachi');
    assert.equal(saved.body.data.shop.about, 'Family optical shop on Mall Road.');
    assert.equal(saved.body.data.account.email, ownerEmail);

    const username = await request(app)
      .patch('/api/v1/retailer/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newoptics' });
    assert.equal(username.status, 403);

    const staff = await request(app)
      .post('/api/v1/retailer/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Staff Account',
        email: staffEmail,
        phone: '',
        password,
        role: 'STAFF',
        features: ['customers'],
      });
    assert.equal(staff.status, 201);
    assert.deepEqual(staff.body.data.features, ['customers']);

    const staffLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: staffEmail, password });
    assert.equal(staffLogin.status, 200);
    const staffToken = staffLogin.body.data.accessToken as string;
    const customers = await request(app)
      .get('/api/v1/retailer/customers')
      .set('Authorization', `Bearer ${staffToken}`);
    assert.equal(customers.status, 200);
    const inventory = await request(app)
      .get('/api/v1/retailer/inventory')
      .set('Authorization', `Bearer ${staffToken}`);
    assert.equal(inventory.status, 403);
    const deniedStaff = await request(app)
      .get('/api/v1/retailer/staff')
      .set('Authorization', `Bearer ${staffToken}`);
    assert.equal(deniedStaff.status, 403);

    const renamed = await request(app)
      .patch('/api/v1/retailer/account')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        name: 'Staff Renamed',
        phone: '',
        currentPassword: '',
        newPassword: '',
      });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.data.account.name, 'Staff Renamed');
    assert.equal(renamed.body.data.account.email, staffEmail);
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
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.subscription.deleteMany({ where: { orgId } });
  await prisma.alert.deleteMany({ where: { orgId } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organisation.delete({ where: { id: orgId } });
}
