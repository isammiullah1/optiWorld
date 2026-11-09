import { prisma } from '@optiworld/db';
import {
  labJobNeedsLabDecision,
  type AuthSessionUser,
  type JobStatus,
  type LabShopRequest,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { refreshDeliveryForInvoice } from './deliveries.service.js';

const REQUEST_ACTIONS = [
  'LAB_JOB_SHOP_REQUESTED',
  'LAB_JOB_SHOP_ACCEPTED',
  'LAB_JOB_SHOP_DECLINED',
] as const;

type EyeReading = { sphere: string; cylinder: string; axis: string };

type StoredPrescription = {
  right: EyeReading;
  left: EyeReading;
  add: string;
  pd: string;
  notes: string;
  invoiceItemId: string | null;
};

type StoredRequest = {
  kind: 'CANCEL' | 'PRESCRIPTION';
  summary: string;
  reason: string;
  prescription: StoredPrescription | null;
};

export async function shopRequestsForJobs(
  orgId: string,
  jobIds: readonly string[],
): Promise<Map<string, LabShopRequest>> {
  const found = new Map<string, LabShopRequest>();
  if (jobIds.length === 0) {
    return found;
  }
  const rows = await prisma.auditLog.findMany({
    where: {
      orgId,
      entityType: 'LabJob',
      entityId: { in: [...jobIds] },
      action: { in: [...REQUEST_ACTIONS] },
    },
    orderBy: { createdAt: 'desc' },
    select: { entityId: true, action: true, metadata: true },
  });
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.entityId)) {
      continue;
    }
    seen.add(row.entityId);
    if (row.action !== 'LAB_JOB_SHOP_REQUESTED') {
      continue;
    }
    const request = readRequest(row.metadata);
    if (request) {
      found.set(row.entityId, { kind: request.kind, summary: request.summary });
    }
  }
  return found;
}

export async function openShopRequest(
  orgId: string,
  jobId: string,
): Promise<LabShopRequest | null> {
  const found = await shopRequestsForJobs(orgId, [jobId]);
  return found.get(jobId) ?? null;
}

export async function requestReceivedCancellation(
  auth: AuthSessionUser,
  jobId: string,
  reason: string,
): Promise<{ id: string; sent: boolean; message: string }> {
  const retailerOrgId = requireRetailer(auth);
  const savedReason = reason.trim();
  const job = await loadRetailerJob(retailerOrgId, jobId);
  if (!labJobNeedsLabDecision(job.status as JobStatus)) {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'This job can be cancelled by the shop until the laboratory receives it',
    );
  }
  await assertNoOpenRequest(retailerOrgId, job.id);
  const summary = savedReason;
  await prisma.$transaction(async (tx) => {
    await writeRequest(tx, {
      retailerOrgId,
      labOrgId: job.labOrgId,
      userId: auth.userId,
      jobId: job.id,
      action: 'LAB_JOB_SHOP_REQUESTED',
      metadata: { kind: 'CANCEL', summary, reason: savedReason, prescription: null },
    });
    await tx.alert.create({
      data: {
        orgId: job.labOrgId,
        type: 'LAB_JOB_STATUS',
        title: 'Cancellation requested',
        body: `${job.referenceNumber}: the shop asked to cancel this job. ${savedReason}`,
        relatedEntityId: job.id,
        relatedEntityType: 'LabJob',
      },
    });
  });
  const shopName = await shopNameFor(retailerOrgId);
  const notice = await notifyLab(
    auth,
    job,
    shopName,
    'cancellation requested. Please call the shop',
  );
  return { id: job.id, sent: notice.sent, message: notice.message };
}

export async function requestReceivedPrescription(
  auth: AuthSessionUser,
  job: { id: string; labOrgId: string; referenceNumber: string; retailerOrgId: string },
  prescription: StoredPrescription,
): Promise<void> {
  const retailerOrgId = requireRetailer(auth);
  const current = await prisma.labJob.findFirst({
    where: { id: job.id, retailerOrgId },
    select: { status: true },
  });
  if (!current || current.status !== 'RECEIVED') {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'A prescription change can be requested only while the job is received. Once processing starts, only a cancellation can be requested.',
    );
  }
  await assertNoOpenRequest(retailerOrgId, job.id);
  const summary = describePrescription(prescription);
  await prisma.$transaction(async (tx) => {
    await writeRequest(tx, {
      retailerOrgId,
      labOrgId: job.labOrgId,
      userId: auth.userId,
      jobId: job.id,
      action: 'LAB_JOB_SHOP_REQUESTED',
      metadata: { kind: 'PRESCRIPTION', summary, reason: '', prescription },
    });
    await tx.alert.create({
      data: {
        orgId: job.labOrgId,
        type: 'LAB_JOB_STATUS',
        title: 'Prescription change requested',
        body: `${job.referenceNumber}: the shop proposed a new prescription. The job stays as it is until you accept.`,
        relatedEntityId: job.id,
        relatedEntityType: 'LabJob',
      },
    });
  });
  const shopName = await shopNameFor(retailerOrgId);
  await notifyLab(
    auth,
    { ...job, lab: await labContact(job.labOrgId) },
    shopName,
    'prescription change requested. Please call the shop',
  );
}

export async function respondToShopRequest(
  auth: AuthSessionUser,
  jobId: string,
  action: 'ACCEPT' | 'DECLINE',
): Promise<void> {
  const labOrgId = requireLab(auth);
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, labOrgId },
    select: {
      id: true,
      status: true,
      labOrgId: true,
      retailerOrgId: true,
      retailerInvoiceId: true,
      referenceNumber: true,
      lab: { select: { name: true } },
      retailer: { select: { name: true, phone: true, whatsappNumber: true } },
    },
  });
  if (!job || !job.retailerOrgId || !job.retailer) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  if (!labJobNeedsLabDecision(job.status as JobStatus)) {
    throw new AppError(409, 'ORDER_LOCKED', 'This request is no longer waiting on the laboratory');
  }
  const open = await latestRequest(labOrgId, job.id);
  if (!open || open.action !== 'LAB_JOB_SHOP_REQUESTED') {
    throw new AppError(409, 'VALIDATION_ERROR', 'This job has no open request from the shop');
  }
  const request = readRequest(open.metadata);
  if (!request) {
    throw new AppError(409, 'VALIDATION_ERROR', 'This job has no open request from the shop');
  }
  const retailerOrgId = job.retailerOrgId;
  await prisma.$transaction(async (tx) => {
    const stillOpen = await tx.auditLog.findFirst({
      where: {
        orgId: labOrgId,
        entityType: 'LabJob',
        entityId: job.id,
        action: { in: [...REQUEST_ACTIONS] },
      },
      orderBy: { createdAt: 'desc' },
      select: { action: true },
    });
    if (!stillOpen || stillOpen.action !== 'LAB_JOB_SHOP_REQUESTED') {
      throw new AppError(409, 'VALIDATION_ERROR', 'This job has no open request from the shop');
    }
    if (action === 'ACCEPT' && request.kind === 'CANCEL') {
      await tx.labJob.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });
      await tx.labJobStatusHistory.create({
        data: {
          labJobId: job.id,
          status: 'CANCELLED',
          notes: request.reason,
          changedByUserId: auth.userId,
        },
      });
      await refreshDeliveryForInvoice(tx, job.retailerInvoiceId);
      await tx.auditLog.create({
        data: {
          orgId: retailerOrgId,
          userId: auth.userId,
          action: 'LAB_JOB_CANCELLED',
          entityType: 'LabJob',
          entityId: job.id,
          metadata: { referenceNumber: job.referenceNumber, reason: request.reason },
        },
      });
    }
    if (action === 'ACCEPT' && request.kind === 'PRESCRIPTION' && request.prescription) {
      await tx.labJob.update({
        where: { id: job.id },
        data: {
          prescription: {
            right: request.prescription.right,
            left: request.prescription.left,
            add: request.prescription.add,
            pd: request.prescription.pd,
          },
          notes: request.prescription.notes.trim() || null,
        },
      });
      if (request.prescription.invoiceItemId) {
        await tx.invoiceItem.updateMany({
          where: { id: request.prescription.invoiceItemId, invoice: { orgId: retailerOrgId } },
          data: {
            prescription: {
              right: request.prescription.right,
              left: request.prescription.left,
              add: request.prescription.add,
              pd: request.prescription.pd,
              notes: request.prescription.notes,
            },
          },
        });
      }
    }
    await writeRequest(tx, {
      retailerOrgId,
      labOrgId,
      userId: auth.userId,
      jobId: job.id,
      action: action === 'ACCEPT' ? 'LAB_JOB_SHOP_ACCEPTED' : 'LAB_JOB_SHOP_DECLINED',
      metadata: {
        kind: request.kind,
        summary: request.summary,
        reason: request.reason,
        prescription: request.prescription,
      },
    });
    await tx.alert.create({
      data: {
        orgId: retailerOrgId,
        type: 'LAB_JOB_STATUS',
        title: action === 'ACCEPT' ? 'Laboratory accepted the request' : 'Laboratory kept the job',
        body:
          action === 'ACCEPT'
            ? request.kind === 'CANCEL'
              ? `${job.referenceNumber} was cancelled after the laboratory accepted.`
              : `${job.referenceNumber} now uses the prescription the shop proposed.`
            : `${job.referenceNumber} stays as it is. The laboratory did not accept the request.`,
        relatedEntityId: job.id,
        relatedEntityType: 'LabJob',
      },
    });
  });
  const label =
    action === 'ACCEPT'
      ? request.kind === 'CANCEL'
        ? 'cancellation accepted'
        : 'prescription change accepted'
      : request.kind === 'CANCEL'
        ? 'cancellation rejected. The job stays as it is'
        : 'prescription change rejected. The job stays as it is';
  await notifyRetailer(auth, job, label);
}

async function assertNoOpenRequest(orgId: string, jobId: string): Promise<void> {
  const open = await openShopRequest(orgId, jobId);
  if (open) {
    throw new AppError(
      409,
      'VALIDATION_ERROR',
      'Resolve the open request before asking for another change',
    );
  }
}

async function latestRequest(
  orgId: string,
  jobId: string,
): Promise<{ action: string; metadata: unknown } | null> {
  return prisma.auditLog.findFirst({
    where: { orgId, entityType: 'LabJob', entityId: jobId, action: { in: [...REQUEST_ACTIONS] } },
    orderBy: { createdAt: 'desc' },
    select: { action: true, metadata: true },
  });
}

async function loadRetailerJob(
  retailerOrgId: string,
  jobId: string,
): Promise<{
  id: string;
  status: string;
  labOrgId: string;
  referenceNumber: string;
  lab: { name: string; phone: string | null; whatsappNumber: string | null };
}> {
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, retailerOrgId },
    select: {
      id: true,
      status: true,
      labOrgId: true,
      referenceNumber: true,
      lab: { select: { name: true, phone: true, whatsappNumber: true } },
    },
  });
  if (!job) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  return job;
}

async function labContact(
  labOrgId: string,
): Promise<{ name: string; phone: string | null; whatsappNumber: string | null }> {
  const lab = await prisma.organisation.findFirst({
    where: { id: labOrgId },
    select: { name: true, phone: true, whatsappNumber: true },
  });
  return lab ?? { name: 'Laboratory', phone: null, whatsappNumber: null };
}

function writeRequest(
  tx: {
    auditLog: {
      createMany(args: {
        data: Array<{
          orgId: string;
          userId: string;
          action: string;
          entityType: string;
          entityId: string;
          metadata: ReturnType<typeof requestMetadata>;
        }>;
      }): Promise<unknown>;
    };
  },
  input: {
    retailerOrgId: string;
    labOrgId: string;
    userId: string;
    jobId: string;
    action: (typeof REQUEST_ACTIONS)[number];
    metadata: StoredRequest;
  },
): Promise<unknown> {
  const metadata = requestMetadata(input.metadata);
  return tx.auditLog.createMany({
    data: [input.retailerOrgId, input.labOrgId].map((orgId) => ({
      orgId,
      userId: input.userId,
      action: input.action,
      entityType: 'LabJob',
      entityId: input.jobId,
      metadata,
    })),
  });
}

function requestMetadata(input: StoredRequest): {
  kind: 'CANCEL' | 'PRESCRIPTION';
  summary: string;
  reason: string;
  prescription?: {
    right: EyeReading;
    left: EyeReading;
    add: string;
    pd: string;
    notes: string;
    invoiceItemId: string;
  };
} {
  if (!input.prescription) {
    return { kind: input.kind, summary: input.summary, reason: input.reason };
  }
  return {
    kind: input.kind,
    summary: input.summary,
    reason: input.reason,
    prescription: { ...input.prescription, invoiceItemId: input.prescription.invoiceItemId ?? '' },
  };
}

function readRequest(metadata: unknown): StoredRequest | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }
  const record = metadata as Record<string, unknown>;
  if (record.kind !== 'CANCEL' && record.kind !== 'PRESCRIPTION') {
    return null;
  }
  return {
    kind: record.kind,
    summary: typeof record.summary === 'string' ? record.summary : '',
    reason: typeof record.reason === 'string' ? record.reason : '',
    prescription: readPrescription(record.prescription),
  };
}

function readPrescription(value: unknown): StoredPrescription | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const right = readEye(record.right);
  const left = readEye(record.left);
  if (!right || !left) {
    return null;
  }
  return {
    right,
    left,
    add: typeof record.add === 'string' ? record.add : '',
    pd: typeof record.pd === 'string' ? record.pd : '',
    notes: typeof record.notes === 'string' ? record.notes : '',
    invoiceItemId: typeof record.invoiceItemId === 'string' ? record.invoiceItemId : null,
  };
}

function readEye(value: unknown): EyeReading | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    sphere: typeof record.sphere === 'string' ? record.sphere : '',
    cylinder: typeof record.cylinder === 'string' ? record.cylinder : '',
    axis: typeof record.axis === 'string' ? record.axis : '',
  };
}

function describePrescription(prescription: StoredPrescription): string {
  return `R ${eyeLine(prescription.right)} · L ${eyeLine(prescription.left)} · Add ${prescription.add || '—'} · PD ${prescription.pd || '—'}`;
}

function eyeLine(eye: EyeReading): string {
  return (
    [eye.sphere, eye.cylinder, eye.axis].filter((part) => part.trim().length > 0).join(' / ') || '—'
  );
}

async function shopNameFor(orgId: string): Promise<string> {
  const shop = await prisma.organisation.findFirst({
    where: { id: orgId },
    select: { name: true },
  });
  return shop?.name ?? 'A connected shop';
}

async function notifyLab(
  auth: AuthSessionUser,
  job: {
    id: string;
    referenceNumber: string;
    lab: { name: string; phone: string | null; whatsappNumber: string | null };
  },
  shopName: string,
  label: string,
): Promise<{ sent: boolean; message: string }> {
  const saved = 'The request was sent to the laboratory. The job stays as it is until they accept.';
  const phone = digitsOnly(job.lab.whatsappNumber ?? job.lab.phone ?? '');
  const text = `${shopName}: ${job.referenceNumber}. ${label}.`.slice(0, 1024);
  if (!phone) {
    await logWhatsapp(auth, job.id, false, 'Laboratory has no phone number');
    return { sent: false, message: `${saved} This laboratory has no phone number for WhatsApp.` };
  }
  const token = process.env.WHATSAPP_API_TOKEN ?? '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  if (!token || !phoneNumberId) {
    await logWhatsapp(auth, job.id, false, 'WhatsApp is not configured');
    return { sent: false, message: `${saved} WhatsApp is not configured yet.` };
  }
  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: 'optiworld_job_status',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: shopName },
                { type: 'text', text: job.referenceNumber },
                { type: 'text', text: label.slice(0, 200) },
              ],
            },
          ],
        },
      }),
    });
    if (!response.ok) {
      await logWhatsapp(auth, job.id, false, `WhatsApp returned ${response.status}`);
      return { sent: false, message: `${saved} WhatsApp could not send the notification.` };
    }
    await logWhatsapp(auth, job.id, true, text);
    return { sent: true, message: `${saved} They were asked on WhatsApp to call you.` };
  } catch (error) {
    logger.error('WhatsApp lab request failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    await logWhatsapp(auth, job.id, false, 'WhatsApp request failed');
    return { sent: false, message: `${saved} WhatsApp could not send the notification.` };
  }
}

async function notifyRetailer(
  auth: AuthSessionUser,
  job: {
    id: string;
    referenceNumber: string;
    lab: { name: string };
    retailer: { name: string; phone: string | null; whatsappNumber: string | null };
  },
  label: string,
): Promise<void> {
  const phone = digitsOnly(job.retailer.whatsappNumber ?? job.retailer.phone ?? '');
  const text = `${job.lab.name}: ${job.referenceNumber}. ${label}.`.slice(0, 1024);
  if (!phone) {
    await logWhatsapp(auth, job.id, false, 'Retailer has no phone number');
    return;
  }
  const token = process.env.WHATSAPP_API_TOKEN ?? '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  if (!token || !phoneNumberId) {
    await logWhatsapp(auth, job.id, false, 'WhatsApp is not configured');
    return;
  }
  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: 'optiworld_job_status',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: job.lab.name },
                { type: 'text', text: job.referenceNumber },
                { type: 'text', text: label.slice(0, 200) },
              ],
            },
          ],
        },
      }),
    });
    if (!response.ok) {
      await logWhatsapp(auth, job.id, false, `WhatsApp returned ${response.status}`);
      return;
    }
    await logWhatsapp(auth, job.id, true, text);
  } catch (error) {
    logger.error('WhatsApp retailer response failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    await logWhatsapp(auth, job.id, false, 'WhatsApp request failed');
  }
}

async function logWhatsapp(
  auth: AuthSessionUser,
  jobId: string,
  sent: boolean,
  detail: string,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      orgId: auth.orgId,
      userId: auth.userId,
      action: sent ? 'WHATSAPP_JOB_STATUS_SENT' : 'WHATSAPP_JOB_STATUS_FAILED',
      entityType: 'LabJob',
      entityId: jobId,
      metadata: { detail },
    },
  });
}

function requireRetailer(auth: AuthSessionUser): string {
  if (auth.orgType !== 'RETAILER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'A retailer organisation is required');
  }
  return auth.orgId;
}

function requireLab(auth: AuthSessionUser): string {
  if (auth.orgType !== 'LABORATORY' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'A laboratory organisation is required');
  }
  return auth.orgId;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}
