import './setup-env.js';

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { prisma } from '@optiworld/db';
import request from 'supertest';

import { createApp } from '../app.js';
import { closeRedis } from '../lib/redis.js';

const app = createApp();
const password = 'OptiWorld123!';
const retailerEmail = 'lab-retailer@example.com';
const otherEmail = 'lab-other@example.com';

describe('retailer lab jobs', () => {
  after(async () => {
    await removeOrg(retailerEmail);
    await removeOrg(otherEmail);
    await prisma.organisation.deleteMany({ where: { name: { in: ['Route Lab', 'Hidden Lab'] } } });
    await closeRedis();
    await prisma.$disconnect();
  });

  it('keeps lab jobs inside the retailer that created them', async () => {
    await removeOrg(retailerEmail);
    await removeOrg(otherEmail);
    await prisma.organisation.deleteMany({ where: { name: { in: ['Route Lab', 'Hidden Lab'] } } });

    const retailer = await onboard('Route Optics', retailerEmail, 'Sara Route');
    const other = await onboard('Other Optics', otherEmail, 'Hina Other');
    const token = await activate(retailer.orgId, retailerEmail);
    const otherToken = await activate(other.orgId, otherEmail);
    const lab = await prisma.organisation.create({
      data: {
        name: 'Route Lab',
        username: 'routelab',
        type: 'LABORATORY',
        status: 'ACTIVE',
        city: 'Lahore',
        phone: '+92 42 5550190',
        planType: 'LABORATORY_STANDARD',
        subscriptionStatus: 'ACTIVE',
      },
    });
    const hidden = await prisma.organisation.create({
      data: {
        name: 'Hidden Lab',
        type: 'LABORATORY',
        status: 'ACTIVE',
        city: 'Karachi',
        planType: 'LABORATORY_STANDARD',
        subscriptionStatus: 'ACTIVE',
      },
    });

    const blocked = await request(app)
      .post('/api/v1/lab-jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(jobBody(lab.id, 'OW-LAB-2026-ROUTE', 'Ayesha Route'));
    assert.equal(blocked.status, 403);

    const connected = await request(app)
      .post('/api/v1/retailer/lab-connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ labOrgId: lab.id });
    assert.equal(connected.status, 201);
    assert.equal(connected.body.data.name, 'Route Lab');
    assert.equal(connected.body.data.city, 'Lahore');

    assert.equal(connected.body.data.status, 'PENDING');

    const again = await request(app)
      .post('/api/v1/retailer/lab-connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ labOrgId: lab.id });
    assert.equal(again.status, 422);

    const waiting = await request(app)
      .post('/api/v1/lab-jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(jobBody(lab.id, 'OW-LAB-2026-HOLD1', 'Ayesha Route'));
    assert.equal(waiting.status, 403);

    await prisma.labClient.updateMany({
      where: { labOrgId: lab.id, linkedOrgId: retailer.orgId },
      data: { status: 'APPROVED' },
    });

    const created = await request(app)
      .post('/api/v1/lab-jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...jobBody(lab.id, 'OW-LAB-2026-ROUTE', 'Ayesha Route'),
        frameType: 'Full rim',
        frameMaterial: 'Metal',
        eyeSize: '52',
        specialInstructions: 'AR coating',
      });
    assert.equal(created.status, 201);
    const jobId = created.body.data.id as string;
    const notice = await prisma.alert.findFirst({
      where: { orgId: lab.id, relatedEntityId: jobId, relatedEntityType: 'LabJob' },
    });
    assert.equal(notice?.title, 'New job assigned');
    assert.equal(notice?.isRead, false);
    assert.match(notice?.body ?? '', /OW-LAB-2026-ROUTE/);
    assert.match(notice?.body ?? '', /Route Optics/);

    const listed = await request(app)
      .get('/api/v1/retailer/lab-jobs?status=SUBMITTED')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.length, 1);
    assert.equal(listed.body.data[0].referenceNumber, 'OW-LAB-2026-ROUTE');
    assert.equal(listed.body.data[0].patientName, 'Ayesha Route');

    const cutting = await request(app)
      .get('/api/v1/retailer/lab-jobs?status=CUTTING')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(cutting.body.data.length, 0);

    const detail = await request(app)
      .get(`/api/v1/lab-jobs/${jobId}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.prescription.right.sphere, '-1.25');
    assert.equal(detail.body.data.frame.type, 'Full rim');
    assert.equal(detail.body.data.specialInstructions, 'AR coating');
    assert.equal(detail.body.data.history.length, 1);
    assert.equal(detail.body.data.notifyWhatsapp, true);

    const history = await request(app)
      .get(`/api/v1/lab-jobs/${jobId}/status-history`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(history.status, 200);
    assert.equal(history.body.data[0].status, 'SUBMITTED');

    const hiddenFromOther = await request(app)
      .get(`/api/v1/lab-jobs/${jobId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(hiddenFromOther.status, 404);
    const otherList = await request(app)
      .get('/api/v1/retailer/lab-jobs')
      .set('Authorization', `Bearer ${otherToken}`);
    assert.equal(otherList.body.data.length, 0);

    const notify = await request(app)
      .patch(`/api/v1/lab-jobs/${jobId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ notifyWhatsapp: false });
    assert.equal(notify.status, 200);
    assert.equal(notify.body.data.notifyWhatsapp, false);

    const user = await prisma.user.findUnique({ where: { email: retailerEmail } });
    assert.ok(user);
    const job = await prisma.labJob.findUnique({ where: { id: jobId } });
    assert.ok(job);
    await prisma.labJobStatusHistory.create({
      data: {
        labJobId: jobId,
        status: 'READY',
        changedByUserId: user.id,
        changedAt: new Date(job.createdAt.getTime() + 2 * 86_400_000),
      },
    });
    await prisma.labJob.update({ where: { id: jobId }, data: { status: 'READY' } });

    const connections = await request(app)
      .get('/api/v1/retailer/lab-connections')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(connections.status, 200);
    assert.equal(connections.body.data[0].activeJobs, 1);
    assert.equal(connections.body.data[0].averageTurnaroundDays, 2);

    const found = await request(app)
      .get('/api/v1/retailer/labs/search?q=routelab')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(found.body.data.length, 1);
    assert.equal(found.body.data[0].name, 'Route Lab');
    assert.equal(found.body.data[0].connectionStatus, 'APPROVED');
    const partial = await request(app)
      .get('/api/v1/retailer/labs/search?q=Route')
      .set('Authorization', `Bearer ${token}`);
    assert.equal(partial.body.data.length, 0);

    const disconnected = await request(app)
      .patch(`/api/v1/retailer/lab-connections/${lab.id}/disconnect`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(disconnected.status, 200);
    assert.equal(disconnected.body.data.status, 'REJECTED');
    const blockedAgain = await request(app)
      .post('/api/v1/lab-jobs')
      .set('Authorization', `Bearer ${token}`)
      .send(jobBody(lab.id, 'OW-LAB-2026-AGAIN', 'Ayesha Route'));
    assert.equal(blockedAgain.status, 403);

    const wholesaler = await request(app).post('/api/v1/auth/login').send({
      email: 'admin@lensline.example',
      password,
    });
    const denied = await request(app)
      .get('/api/v1/retailer/lab-jobs')
      .set('Authorization', `Bearer ${wholesaler.body.data.accessToken}`);
    assert.equal(denied.status, 403);

    await prisma.labJobStatusHistory.deleteMany({ where: { labJobId: jobId } });
    await prisma.labJob.deleteMany({ where: { id: jobId } });
    await prisma.labClient.deleteMany({ where: { labOrgId: { in: [lab.id, hidden.id] } } });
    await prisma.organisation.deleteMany({ where: { id: { in: [lab.id, hidden.id] } } });
  });
});

function jobBody(labOrgId: string, referenceNumber: string, patientName: string) {
  return {
    labOrgId,
    referenceNumber,
    patientName,
    right: { sphere: '-1.25', cylinder: '-0.50', axis: '90' },
    left: { sphere: '-1.00', cylinder: '', axis: '' },
    add: '1.50',
    pd: '62',
  };
}

async function onboard(
  businessName: string,
  email: string,
  fullName: string,
): Promise<{ orgId: string }> {
  const created = await request(app).post('/api/v1/onboarding/complete').send({
    orgType: 'RETAILER',
    businessName,
    city: 'Lahore',
    phone: '+92 300 5550191',
    fullName,
    email,
    password,
  });
  assert.equal(created.status, 201);
  return { orgId: created.body.data.user.orgId as string };
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
  await prisma.alert.deleteMany({ where: { orgId } });
  await prisma.auditLog.deleteMany({ where: { orgId } });
  await prisma.subscription.deleteMany({ where: { orgId } });
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { orgId } });
  await prisma.organisation.delete({ where: { id: orgId } });
}
