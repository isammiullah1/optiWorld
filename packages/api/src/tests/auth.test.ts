import './setup-env.js';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';
import {
  PASSWORD,
  authHeader,
  createAccount,
  login,
  removeByPrefix,
  type TestAccount,
} from './critical-fixtures.js';

const app = createApp();
const prefix = 'critical-auth';

describe('auth', () => {
  let retailer: TestAccount;
  let inactive: TestAccount;

  before(async () => {
    await removeByPrefix(prefix);
    retailer = await createAccount({ prefix, slug: 'retailer', type: 'RETAILER', role: 'OWNER' });
    inactive = await createAccount({
      prefix,
      slug: 'inactive',
      type: 'RETAILER',
      role: 'OWNER',
      status: 'INACTIVE',
    });
  });

  after(async () => {
    await removeByPrefix(prefix);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('returns tokens for a valid login', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
      email: retailer.email,
      password: PASSWORD,
    });
    assert.equal(response.status, 200);
    assert.equal(typeof response.body.data.accessToken, 'string');
    assert.equal(typeof response.body.data.refreshToken, 'string');
    assert.equal(response.body.data.user.orgType, 'RETAILER');
  });

  it('rejects invalid credentials', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
      email: retailer.email,
      password: 'not-the-password',
    });
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
  });

  it('rejects an inactive organisation', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({
      email: inactive.email,
      password: PASSWORD,
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'FORBIDDEN');
  });

  it('rejects a protected route without a token', async () => {
    const response = await request(app).get('/api/v1/retailer/customers');
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'UNAUTHORIZED');
  });

  it('rejects a retailer token on a wholesaler route', async () => {
    const tokens = await login(app, retailer.email);
    const response = await request(app)
      .get('/api/v1/wholesaler/catalog')
      .set(authHeader(tokens.accessToken));
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'FORBIDDEN');
  });

  it('rejects a super admin on retailer and wholesaler routes', async () => {
    const admin = await request(app).post('/api/v1/auth/login').send({
      email: 'superadmin@optiworld.example',
      password: PASSWORD,
    });
    assert.equal(admin.status, 200);
    const token = admin.body.data.accessToken as string;
    const retailerRoute = await request(app)
      .get('/api/v1/retailer/customers')
      .set(authHeader(token));
    const wholesalerRoute = await request(app)
      .get('/api/v1/wholesaler/catalog')
      .set(authHeader(token));
    assert.equal(retailerRoute.status, 403);
    assert.equal(wholesalerRoute.status, 403);
  });
});
