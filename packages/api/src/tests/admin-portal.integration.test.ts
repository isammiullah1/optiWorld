import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';
import type { Mailer, OrganisationInviteMail } from '../services/mailer.js';

const password = 'OptiWorld123!';
const inviteEmail = 'portal-check@example.com';
const sent: OrganisationInviteMail[] = [];

const mailer: Mailer = {
  async sendPasswordReset() {
    return undefined;
  },
  async sendOrganisationInvite(message) {
    sent.push(message);
    return true;
  },
};

const app = createApp({ mailer });

describe('super admin portal', () => {
  after(async () => {
    await removePortalOrg();
    await closeRedis();
    await prisma.$disconnect();
  });

  it('manages organisations without exposing financial data', async () => {
    await removePortalOrg();
    sent.length = 0;
    const adminToken = await login('superadmin@optiworld.example');
    const retailerToken = await login('owner@brightview.example');

    const denied = await request(app)
      .get('/api/v1/admin/organisations')
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(denied.status, 403);

    const renewsSoon = utcDay(6);
    const renewsLater = utcDay(40);
    const created = await request(app)
      .post('/api/v1/admin/organisations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Portal Check Optics',
        type: 'RETAILER',
        city: 'Lahore',
        phone: '+92 42 5550199',
        planType: 'RETAILER_STANDARD',
        subscriptionEndDate: renewsSoon,
        inviteEmail,
      });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.inviteSent, true);
    assert.equal(sent.length, 1);
    const orgId = created.body.data.id as string;
    const token = new URL(sent[0]?.inviteUrl ?? 'http://localhost/invite').searchParams.get(
      'token',
    );
    assert.ok(token);

    const listed = await request(app)
      .get('/api/v1/admin/organisations?q=Portal%20Check')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.length, 1);
    assert.equal(listed.body.data[0].status, 'ACTIVE');

    const preview = await request(app).get(`/api/v1/onboarding/invite?token=${token ?? ''}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.email, inviteEmail);

    const accepted = await request(app).post('/api/v1/onboarding/accept-invite').send({
      token,
      fullName: 'Portal Checker',
      password,
    });
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.data.user.email, inviteEmail);

    const reused = await request(app).post('/api/v1/onboarding/accept-invite').send({
      token,
      fullName: 'Portal Checker',
      password,
    });
    assert.equal(reused.status, 422);

    const deactivated = await request(app)
      .patch(`/api/v1/admin/organisations/${orgId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'INACTIVE', adminNotes: 'Check notes' });
    assert.equal(deactivated.status, 200);
    assert.equal(deactivated.body.data.status, 'INACTIVE');
    assert.equal(deactivated.body.data.adminNotes, 'Check notes');

    const weekBefore = await request(app)
      .get('/api/v1/admin/subscriptions?filter=WEEK')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(weekBefore.status, 200);
    assert.equal(
      weekBefore.body.data.some((row: { orgId: string }) => row.orgId === orgId),
      true,
    );
    const strangers = (weekBefore.body.data as { orgId: string }[]).filter(
      (row) => row.orgId !== orgId,
    );
    if (strangers.length === 0) {
      const bulk = await request(app)
        .post('/api/v1/admin/subscriptions/extend-week')
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(bulk.status, 200);
      assert.equal(bulk.body.data.extended, 1);
    }

    const extended = await request(app)
      .patch(`/api/v1/admin/organisations/${orgId}/subscription`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'EXTEND', renewalDate: renewsLater });
    assert.equal(extended.status, 200);
    assert.equal(extended.body.data.renewalDate.startsWith(renewsLater), true);
    assert.equal(extended.body.data.subscriptionHistory.length >= 2, true);

    const users = await request(app)
      .get(`/api/v1/admin/users?q=${encodeURIComponent(inviteEmail)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(users.status, 200);
    assert.equal(users.body.data.length, 1);
    assert.equal(users.body.data[0].role, 'OWNER');
    assert.equal(JSON.stringify(users.body).includes('passwordHash'), false);

    const userId = users.body.data[0].id as string;
    const paused = await request(app)
      .patch(`/api/v1/admin/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    assert.equal(paused.status, 200);
    assert.equal(paused.body.data.isActive, false);

    const dashboard = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.data.breakdown.length, 3);
    assert.equal(JSON.stringify(dashboard.body).includes('revenue'), false);
    assert.equal(JSON.stringify(dashboard.body).includes('totalValue'), false);

    const week = await request(app)
      .get('/api/v1/admin/subscriptions?filter=WEEK')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(week.status, 200);
    assert.equal(
      week.body.data.some((row: { orgId: string }) => row.orgId === orgId),
      false,
    );

    const health = await request(app)
      .get('/api/v1/admin/platform/health')
      .set('Authorization', `Bearer ${adminToken}`);
    assert.equal(health.status, 200);
    assert.equal(health.body.data.database.status, 'UP');
    assert.equal(typeof health.body.data.socket.connections, 'number');
    assert.equal(health.body.data.errors.length <= 20, true);

    const detail = JSON.stringify(extended.body);
    assert.equal(detail.includes('revenue'), false);
    assert.equal(detail.includes('profit'), false);
    assert.equal(detail.includes('totalValue'), false);
  });
});

function utcDay(offset: number): string {
  const now = new Date();
  const day = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset),
  );
  return day.toISOString().slice(0, 10);
}

async function login(email: string): Promise<string> {
  const response = await request(app).post('/api/v1/auth/login').send({ email, password });
  assert.equal(response.status, 200);
  return response.body.data.accessToken as string;
}

async function removePortalOrg(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: inviteEmail } });
  const org =
    (user ? await prisma.organisation.findUnique({ where: { id: user.orgId } }) : null) ??
    (await prisma.organisation.findFirst({ where: { name: 'Portal Check Optics' } }));
  if (!org) {
    return;
  }
  await prisma.organisationInvite.deleteMany({ where: { orgId: org.id } });
  await prisma.auditLog.deleteMany({ where: { orgId: org.id } });
  await prisma.subscription.deleteMany({ where: { orgId: org.id } });
  await prisma.refreshToken.deleteMany({ where: { user: { orgId: org.id } } });
  await prisma.passwordResetToken.deleteMany({ where: { user: { orgId: org.id } } });
  await prisma.user.deleteMany({ where: { orgId: org.id } });
  await prisma.organisation.delete({ where: { id: org.id } });
}
