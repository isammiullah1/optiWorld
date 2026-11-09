import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const retailerEmail = 'board-retailer@example.com';
const labEmail = 'board-lab@example.com';
const otherEmail = 'board-other-lab@example.com';

describe('laboratory job board', () => {
  after(async () => {
    await removeOrg(retailerEmail);
    await removeOrg(labEmail);
    await removeOrg(otherEmail);
    await closeRedis();
    await prisma.$disconnect();
  });

  it('lets the owning laboratory move jobs and hides them from everyone else', async () => {
    await removeOrg(retailerEmail);
    await removeOrg(labEmail);
    await removeOrg(otherEmail);

    const retailer = await onboard('RETAILER', 'Board Optics', retailerEmail, 'Sara Board');
    const lab = await onboard('LABORATORY', 'Board Lab', labEmail, 'Usman Board');
    const other = await onboard('LABORATORY', 'Other Board Lab', otherEmail, 'Hina Board');
    const retailerToken = await activate(retailer.orgId, retailerEmail);
    const labToken = await activate(lab.orgId, labEmail);
    const otherToken = await activate(other.orgId, otherEmail);

    const connected = await request(app)
      .post('/api/v1/retailer/lab-connections')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({ labOrgId: lab.orgId });
    assert.equal(connected.status, 201);
    assert.equal(connected.body.data.status, 'PENDING');
    await acceptLabRequest(app, labToken);

    const created = await request(app)
      .post('/api/v1/lab-jobs')
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({
        labOrgId: lab.orgId,
        referenceNumber: 'OW-LAB-2026-BOARD',
        patientName: 'Ayesha Board',
        right: { sphere: '-1.25', cylinder: '-0.50', axis: '90' },
        left: { sphere: '-1.00', cylinder: '', axis: '' },
        add: '1.50',
        pd: '62',
      });
    assert.equal(created.status, 201);
    const jobId = created.body.data.id as string;

    const deniedRetailer = await request(app)
      .get('/api/v1/lab/jobs')
      .set('Authorization', `Bearer ${retailerToken}`);
    assert.equal(deniedRetailer.status, 403);
    const deniedStatus = await request(app)
      .patch(`/api/v1/lab-jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${retailerToken}`)
      .send({ status: 'CUTTING' });
    assert.equal(deniedStatus.status, 403);

    const board = await request(app)
      .get('/api/v1/lab/jobs?q=Ayesha')
      .set('Authorization', `Bearer ${labToken}`);
    assert.equal(board.status, 200);
    assert.equal(board.body.data.jobs.length, 1);
    assert.equal(board.body.data.jobs[0].referenceNumber, 'OW-LAB-2026-BOARD');
    assert.equal(board.body.data.jobs[0].retailerName, 'Board Optics');
    assert.equal(board.body.data.jobs[0].status, 'RECEIVED');
    assert.match(board.body.data.jobs[0].rxSummary, /R -1\.25/);
    assert.equal(JSON.stringify(board.body).includes('totalValue'), false);

    const hidden = await request(app)
      .get('/api/v1/lab/jobs')
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(hidden.body.data.jobs.length, 0);
    const hiddenJob = await request(app)
      .get(`/api/v1/lab/jobs/${jobId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(hiddenJob.status, 404);

    const moved = await request(app)
      .patch(`/api/v1/lab-jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ status: 'CUTTING' });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.data.status, 'CUTTING');
    assert.equal(moved.body.data.history.length, 2);
    assert.equal(moved.body.data.history[1].status, 'CUTTING');

    const skipped = await request(app)
      .patch(`/api/v1/lab-jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ status: 'DISPATCHED' });
    assert.equal(skipped.status, 422);
    const backward = await request(app)
      .patch(`/api/v1/lab-jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ status: 'RECEIVED' });
    assert.equal(backward.status, 422);

    const urgent = await request(app)
      .patch(`/api/v1/lab-jobs/${jobId}/urgent`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ isUrgent: true });
    assert.equal(urgent.status, 200);
    assert.equal(urgent.body.data.isUrgent, true);

    const notes = await request(app)
      .patch(`/api/v1/lab-jobs/${jobId}/notes`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ notes: 'Edge polish before QC.' });
    assert.equal(notes.status, 200);
    assert.equal(notes.body.data.notes, 'Edge polish before QC.');

    const edited = await request(app)
      .patch(`/api/v1/lab-jobs/${jobId}/prescription`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({
        prescription: {
          right: { sphere: '-2.00', cylinder: '-0.50', axis: '90' },
          left: { sphere: '-1.00', cylinder: '', axis: '' },
          add: '1.50',
          pd: '62',
          notes: '',
        },
      });
    assert.equal(edited.status, 409);

    const ready = await request(app)
      .patch(`/api/v1/lab-jobs/${jobId}/status`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ status: 'READY' });
    assert.equal(ready.status, 200);
    const lockedRx = await request(app)
      .patch(`/api/v1/lab-jobs/${jobId}/prescription`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({
        prescription: {
          right: { sphere: '-3.00', cylinder: '-0.50', axis: '90' },
          left: { sphere: '-1.00', cylinder: '', axis: '' },
          add: '1.50',
          pd: '62',
          notes: '',
        },
      });
    assert.equal(lockedRx.status, 409);

    const notify = await request(app)
      .post(`/api/v1/lab-jobs/${jobId}/notify-retailer`)
      .set('Authorization', `Bearer ${labToken}`);
    assert.equal(notify.status, 200);
    assert.equal(notify.body.data.sent, false);

    const added = await request(app)
      .post('/api/v1/lab/jobs')
      .set('Authorization', `Bearer ${labToken}`)
      .send({
        patientName: 'Walk-in Board',
        patientPhone: '+92 300 5550100',
        retailerOrgId: retailer.orgId,
        frameName: 'Metro Rectangle',
        frameType: 'Full rim',
        lensName: 'Blue Cut',
        lensType: 'Single vision',
        prescription: {
          right: { sphere: '-1.25', cylinder: '', axis: '' },
          left: { sphere: '', cylinder: '', axis: '' },
          add: '',
          pd: '',
          notes: '',
        },
      });
    assert.equal(added.status, 201);
    assert.match(added.body.data.referenceNumber, /^OW-\d{4}-\d{3}$/);
    const detail = await request(app)
      .get(`/api/v1/lab/jobs/${added.body.data.id as string}`)
      .set('Authorization', `Bearer ${labToken}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.frame.name, 'Metro Rectangle');
    assert.equal(detail.body.data.frame.type, 'Full rim');
    assert.equal(detail.body.data.lens.name, 'Blue Cut');
    assert.equal(detail.body.data.lens.type, 'Single vision');

    const badPhone = await request(app)
      .post('/api/v1/lab/jobs')
      .set('Authorization', `Bearer ${labToken}`)
      .send({
        patientName: 'Bad Phone',
        patientPhone: '033354081888888888900000',
        prescription: {
          right: { sphere: '-1.00', cylinder: '', axis: '' },
          left: { sphere: '', cylinder: '', axis: '' },
          add: '',
          pd: '',
          notes: '',
        },
      });
    assert.equal(badPhone.status, 422);

    const missingLens = await request(app)
      .post('/api/v1/lab/jobs')
      .set('Authorization', `Bearer ${labToken}`)
      .send({
        patientName: 'No Lens',
        patientPhone: '+92 300 5550102',
        frameName: 'Metro Rectangle',
        frameType: 'Full rim',
        prescription: {
          right: { sphere: '-1.00', cylinder: '', axis: '' },
          left: { sphere: '', cylinder: '', axis: '' },
          add: '',
          pd: '',
          notes: '',
        },
      });
    assert.equal(missingLens.status, 422);

    const walkIn = await request(app)
      .post('/api/v1/lab/jobs')
      .set('Authorization', `Bearer ${labToken}`)
      .send({
        patientName: 'Walk-in Notify',
        patientPhone: '+92 300 5550199',
        frameName: 'Metro Rectangle',
        frameType: 'Full rim',
        lensName: 'Blue Cut',
        lensType: 'Single vision',
        prescription: {
          right: { sphere: '-1.00', cylinder: '', axis: '' },
          left: { sphere: '', cylinder: '', axis: '' },
          add: '',
          pd: '',
          notes: '',
        },
      });
    assert.equal(walkIn.status, 201);
    const customerNotify = await request(app)
      .post(`/api/v1/lab-jobs/${walkIn.body.data.id as string}/notify-retailer`)
      .set('Authorization', `Bearer ${labToken}`);
    assert.equal(customerNotify.status, 200);
    assert.equal(customerNotify.body.data.sent, false);

    const missingReason = await request(app)
      .post(`/api/v1/lab-jobs/${walkIn.body.data.id as string}/cancel`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ reason: ' ' });
    assert.equal(missingReason.status, 422);

    const cancelled = await request(app)
      .post(`/api/v1/lab-jobs/${walkIn.body.data.id as string}/cancel`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ reason: 'Customer cancelled the order' });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data.status, 'CANCELLED');
    assert.equal(cancelled.body.data.history.at(-1).notes, 'Customer cancelled the order');

    const cancelledAgain = await request(app)
      .post(`/api/v1/lab-jobs/${walkIn.body.data.id as string}/cancel`)
      .set('Authorization', `Bearer ${labToken}`)
      .send({ reason: 'Customer cancelled the order' });
    assert.equal(cancelledAgain.status, 409);

    const boardAfter = await request(app)
      .get('/api/v1/lab/jobs')
      .set('Authorization', `Bearer ${labToken}`);
    const cancelledCard = boardAfter.body.data.jobs.find(
      (job: { id: string }) => job.id === walkIn.body.data.id,
    );
    assert.equal(cancelledCard.status, 'CANCELLED');
    assert.equal(cancelledCard.trail.at(-1), 'CANCELLED');
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
    phone: '+92 42 5550192',
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
  await prisma.labJobStatusHistory.deleteMany({ where: { labJobId: { in: jobIds } } });
  await prisma.alert.deleteMany({
    where: { OR: [{ orgId }, { relatedEntityId: { in: jobIds } }] },
  });
  await prisma.labJob.deleteMany({ where: { id: { in: jobIds } } });
  await prisma.labClient.deleteMany({
    where: { OR: [{ labOrgId: orgId }, { linkedOrgId: orgId }] },
  });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.subscription.deleteMany({ where: { orgId } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organisation.delete({ where: { id: orgId } });
}
