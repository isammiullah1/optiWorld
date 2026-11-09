import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';

import { closeRedis } from '../lib/redis.js';
import request from 'supertest';

import { createApp } from '../app.js';
import type { Mailer, PasswordResetMail } from '../services/mailer.js';

const password = 'OptiWorld123!';
const ownerEmail = 'owner@brightview.example';
const sent: PasswordResetMail[] = [];

const mailer: Mailer = {
  async sendPasswordReset(message) {
    sent.push(message);
  },
  async sendOrganisationInvite() {
    return false;
  },
};

const app = createApp({ mailer });

describe('auth API', () => {
  after(async () => {
    const user = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (user) {
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    }
    await closeRedis();
    await prisma.$disconnect();
  });

  it('logs in, refreshes, and revokes the refresh token', async () => {
    const loginResponse = await request(app).post('/api/v1/auth/login').send({
      email: ownerEmail,
      password,
    });
    assert.equal(loginResponse.status, 200);
    assert.equal(loginResponse.body.data.user.orgType, 'RETAILER');
    assert.equal(loginResponse.body.data.user.role, 'OWNER');
    assert.equal(loginResponse.body.data.expiresIn, 900);

    const accessToken = loginResponse.body.data.accessToken as string;
    const refreshToken = loginResponse.body.data.refreshToken as string;

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.email, ownerEmail);

    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    assert.equal(refreshed.status, 200);
    assert.equal(typeof refreshed.body.data.accessToken, 'string');

    const logoutResponse = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    assert.equal(logoutResponse.status, 200);

    const revoked = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    assert.equal(revoked.status, 401);
  });

  it('rejects a wrong password and returns a super admin with no organisation', async () => {
    const wrong = await request(app).post('/api/v1/auth/login').send({
      email: ownerEmail,
      password: 'not-the-password',
    });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, 'UNAUTHORIZED');

    const admin = await request(app).post('/api/v1/auth/login').send({
      email: 'superadmin@optiworld.example',
      password,
    });
    assert.equal(admin.status, 200);
    assert.equal(admin.body.data.user.role, 'SUPER_ADMIN');
    assert.equal(admin.body.data.user.orgType, null);
    assert.equal(admin.body.data.user.orgId, null);
  });

  it('returns the same reset response when the email is unknown', async () => {
    const known = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: ownerEmail });
    const before = sent.length;
    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'missing@example.com' });
    assert.equal(unknown.status, 200);
    assert.equal(unknown.body.data.message, known.body.data.message);
    assert.equal(sent.length, before);
  });

  it('resets a password from a one-hour token and restores the development password', async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ownerEmail } });
    const originalHash = user.passwordHash;
    sent.length = 0;

    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: ownerEmail });
    assert.equal(forgot.status, 200);
    assert.equal(sent.length, 1);

    const token = new URL(sent[0]?.resetUrl ?? '').searchParams.get('token');
    assert.ok(token);

    const preview = await request(app).post('/api/v1/auth/reset-password/validate').send({ token });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.data.valid, true);

    const reset = await request(app).post('/api/v1/auth/reset-password').send({
      token,
      password: 'Temporary123!',
    });
    assert.equal(reset.status, 200);
    assert.equal(reset.body.data.email, ownerEmail);

    const reused = await request(app).post('/api/v1/auth/reset-password').send({
      token,
      password: 'Temporary123!',
    });
    assert.equal(reused.status, 422);

    const reusedPreview = await request(app)
      .post('/api/v1/auth/reset-password/validate')
      .send({ token });
    assert.equal(reusedPreview.status, 422);

    const loggedIn = await request(app).post('/api/v1/auth/login').send({
      email: ownerEmail,
      password: 'Temporary123!',
    });
    assert.equal(loggedIn.status, 200);

    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: originalHash } });
  });
});
