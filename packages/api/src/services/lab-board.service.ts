import { prisma } from '@optiworld/db';
import type {
  AuthSessionUser,
  CreateLabBoardJobRequest,
  ItemPrescription,
  JobStatus,
  LabBoard,
  LabBoardJob,
  LabJobDetail,
} from '@optiworld/shared';
import {
  JOB_STATUS_LABEL,
  MATERIAL_REMINDER_WAIT_MS,
  NEXT_LAB_STATUS,
  isMarkedDoneNote,
  isProcessingStatus,
  labDayMonth,
  labJobNeedsLabDecision,
  nextProductTag,
} from '@optiworld/shared';

import { billLogoPath } from '../lib/bill-logo-store.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { openShopRequest, shopRequestsForJobs } from './lab-job-requests.service.js';
import { historyAction, labActivity } from './record-activity.js';

const DAY_MS = 86_400_000;
const BOARD_LIMIT = 200;
const STATUS_LABEL = JOB_STATUS_LABEL;

const WORKFLOW_STATUSES: readonly JobStatus[] = [
  'CONFIRMED',
  'RECEIVED',
  'CUTTING',
  'READY',
  'DISPATCHED',
];

export async function listLabBoard(
  auth: AuthSessionUser,
  filters: { q?: string; retailerOrgId?: string; from?: string; to?: string },
): Promise<LabBoard> {
  const labOrgId = requireLab(auth);
  const createdAt = dateRange(filters.from, filters.to);
  const q = filters.q?.trim();
  const jobs = await prisma.labJob.findMany({
    where: {
      labOrgId,
      ...(filters.retailerOrgId ? { retailerOrgId: filters.retailerOrgId } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(q
        ? {
            OR: [
              { patientName: { contains: q, mode: 'insensitive' } },
              { patientPhone: { contains: q, mode: 'insensitive' } },
              { referenceNumber: { contains: q, mode: 'insensitive' } },
              { retailer: { name: { contains: q, mode: 'insensitive' } } },
              { labClient: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: {
      retailer: { select: { id: true, name: true, billLogoKey: true } },
      labClient: { select: { name: true, linkedOrg: { select: { billLogoKey: true } } } },
      statusHistory: { orderBy: { changedAt: 'desc' }, take: 8 },
    },
    orderBy: [{ isUrgent: 'desc' }, { updatedAt: 'desc' }],
    take: BOARD_LIMIT,
  });
  const clients = await prisma.labClient.findMany({
    where: { labOrgId, linkedOrgId: { not: null }, status: 'APPROVED' },
    include: { linkedOrg: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  const retailers = new Map<string, string>();
  for (const client of clients) {
    if (client.linkedOrg) {
      retailers.set(client.linkedOrg.id, client.linkedOrg.name);
    }
  }
  for (const job of jobs) {
    if (job.retailer) {
      retailers.set(job.retailer.id, job.retailer.name);
    }
  }
  const requests = await shopRequestsForJobs(
    labOrgId,
    jobs.filter((job) => labJobNeedsLabDecision(job.status)).map((job) => job.id),
  );
  return {
    jobs: jobs.map((job) => ({
      id: job.id,
      referenceNumber: job.referenceNumber,
      patientName: job.patientName,
      patientPhone: job.patientPhone,
      retailerName: job.retailer?.name ?? job.labClient?.name ?? null,
      retailerLogoUrl: billLogoPath(
        job.retailer?.billLogoKey ?? job.labClient?.linkedOrg?.billLogoKey ?? null,
      ),
      retailerOrgId: job.retailer?.id ?? null,
      status: job.status,
      isUrgent: job.isUrgent,
      rxSummary: rxSummary(job.prescription),
      stageNote:
        job.statusHistory.find(
          (entry) => entry.status === job.status && !isMarkedDoneNote(entry.notes),
        )?.notes ?? null,
      stageEnteredAt: stageEnteredAt(job.status, job.createdAt, job.statusHistory),
      createdAt: job.createdAt.toISOString(),
      trail: [...job.statusHistory]
        .reverse()
        .filter((entry) => !isMarkedDoneNote(entry.notes))
        .map((entry) => entry.status),
      shopRequest: labJobNeedsLabDecision(job.status) ? (requests.get(job.id) ?? null) : null,
    })),
    retailers: [...retailers.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function reserveLabReference(
  auth: AuthSessionUser,
): Promise<{ referenceNumber: string }> {
  requireLab(auth);
  return { referenceNumber: await unusedReference() };
}

export async function getLabBoardJob(auth: AuthSessionUser, jobId: string): Promise<LabBoardJob> {
  const job = await loadOwnedJob(auth, jobId);
  const shopRequest = labJobNeedsLabDecision(job.status)
    ? await openShopRequest(job.labOrgId, job.id)
    : null;
  return { ...toBoardJob(job), shopRequest };
}

export async function createLabBoardJob(
  auth: AuthSessionUser,
  input: CreateLabBoardJobRequest,
): Promise<{ id: string; referenceNumber: string }> {
  const labOrgId = requireLab(auth);
  const linked = await resolveJobClient(labOrgId, input.labClientId, input.retailerOrgId);
  const requested = input.referenceNumber?.trim() ?? '';
  const referenceNumber = requested.length > 0 ? requested : await unusedReference();
  if (requested.length > 0) {
    const taken = await prisma.labJob.findUnique({
      where: { referenceNumber },
      select: { id: true },
    });
    if (taken) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        'That tag number was just used. Open Add New Job again.',
      );
    }
  }
  const created = await prisma.labJob.create({
    data: {
      labOrgId,
      retailerOrgId: linked.retailerOrgId,
      labClientId: linked.labClientId,
      referenceNumber,
      patientName: input.patientName.trim(),
      patientPhone: input.patientPhone.trim(),
      prescription: input.prescription,
      frameDetails: boardFrame(input),
      lensDetails: boardLens(input),
      specialInstructions: blankToNull(input.specialInstructions),
      status: 'RECEIVED',
      statusHistory: { create: { status: 'RECEIVED', changedByUserId: auth.userId } },
    },
    select: { id: true, referenceNumber: true },
  });
  return created;
}

export async function updateLabJobStatus(
  auth: AuthSessionUser,
  jobId: string,
  status: JobStatus,
  note?: string,
): Promise<LabBoardJob> {
  const labOrgId = requireLab(auth);
  if (!WORKFLOW_STATUSES.includes(status) && !isProcessingStatus(status)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Choose a lab stage');
  }
  const existing = await prisma.labJob.findFirst({
    where: { id: jobId, labOrgId },
    select: { id: true, status: true, retailerOrgId: true, referenceNumber: true },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  if (
    existing.status === 'DISPATCHED' ||
    existing.status === 'CANCELLED' ||
    existing.status === 'REJECTED' ||
    existing.status === 'OUTSOURCED'
  ) {
    throw new AppError(409, 'ORDER_LOCKED', 'This job cannot move to another step.');
  }
  if (existing.status === 'SUBMITTED') {
    throw new AppError(422, 'VALIDATION_ERROR', 'Accept or reject this job before it can move on.');
  }
  if (existing.status === status) {
    return getLabBoardJob(auth, jobId);
  }
  const next = NEXT_LAB_STATUS[existing.status];
  if (!next || status !== next) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      `This job must move to ${next ? STATUS_LABEL[next] : 'the next step'} next.`,
    );
  }
  if (labJobNeedsLabDecision(existing.status) && existing.retailerOrgId) {
    const open = await openShopRequest(labOrgId, jobId);
    if (open) {
      throw new AppError(
        409,
        'VALIDATION_ERROR',
        'Resolve the shop request before moving this job',
      );
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.labJob.update({ where: { id: jobId }, data: { status } });
    await tx.labJobStatusHistory.create({
      data: { labJobId: jobId, status, notes: blankToNull(note), changedByUserId: auth.userId },
    });
    if (existing.retailerOrgId) {
      await tx.alert.create({
        data: {
          orgId: existing.retailerOrgId,
          type: status === 'READY' ? 'LAB_JOB_READY' : 'LAB_JOB_STATUS',
          title: status === 'READY' ? 'Lab job ready' : 'Lab job updated',
          body: `${existing.referenceNumber} is now ${STATUS_LABEL[status]}.`,
          relatedEntityId: jobId,
          relatedEntityType: 'LabJob',
        },
      });
    }
  });
  return getLabBoardJob(auth, jobId);
}

export async function updateLabJobUrgent(
  auth: AuthSessionUser,
  jobId: string,
  isUrgent: boolean,
): Promise<{ isUrgent: boolean }> {
  const labOrgId = requireLab(auth);
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, labOrgId },
    select: { id: true },
  });
  if (!job) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  return prisma.labJob.update({
    where: { id: job.id },
    data: { isUrgent },
    select: { isUrgent: true },
  });
}

export async function updateLabJobNotes(
  auth: AuthSessionUser,
  jobId: string,
  notes: string,
): Promise<{ notes: string | null }> {
  const labOrgId = requireLab(auth);
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, labOrgId },
    select: { id: true, status: true },
  });
  if (!job) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  const saved = blankToNull(notes);
  const latest = await prisma.labJobStatusHistory.findFirst({
    where: { labJobId: job.id, status: job.status },
    orderBy: { changedAt: 'desc' },
    select: { id: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.labJob.update({ where: { id: job.id }, data: { notes: saved } });
    if (latest) {
      await tx.labJobStatusHistory.update({ where: { id: latest.id }, data: { notes: saved } });
    }
  });
  return { notes: saved };
}

export async function updateLabJobPrescription(
  auth: AuthSessionUser,
  jobId: string,
  prescription: ItemPrescription,
): Promise<LabBoardJob> {
  const labOrgId = requireLab(auth);
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, labOrgId },
    select: { id: true, status: true, prescription: true },
  });
  if (!job) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  if (job.status !== 'SUBMITTED' && job.status !== 'CONFIRMED' && job.status !== 'RECEIVED') {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'Once processing starts, the prescription stays as it is. The shop can request a cancellation.',
    );
  }
  if (job.status === 'RECEIVED') {
    const owned = await prisma.labJob.findFirst({
      where: { id: job.id, labOrgId },
      select: { retailerOrgId: true },
    });
    if (owned?.retailerOrgId) {
      throw new AppError(
        409,
        'ORDER_LOCKED',
        'The shop requests a prescription change. Accept that request to update this job.',
      );
    }
  }
  const stored = job.prescription;
  const notes =
    stored &&
    typeof stored === 'object' &&
    !Array.isArray(stored) &&
    typeof stored.notes === 'string'
      ? stored.notes
      : prescription.notes;
  await prisma.labJob.update({
    where: { id: job.id },
    data: { prescription: { ...prescription, notes } },
  });
  return getLabBoardJob(auth, job.id);
}

export async function cancelLabJob(
  auth: AuthSessionUser,
  jobId: string,
  reason: string,
): Promise<LabBoardJob> {
  const labOrgId = requireLab(auth);
  const savedReason = reason.trim();
  if (!savedReason) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Write a reason for cancelling this job.');
  }
  const existing = await prisma.labJob.findFirst({
    where: { id: jobId, labOrgId },
    select: {
      id: true,
      status: true,
      retailerOrgId: true,
      referenceNumber: true,
      patientName: true,
      lab: { select: { name: true } },
      retailer: { select: { whatsappNumber: true, phone: true } },
    },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  if (existing.status === 'CANCELLED' || existing.status === 'OUTSOURCED') {
    throw new AppError(409, 'ORDER_LOCKED', 'This job is already closed.');
  }
  if (existing.status === 'DISPATCHED') {
    throw new AppError(409, 'ORDER_LOCKED', 'A completed job cannot be cancelled.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.labJob.update({ where: { id: jobId }, data: { status: 'CANCELLED' } });
    await tx.labJobStatusHistory.create({
      data: {
        labJobId: jobId,
        status: 'CANCELLED',
        notes: savedReason,
        changedByUserId: auth.userId,
      },
    });
    if (existing.retailerOrgId) {
      await tx.alert.create({
        data: {
          orgId: existing.retailerOrgId,
          type: 'LAB_JOB_STATUS',
          title: 'Lab job cancelled',
          body: `${existing.referenceNumber} was cancelled. ${savedReason}`,
          relatedEntityId: jobId,
          relatedEntityType: 'LabJob',
        },
      });
    }
  });
  if (existing.retailerOrgId) {
    const text = `${existing.lab.name}: Order ${existing.referenceNumber} was cancelled. ${savedReason}`;
    await sendRetailerJobWhatsApp(auth, existing, `Cancelled. ${savedReason}`, text);
  }
  return getLabBoardJob(auth, jobId);
}

export async function acceptLabJob(auth: AuthSessionUser, jobId: string): Promise<LabBoardJob> {
  const labOrgId = requireLab(auth);
  const existing = await prisma.labJob.findFirst({
    where: { id: jobId, labOrgId },
    select: { id: true, status: true, retailerOrgId: true, referenceNumber: true },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  if (existing.status !== 'SUBMITTED') {
    throw new AppError(409, 'ORDER_LOCKED', 'Only a newly submitted job can be accepted.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.labJob.update({ where: { id: jobId }, data: { status: 'CONFIRMED' } });
    await tx.labJobStatusHistory.create({
      data: { labJobId: jobId, status: 'CONFIRMED', changedByUserId: auth.userId },
    });
    if (existing.retailerOrgId) {
      await tx.alert.create({
        data: {
          orgId: existing.retailerOrgId,
          type: 'LAB_JOB_STATUS',
          title: 'Lab job confirmed',
          body: `${existing.referenceNumber} was accepted. Send the frame and material to the laboratory.`,
          relatedEntityId: jobId,
          relatedEntityType: 'LabJob',
        },
      });
    }
  });
  return getLabBoardJob(auth, jobId);
}

export async function rejectLabJob(
  auth: AuthSessionUser,
  jobId: string,
  reason: string,
): Promise<{ sent: boolean; message: string }> {
  const labOrgId = requireLab(auth);
  const savedReason = reason.trim();
  if (!savedReason) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Write a message for the shop.');
  }
  const existing = await prisma.labJob.findFirst({
    where: { id: jobId, labOrgId },
    select: {
      id: true,
      status: true,
      retailerOrgId: true,
      referenceNumber: true,
      lab: { select: { name: true } },
      retailer: { select: { whatsappNumber: true, phone: true } },
    },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  if (existing.status !== 'SUBMITTED') {
    throw new AppError(409, 'ORDER_LOCKED', 'Only a newly submitted job can be rejected.');
  }
  const retailerOrgId = existing.retailerOrgId;
  if (!retailerOrgId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'A walk-in job is cancelled instead of rejected.');
  }
  await prisma.$transaction(async (tx) => {
    await tx.labJob.update({ where: { id: jobId }, data: { status: 'REJECTED' } });
    await tx.labJobStatusHistory.create({
      data: {
        labJobId: jobId,
        status: 'REJECTED',
        notes: savedReason,
        changedByUserId: auth.userId,
      },
    });
    await tx.alert.create({
      data: {
        orgId: retailerOrgId,
        type: 'LAB_JOB_STATUS',
        title: 'Lab job rejected',
        body: `${existing.referenceNumber} was rejected. ${savedReason}`,
        relatedEntityId: jobId,
        relatedEntityType: 'LabJob',
      },
    });
  });
  const text = `${existing.lab.name}: Order ${existing.referenceNumber} was rejected. ${savedReason}`;
  const whatsapp = await sendRetailerJobWhatsApp(auth, existing, `Rejected. ${savedReason}`, text);
  return {
    sent: whatsapp.sent,
    message: whatsapp.sent
      ? 'The job was rejected and the shop was told on WhatsApp.'
      : `The job was rejected. ${whatsapp.message}`,
  };
}

export async function remindLabMaterial(
  auth: AuthSessionUser,
  jobId: string,
): Promise<{ sent: boolean; message: string }> {
  const labOrgId = requireLab(auth);
  const existing = await prisma.labJob.findFirst({
    where: { id: jobId, labOrgId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      retailerOrgId: true,
      referenceNumber: true,
      lab: { select: { name: true } },
      retailer: { select: { whatsappNumber: true, phone: true } },
      statusHistory: { where: { status: 'SUBMITTED' }, orderBy: { changedAt: 'desc' }, take: 1 },
    },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  if (existing.status !== 'CONFIRMED') {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'A material reminder is sent after the job is confirmed and before the material is received.',
    );
  }
  const retailerOrgId = existing.retailerOrgId;
  if (!retailerOrgId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'This walk-in has no shop to remind.');
  }
  const arrivedAt = existing.statusHistory[0]?.changedAt ?? existing.createdAt;
  if (Date.now() - arrivedAt.getTime() < MATERIAL_REMINDER_WAIT_MS) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'A material reminder can be sent one hour after this job reaches the laboratory.',
    );
  }
  await prisma.alert.create({
    data: {
      orgId: retailerOrgId,
      type: 'LAB_JOB_STATUS',
      title: 'Material still awaiting',
      body: `Order ${existing.referenceNumber} material is still awaiting.`,
      relatedEntityId: jobId,
      relatedEntityType: 'LabJob',
    },
  });
  const text = `${existing.lab.name}: Order ${existing.referenceNumber} material is still awaiting.`;
  return sendRetailerJobWhatsApp(auth, existing, 'Material is still awaiting', text);
}

export async function notifyLabRetailer(
  auth: AuthSessionUser,
  jobId: string,
): Promise<{ sent: boolean; message: string }> {
  const labOrgId = requireLab(auth);
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, labOrgId },
    select: {
      id: true,
      referenceNumber: true,
      status: true,
      patientName: true,
      patientPhone: true,
      retailerOrgId: true,
      lab: { select: { name: true } },
      retailer: { select: { name: true, phone: true, whatsappNumber: true } },
    },
  });
  if (!job) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  const walkIn = !job.retailer || !job.retailerOrgId;
  const label = STATUS_LABEL[job.status];
  const text = `${job.lab.name}: ${job.referenceNumber} for ${job.patientName} is ${label}.`;
  if (!walkIn && job.retailerOrgId) {
    await prisma.alert.create({
      data: {
        orgId: job.retailerOrgId,
        type: job.status === 'READY' ? 'LAB_JOB_READY' : 'LAB_JOB_STATUS',
        title: 'Lab job update',
        body: `${job.referenceNumber} is ${label}.`,
        relatedEntityId: job.id,
        relatedEntityType: 'LabJob',
      },
    });
  }
  const phone = digitsOnly(
    walkIn ? (job.patientPhone ?? '') : (job.retailer?.whatsappNumber ?? job.retailer?.phone ?? ''),
  );
  if (!phone) {
    const detail = walkIn ? 'Walk-in has no phone number' : 'Retailer has no phone number';
    await logWhatsapp(auth, job.id, false, detail);
    return {
      sent: false,
      message: walkIn
        ? 'This walk-in has no contact number for WhatsApp.'
        : 'The retailer has no phone number for WhatsApp.',
    };
  }
  const token = process.env.WHATSAPP_API_TOKEN ?? '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  if (!token || !phoneNumberId) {
    await logWhatsapp(auth, job.id, false, 'WhatsApp is not configured');
    return { sent: false, message: 'WhatsApp is not configured yet.' };
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
                { type: 'text', text: label },
              ],
            },
          ],
        },
      }),
    });
    if (!response.ok) {
      await logWhatsapp(auth, job.id, false, `WhatsApp returned ${response.status}`);
      return { sent: false, message: 'WhatsApp could not send the notification.' };
    }
    await logWhatsapp(auth, job.id, true, text);
    return {
      sent: true,
      message: walkIn
        ? 'The customer was notified on WhatsApp.'
        : 'The retailer was notified on WhatsApp.',
    };
  } catch (error) {
    logger.error('WhatsApp lab job status failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    await logWhatsapp(auth, job.id, false, 'WhatsApp request failed');
    return { sent: false, message: 'WhatsApp could not send the notification.' };
  }
}

async function loadOwnedJob(auth: AuthSessionUser, jobId: string) {
  const labOrgId = requireLab(auth);
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, labOrgId },
    include: {
      lab: { select: { id: true, name: true, phone: true, city: true } },
      retailer: { select: { id: true, name: true } },
      retailerInvoice: { select: { id: true, invoiceNumber: true } },
      statusHistory: {
        orderBy: { changedAt: 'asc' },
        include: { changedByUser: { select: { name: true, orgId: true } } },
      },
    },
  });
  if (!job) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  return job;
}

function toBoardJob(job: Awaited<ReturnType<typeof loadOwnedJob>>): LabBoardJob {
  const detail: LabJobDetail = {
    id: job.id,
    referenceNumber: job.referenceNumber,
    patientName: job.patientName,
    patientPhone: job.patientPhone,
    status: job.status,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    notifyWhatsapp: job.notifyWhatsapp,
    specialInstructions: job.specialInstructions,
    notes: job.notes,
    activity: labActivity(
      job.statusHistory.map((entry) => ({
        status: entry.status,
        changedAt: entry.changedAt,
        userName: entry.changedByUser?.name ?? null,
        notes: entry.notes,
        byShop: entry.changedByUser?.orgId === job.retailerOrgId,
      })),
    ),
    lab: job.lab,
    invoice: job.retailerInvoice,
    prescription: readPrescription(job.prescription),
    frame: readFrame(job.frameDetails),
    lens: readLens(job.lensDetails),
    history: job.statusHistory.map((entry) => ({
      id: entry.id,
      status: entry.status,
      notes: entry.notes,
      changedAt: entry.changedAt.toISOString(),
      changedByName: entry.changedByUser?.name ?? 'Removed account',
      action: historyAction(
        entry.status,
        entry.changedByUser?.orgId === job.retailerOrgId,
        entry.notes,
      ),
    })),
    shopRequest: null,
  };
  return { ...detail, isUrgent: job.isUrgent, retailerName: job.retailer?.name ?? null };
}

function stageEnteredAt(
  status: JobStatus,
  createdAt: Date,
  history: readonly { status: JobStatus; changedAt: Date; notes?: string | null }[],
): string {
  const match = history.find((entry) => entry.status === status && !isMarkedDoneNote(entry.notes));
  return (match?.changedAt ?? createdAt).toISOString();
}

function rxSummary(value: unknown): string {
  const prescription = readPrescription(value);
  const right = eyeText(prescription.right);
  const left = eyeText(prescription.left);
  return `R ${right} · L ${left}`;
}

function eyeText(eye: { sphere: string; cylinder: string; axis: string }): string {
  return `${eye.sphere || '—'} / ${eye.cylinder || '—'} × ${eye.axis || '—'}`;
}

async function unusedReference(): Promise<string> {
  const prefix = `OW-${labDayMonth()}-`;
  const rows = await prisma.labJob.findMany({
    where: { referenceNumber: { startsWith: prefix } },
    select: { referenceNumber: true },
  });
  try {
    return nextProductTag(new Set(rows.map((row) => row.referenceNumber)));
  } catch {
    throw new AppError(422, 'VALIDATION_ERROR', 'A job reference could not be reserved');
  }
}

function dateRange(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) {
    return undefined;
  }
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lt: new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS) } : {}),
  };
}

function readPrescription(value: unknown): LabJobDetail['prescription'] {
  const record = asRecord(value);
  return {
    right: eye(asRecord(record.right ?? record.rightEye)),
    left: eye(asRecord(record.left ?? record.leftEye)),
    add: text(record.add),
    pd: text(record.pd ?? record.pupillaryDistance),
  };
}

function boardFrame(input: CreateLabBoardJobRequest): LabJobDetail['frame'] | undefined {
  const frame = {
    name: input.frameName?.trim() ?? '',
    type: input.frameType?.trim() ?? '',
    material: input.frameMaterial?.trim() ?? '',
    eyeSize: input.eyeSize?.trim() ?? '',
  };
  if (!frame.name && !frame.type && !frame.material && !frame.eyeSize) {
    return undefined;
  }
  return frame;
}

function boardLens(input: CreateLabBoardJobRequest): LabJobDetail['lens'] | undefined {
  const lens = {
    name: input.lensName?.trim() ?? '',
    type: input.lensType?.trim() ?? '',
  };
  if (!lens.name && !lens.type) {
    return undefined;
  }
  return lens;
}

function readLens(value: unknown): LabJobDetail['lens'] {
  const record = asRecord(value);
  return { name: text(record.name), type: text(record.type) };
}

function readFrame(value: unknown): LabJobDetail['frame'] {
  const record = asRecord(value);
  return {
    name: text(record.name),
    type: text(record.type),
    material: text(record.material),
    eyeSize: text(record.eyeSize),
  };
}

function eye(record: Record<string, unknown>): LabJobDetail['prescription']['right'] {
  return { sphere: text(record.sphere), cylinder: text(record.cylinder), axis: text(record.axis) };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

async function sendRetailerJobWhatsApp(
  auth: AuthSessionUser,
  job: {
    id: string;
    referenceNumber: string;
    lab: { name: string };
    retailer: { whatsappNumber: string | null; phone: string | null } | null;
  },
  statusLabel: string,
  text: string,
): Promise<{ sent: boolean; message: string }> {
  const phone = digitsOnly(job.retailer?.whatsappNumber ?? job.retailer?.phone ?? '');
  if (!phone) {
    await logWhatsapp(auth, job.id, false, 'Retailer has no phone number');
    return { sent: false, message: 'The shop has no phone number for WhatsApp.' };
  }
  const token = process.env.WHATSAPP_API_TOKEN ?? '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  if (!token || !phoneNumberId) {
    await logWhatsapp(auth, job.id, false, 'WhatsApp is not configured');
    return { sent: false, message: 'WhatsApp is not configured yet.' };
  }
  const label = statusLabel.replace(/\s+/g, ' ').trim().slice(0, 200);
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
                { type: 'text', text: label },
              ],
            },
          ],
        },
      }),
    });
    if (!response.ok) {
      await logWhatsapp(auth, job.id, false, `WhatsApp returned ${response.status}`);
      return { sent: false, message: 'WhatsApp could not send the message to the shop.' };
    }
    await logWhatsapp(auth, job.id, true, text.slice(0, 1024));
    return { sent: true, message: 'The shop was told on WhatsApp.' };
  } catch (error) {
    logger.error('WhatsApp lab job notice failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    await logWhatsapp(auth, job.id, false, 'WhatsApp request failed');
    return { sent: false, message: 'WhatsApp could not send the message to the shop.' };
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
      metadata: { detail: detail.slice(0, 500) },
    },
  });
}

async function resolveJobClient(
  labOrgId: string,
  labClientId: string | undefined,
  retailerOrgId: string | undefined,
): Promise<{ labClientId: string | null; retailerOrgId: string | null }> {
  const clientId = labClientId && labClientId.length > 0 ? labClientId : null;
  const retailerId = retailerOrgId && retailerOrgId.length > 0 ? retailerOrgId : null;
  if (clientId) {
    const client = await prisma.labClient.findFirst({
      where: { id: clientId, labOrgId, status: 'APPROVED' },
      select: { id: true, linkedOrgId: true },
    });
    if (!client) {
      throw new AppError(422, 'VALIDATION_ERROR', 'That client is not on this laboratory list');
    }
    return { labClientId: client.id, retailerOrgId: client.linkedOrgId };
  }
  if (retailerId) {
    const client = await prisma.labClient.findFirst({
      where: { labOrgId, linkedOrgId: retailerId, status: 'APPROVED' },
      select: { id: true },
    });
    if (!client) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        'That retailer is not connected to this laboratory',
      );
    }
    return { labClientId: client.id, retailerOrgId: retailerId };
  }
  return { labClientId: null, retailerOrgId: null };
}

function requireLab(auth: AuthSessionUser): string {
  if (auth.orgType !== 'LABORATORY' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This action is available to laboratories');
  }
  return auth.orgId;
}
