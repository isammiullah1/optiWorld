import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';

describe('retailer shell summary', () => {
  after(async () => {
    await closeRedis();
    await prisma.$disconnect();
  });

  it('returns the shop name, unread alerts, and active jobs for a retailer', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'owner@brightview.example',
      password,
    });
    assert.equal(login.status, 200);
    const token = login.body.data.accessToken as string;

    const shell = await request(app)
      .get('/api/v1/retailer/shell')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(shell.status, 200);
    assert.equal(shell.body.data.orgName, 'BrightView Optics');
    assert.ok(shell.body.data.unreadAlertCount >= 1);
    assert.equal(shell.body.data.activeJobCount, 1);

    const wholesaler = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@lensline.example',
      password,
    });
    assert.equal(wholesaler.status, 200);
    const denied = await request(app)
      .get('/api/v1/retailer/shell')
      .set('Authorization', `Bearer ${wholesaler.body.data.accessToken}`);
    assert.equal(denied.status, 403);
  });
});
