import { prisma } from '@optiworld/db';
import {
  canRedirectLabJob,
  isMarkedDoneNote,
  isProcessingStatus,
  labDayMonth,
  labJobNeedsLabDecision,
  MARKED_DONE_NOTE,
  nextProductTag,
  PROCESSING_JOB_STATUSES,
  type AuthSessionUser,
  type ConnectionStatus,
  type CreateDirectLabJobRequest,
  type CreateLabJobRequest,
  type LabConnection,
  type LabJobDetail,
  type LabJobListQuery,
  type LabJobRow,
  type LabPrescription,
  type JobStatus,
  type LabSearchHit,
} from '@optiworld/shared';
import type { OrgCard } from '../lib/connection-profile.js';
import { z } from 'zod';

import { openShopRequest, requestReceivedCancellation } from './lab-job-requests.service.js';

import { billLogoPath } from '../lib/bill-logo-store.js';
import { orgCardSelect, retailerSearchHit } from '../lib/connection-profile.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { refreshDeliveryForInvoice } from './deliveries.service.js';
import { historyAction, labActivity } from './record-activity.js';

const DAY_MS = 86_400_000;

const labCardSelect = { ...orgCardSelect, billLogoKey: true } as const;

function toLabConnection(
  lab: OrgCard & { billLogoKey?: string | null },
  status: ConnectionStatus,
  incoming: boolean,
  connectedAt: Date | null,
  activeJobs = 0,
  averageTurnaroundDays: number | null = null,
): LabConnection {
  return {
    id: lab.id,
    name: lab.name,
    logoUrl: billLogoPath(lab.billLogoKey ?? null),
    username: lab.username,
    city: lab.city,
    phone: lab.phone,
    address: lab.address,
    about: lab.listingProfileNotes,
    connectedAt: status === 'APPROVED' && connectedAt ? connectedAt.toISOString() : null,
    status,
    incoming,
    activeJobs,
    averageTurnaroundDays,
  };
}

export async function listLabConnections(auth: AuthSessionUser): Promise<LabConnection[]> {
  const retailerOrgId = requireRetailer(auth);
  const links = await prisma.labClient.findMany({
    where: {
      linkedOrgId: retailerOrgId,
      lab: { type: 'LABORATORY', status: 'ACTIVE', deletedAt: null },
    },
    include: { lab: { select: labCardSelect } },
    orderBy: { createdAt: 'desc' },
  });
  const [counts, turnaround] = await Promise.all([
    activeJobCounts(retailerOrgId),
    averageTurnaround(retailerOrgId),
  ]);
  const rank: Record<ConnectionStatus, number> = { APPROVED: 0, PENDING: 1, REJECTED: 2 };
  return links
    .slice()
    .sort((left, right) => rank[left.status] - rank[right.status])
    .map((link) =>
      toLabConnection(
        link.lab,
        link.status,
        Boolean(link.requestedByOrgId && link.requestedByOrgId !== retailerOrgId),
        link.status === 'APPROVED' ? link.updatedAt : null,
        counts.get(link.lab.id) ?? 0,
        turnaround.get(link.lab.id) ?? null,
      ),
    );
}

export async function searchLabs(auth: AuthSessionUser, query: string): Promise<LabSearchHit[]> {
  const retailerOrgId = requireRetailer(auth);
  const term = query.trim();
  const lab = await prisma.organisation.findFirst({
    where: {
      type: 'LABORATORY',
      status: 'ACTIVE',
      deletedAt: null,
      ...(z.string().uuid().safeParse(term).success
        ? { id: term }
        : { username: { equals: term.toLowerCase(), mode: 'insensitive' } }),
    },
    select: orgCardSelect,
  });
  if (!lab) {
    return [];
  }
  const link = await prisma.labClient.findFirst({
    where: { linkedOrgId: retailerOrgId, labOrgId: lab.id },
    select: { status: true, updatedAt: true },
  });
  return [
    retailerSearchHit(lab, link ? { status: link.status, connectedAt: link.updatedAt } : null),
  ];
}

export async function connectLab(auth: AuthSessionUser, labOrgId: string): Promise<LabConnection> {
  const retailerOrgId = requireRetailer(auth);
  const [lab, retailer] = await Promise.all([
    prisma.organisation.findFirst({
      where: { id: labOrgId, type: 'LABORATORY', status: 'ACTIVE', deletedAt: null },
      select: labCardSelect,
    }),
    prisma.organisation.findFirst({
      where: { id: retailerOrgId },
      select: { name: true, phone: true },
    }),
  ]);
  if (!lab || !retailer) {
    throw new AppError(404, 'NOT_FOUND', 'That laboratory could not be found');
  }
  const existing = await prisma.labClient.findFirst({
    where: { labOrgId, linkedOrgId: retailerOrgId },
    select: { id: true, status: true },
  });
  if (existing?.status === 'APPROVED') {
    throw new AppError(422, 'VALIDATION_ERROR', 'This laboratory is already connected');
  }
  if (existing?.status === 'PENDING') {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'A request to this laboratory is already waiting for them to accept it',
    );
  }
  if (existing) {
    await prisma.labClient.update({
      where: { id: existing.id },
      data: {
        status: 'PENDING',
        name: retailer.name,
        phone: retailer.phone,
        requestedByOrgId: retailerOrgId,
      },
    });
  } else {
    await prisma.labClient.create({
      data: {
        labOrgId,
        linkedOrgId: retailerOrgId,
        name: retailer.name,
        phone: retailer.phone,
        status: 'PENDING',
        requestedByOrgId: retailerOrgId,
      },
    });
  }
  return toLabConnection(lab, 'PENDING', false, null);
}

export async function disconnectLab(
  auth: AuthSessionUser,
  labOrgId: string,
): Promise<LabConnection> {
  const retailerOrgId = requireRetailer(auth);
  const link = await prisma.labClient.findFirst({
    where: { labOrgId, linkedOrgId: retailerOrgId, status: 'APPROVED' },
    include: { lab: { select: { ...labCardSelect, type: true, deletedAt: true } } },
  });
  if (!link || link.lab.type !== 'LABORATORY' || link.lab.deletedAt) {
    throw new AppError(404, 'NOT_FOUND', 'That laboratory connection was not found');
  }
  await prisma.$transaction(async (tx) => {
    await tx.labClient.update({ where: { id: link.id }, data: { status: 'REJECTED' } });
    await tx.auditLog.create({
      data: {
        orgId: retailerOrgId,
        userId: auth.userId,
        action: 'LAB_CONNECTION_REVOKED',
        entityType: 'LabClient',
        entityId: link.id,
        metadata: { labOrgId },
      },
    });
  });
  return toLabConnection(link.lab, 'REJECTED', false, null);
}

export async function respondToLabConnection(
  auth: AuthSessionUser,
  labOrgId: string,
  accept: boolean,
): Promise<LabConnection> {
  const retailerOrgId = requireRetailer(auth);
  const link = await prisma.labClient.findFirst({
    where: { labOrgId, linkedOrgId: retailerOrgId },
    include: { lab: { select: { ...labCardSelect, type: true, deletedAt: true } } },
  });
  if (!link || link.lab.type !== 'LABORATORY' || link.lab.deletedAt) {
    throw new AppError(404, 'NOT_FOUND', 'That laboratory connection was not found');
  }
  if (
    link.status !== 'PENDING' ||
    !link.requestedByOrgId ||
    link.requestedByOrgId === retailerOrgId
  ) {
    throw new AppError(409, 'VALIDATION_ERROR', 'This request is waiting for the laboratory');
  }
  const status = accept ? 'APPROVED' : 'REJECTED';
  await prisma.$transaction(async (tx) => {
    await tx.labClient.update({ where: { id: link.id }, data: { status } });
    await tx.alert.updateMany({
      where: {
        orgId: retailerOrgId,
        type: 'CONNECTION_REQUEST',
        relatedEntityId: labOrgId,
        isRead: false,
      },
      data: { isRead: true },
    });
    await tx.auditLog.create({
      data: {
        orgId: retailerOrgId,
        userId: auth.userId,
        action: accept ? 'LAB_CONNECTION_APPROVED' : 'LAB_CONNECTION_DECLINED',
        entityType: 'LabClient',
        entityId: link.id,
        metadata: { labOrgId },
      },
    });
  });
  return toLabConnection(link.lab, status, true, accept ? new Date() : null);
}

export async function cancelLabConnection(
  auth: AuthSessionUser,
  labOrgId: string,
): Promise<LabConnection> {
  const retailerOrgId = requireRetailer(auth);
  const link = await prisma.labClient.findFirst({
    where: { labOrgId, linkedOrgId: retailerOrgId },
    include: { lab: { select: { ...labCardSelect, type: true, deletedAt: true } } },
  });
  if (!link || link.lab.type !== 'LABORATORY' || link.lab.deletedAt) {
    throw new AppError(404, 'NOT_FOUND', 'That laboratory connection was not found');
  }
  const sentByShop = !link.requestedByOrgId || link.requestedByOrgId === retailerOrgId;
  if (link.status !== 'PENDING' || !sentByShop) {
    throw new AppError(409, 'VALIDATION_ERROR', 'Only a request you sent can be cancelled');
  }
  await prisma.$transaction(async (tx) => {
    await tx.labClient.update({ where: { id: link.id }, data: { status: 'REJECTED' } });
    await tx.auditLog.create({
      data: {
        orgId: retailerOrgId,
        userId: auth.userId,
        action: 'LAB_CONNECTION_CANCELLED',
        entityType: 'LabClient',
        entityId: link.id,
        metadata: { labOrgId },
      },
    });
  });
  return toLabConnection(link.lab, 'REJECTED', false, null);
}

export async function createLabJob(
  auth: AuthSessionUser,
  input: CreateLabJobRequest,
): Promise<{ id: string }> {
  const retailerOrgId = requireRetailer(auth);
  const linked = await prisma.labClient.findFirst({
    where: { labOrgId: input.labOrgId, linkedOrgId: retailerOrgId, status: 'APPROVED' },
    select: { id: true },
  });
  if (!linked) {
    throw new AppError(
      403,
      'CONNECTION_REQUIRED',
      'That laboratory has not accepted this connection',
    );
  }
  const existing = await prisma.labJob.findUnique({
    where: { referenceNumber: input.referenceNumber },
    select: { id: true, retailerOrgId: true, labOrgId: true },
  });
  if (existing) {
    if (existing.retailerOrgId !== retailerOrgId || existing.labOrgId !== input.labOrgId) {
      throw new AppError(422, 'VALIDATION_ERROR', 'That lab reference is already in use');
    }
    return { id: existing.id };
  }
  const shop = await prisma.organisation.findFirst({
    where: { id: retailerOrgId },
    select: { name: true },
  });
  return prisma.$transaction(async (tx) => {
    const created = await tx.labJob.create({
      data: {
        labOrgId: input.labOrgId,
        retailerOrgId,
        referenceNumber: input.referenceNumber,
        patientName: input.patientName,
        prescription: prescriptionJson(input),
        frameDetails: frameJson(input),
        specialInstructions: blankToNull(input.specialInstructions),
        notes: blankToNull(input.notes),
        status: 'SUBMITTED',
        statusHistory: { create: { status: 'SUBMITTED', changedByUserId: auth.userId } },
      },
      select: { id: true },
    });
    await tx.alert.create({
      data: labJobAssignedAlert({
        labOrgId: input.labOrgId,
        jobId: created.id,
        referenceNumber: input.referenceNumber,
        patientName: input.patientName,
        shopName: shop?.name ?? 'A connected shop',
      }),
    });
    return created;
  });
}

export async function searchRetailerSales(
  auth: AuthSessionUser,
  query: string,
): Promise<Array<{ id: string; invoiceNumber: number; customerName: string; issuedAt: string }>> {
  const retailerOrgId = requireRetailer(auth);
  const q = query.trim();
  const asNumber = /^\d+$/.test(q) ? Number(q) : null;
  const rows = await prisma.invoice.findMany({
    where: {
      orgId: retailerOrgId,
      cancelledAt: null,
      ...(q.length > 0
        ? {
            OR: [
              ...(asNumber === null ? [] : [{ invoiceNumber: asNumber }]),
              { customer: { name: { contains: q, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
    },
    orderBy: { issuedAt: 'desc' },
    take: 8,
    select: { id: true, invoiceNumber: true, issuedAt: true, customer: { select: { name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    customerName: row.customer.name,
    issuedAt: row.issuedAt.toISOString(),
  }));
}

export async function createDirectLabJob(
  auth: AuthSessionUser,
  input: CreateDirectLabJobRequest,
): Promise<{ id: string; referenceNumber: string; message: string }> {
  const retailerOrgId = requireRetailer(auth);
  const linked = await prisma.labClient.findFirst({
    where: { labOrgId: input.labOrgId, linkedOrgId: retailerOrgId, status: 'APPROVED' },
    select: { id: true },
  });
  if (!linked) {
    throw new AppError(
      403,
      'CONNECTION_REQUIRED',
      'That laboratory has not accepted this connection',
    );
  }
  const phone = input.patientPhone?.trim() ?? '';
  let existingSale: { id: string; invoiceNumber: number } | null = null;
  if (input.bill.mode === 'EXISTING') {
    existingSale = await prisma.invoice.findFirst({
      where: { id: input.bill.invoiceId, orgId: retailerOrgId, cancelledAt: null },
      select: { id: true, invoiceNumber: true },
    });
    if (!existingSale) {
      throw new AppError(404, 'NOT_FOUND', 'That sale was not found');
    }
  }
  const shop = await prisma.organisation.findFirst({
    where: { id: retailerOrgId },
    select: { name: true },
  });
  const prescription = { right: input.right, left: input.left, add: input.add, pd: input.pd };
  const frame = {
    name: input.frameName?.trim() ?? '',
    type: input.frameType?.trim() ?? '',
    material: input.frameMaterial?.trim() ?? '',
    eyeSize: input.eyeSize?.trim() ?? '',
  };
  const frameDetails = Object.values(frame).some((part) => part.length > 0) ? frame : undefined;
  return prisma.$transaction(async (tx) => {
    const invoiceId = existingSale?.id ?? null;
    const invoiceNumber = existingSale?.invoiceNumber ?? null;
    let reference = await allocateShopReference(tx);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const taken = await tx.labJob.findFirst({
        where: { referenceNumber: reference },
        select: { id: true },
      });
      if (!taken) {
        break;
      }
      reference = await allocateShopReference(tx);
      if (attempt === 4) {
        throw new AppError(422, 'VALIDATION_ERROR', 'A job reference could not be reserved');
      }
    }
    const created = await tx.labJob.create({
      data: {
        labOrgId: input.labOrgId,
        retailerOrgId,
        retailerInvoiceId: invoiceId,
        referenceNumber: reference,
        patientName: input.patientName,
        patientPhone: phone.length > 0 ? phone : null,
        prescription,
        ...(frameDetails ? { frameDetails } : {}),
        lensDetails: { name: input.lensName, type: input.lensType },
        specialInstructions: blankToNull(input.specialInstructions),
        notes: blankToNull(input.notes),
        status: 'SUBMITTED',
        statusHistory: {
          create: {
            status: 'SUBMITTED',
            notes:
              invoiceNumber === null
                ? 'Opened without a sale.'
                : `Opened on sale #${invoiceNumber}.`,
            changedByUserId: auth.userId,
          },
        },
      },
      select: { id: true },
    });
    const createdId = created.id;
    await tx.alert.create({
      data: labJobAssignedAlert({
        labOrgId: input.labOrgId,
        jobId: createdId,
        referenceNumber: reference,
        patientName: input.patientName,
        shopName: shop?.name ?? 'A connected shop',
      }),
    });
    await tx.auditLog.create({
      data: {
        orgId: retailerOrgId,
        userId: auth.userId,
        action: 'LAB_JOB_CREATED',
        entityType: 'LabJob',
        entityId: createdId,
        metadata:
          invoiceNumber === null
            ? { referenceNumber: reference }
            : { referenceNumber: reference, invoiceNumber },
      },
    });
    await refreshDeliveryForInvoice(tx, invoiceId);
    const message =
      invoiceNumber === null
        ? `Job ${reference} was sent to the laboratory. It is not on a sale.`
        : `Job ${reference} was sent to the laboratory and attached to sale #${invoiceNumber}.`;
    return { id: createdId, referenceNumber: reference, message };
  });
}

type LabJobWriter = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function allocateShopReference(tx: LabJobWriter): Promise<string> {
  const prefix = `OW-${labDayMonth()}-`;
  const rows = await tx.labJob.findMany({
    where: { referenceNumber: { startsWith: prefix } },
    select: { referenceNumber: true },
  });
  try {
    return nextProductTag(new Set(rows.map((row) => row.referenceNumber)));
  } catch {
    throw new AppError(422, 'VALIDATION_ERROR', 'A job reference could not be reserved');
  }
}

export async function listRetailerLabJobs(
  auth: AuthSessionUser,
  filters: LabJobListQuery,
): Promise<{ data: LabJobRow[]; total: number }> {
  const retailerOrgId = requireRetailer(auth);
  const createdAt = dateRange(filters.from, filters.to);
  const q = filters.q.trim();
  const where = {
    retailerOrgId,
    ...boardFilter(filters.board, filters.status),
    ...(filters.labOrgId ? { labOrgId: filters.labOrgId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(q
      ? {
          AND: [
            {
              OR: [
                { referenceNumber: { contains: q, mode: 'insensitive' as const } },
                { patientName: { contains: q, mode: 'insensitive' as const } },
                { lab: { name: { contains: q, mode: 'insensitive' as const } } },
              ],
            },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.labJob.findMany({
      where,
      include: { lab: { select: { name: true, billLogoKey: true } } },
      orderBy: labJobOrder(filters.sort),
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.labJob.count({ where }),
  ]);
  return {
    total,
    data: rows.map((row) => ({
      id: row.id,
      referenceNumber: row.referenceNumber,
      patientName: row.patientName,
      labName: row.lab.name,
      labLogoUrl: billLogoPath(row.lab.billLogoKey),
      status: row.status,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

export async function getRetailerLabJob(
  auth: AuthSessionUser,
  jobId: string,
): Promise<LabJobDetail> {
  const retailerOrgId = requireRetailer(auth);
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, retailerOrgId },
    include: {
      lab: { select: { id: true, name: true, phone: true, city: true } },
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
  const history = await withMarkedDone(retailerOrgId, job);
  return {
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
      history.map((entry) => ({
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
    history: history.map((entry) => ({
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
    shopRequest: labJobNeedsLabDecision(job.status)
      ? await openShopRequest(retailerOrgId, job.id)
      : null,
  };
}

export async function listLabJobHistory(
  auth: AuthSessionUser,
  jobId: string,
): Promise<LabJobDetail['history']> {
  const detail = await getRetailerLabJob(auth, jobId);
  return detail.history;
}

export async function updateLabJobNotify(
  auth: AuthSessionUser,
  jobId: string,
  notifyWhatsapp: boolean,
): Promise<{ notifyWhatsapp: boolean }> {
  const retailerOrgId = requireRetailer(auth);
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, retailerOrgId },
    select: { id: true },
  });
  if (!job) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  const updated = await prisma.labJob.update({
    where: { id: job.id },
    data: { notifyWhatsapp },
    select: { notifyWhatsapp: true },
  });
  return updated;
}

async function withMarkedDone(
  retailerOrgId: string,
  job: {
    id: string;
    status: JobStatus;
    completedAt: Date | null;
    retailerOrgId: string | null;
    statusHistory: Array<{
      id: string;
      status: JobStatus;
      notes: string | null;
      changedAt: Date;
      changedByUser: { name: string; orgId: string } | null;
    }>;
  },
): Promise<typeof job.statusHistory> {
  if (!job.completedAt || job.statusHistory.some((entry) => isMarkedDoneNote(entry.notes))) {
    return job.statusHistory;
  }
  const completion = await prisma.auditLog.findFirst({
    where: {
      orgId: retailerOrgId,
      entityType: 'LabJob',
      entityId: job.id,
      action: 'LAB_JOB_COMPLETED',
    },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true, orgId: true } } },
  });
  if (!completion) {
    return job.statusHistory;
  }
  return [
    ...job.statusHistory,
    {
      id: completion.id,
      status: job.status,
      notes: MARKED_DONE_NOTE,
      changedAt: completion.createdAt,
      changedByUser: completion.user,
    },
  ].sort((left, right) => left.changedAt.getTime() - right.changedAt.getTime());
}

export async function setLabJobCompletion(
  auth: AuthSessionUser,
  jobId: string,
  done: boolean,
): Promise<{ id: string; completedAt: string | null }> {
  const retailerOrgId = requireRetailer(auth);
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, retailerOrgId },
    select: {
      id: true,
      status: true,
      referenceNumber: true,
      completedAt: true,
      retailerInvoiceId: true,
    },
  });
  if (!job) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  const completedAt = done ? (job.completedAt ?? new Date()) : null;
  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.labJob.update({
      where: { id: job.id },
      data: { completedAt },
      select: { id: true, completedAt: true },
    });
    if (done && !job.completedAt) {
      await tx.labJobStatusHistory.create({
        data: {
          labJobId: job.id,
          status: job.status,
          notes: MARKED_DONE_NOTE,
          changedByUserId: auth.userId,
        },
      });
    }
    if (!done) {
      await tx.labJobStatusHistory.deleteMany({
        where: { labJobId: job.id, notes: MARKED_DONE_NOTE },
      });
    }
    await tx.auditLog.create({
      data: {
        orgId: retailerOrgId,
        userId: auth.userId,
        action: done ? 'LAB_JOB_COMPLETED' : 'LAB_JOB_REOPENED',
        entityType: 'LabJob',
        entityId: job.id,
        metadata: { referenceNumber: job.referenceNumber },
      },
    });
    await refreshDeliveryForInvoice(tx, job.retailerInvoiceId);
    return saved;
  });
  return { id: updated.id, completedAt: updated.completedAt?.toISOString() ?? null };
}

export async function reopenDispatchedLabJob(
  auth: AuthSessionUser,
  jobId: string,
  reason: string,
): Promise<{ id: string; message: string }> {
  if (!auth.orgId || (auth.orgType !== 'RETAILER' && auth.orgType !== 'LABORATORY')) {
    throw new AppError(403, 'FORBIDDEN', 'A shop or laboratory account is required');
  }
  const orgId = auth.orgId;
  const savedReason = reason.trim();
  if (!savedReason) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Write why this job is being reopened.');
  }
  const job = await prisma.labJob.findFirst({
    where: {
      id: jobId,
      ...(auth.orgType === 'RETAILER' ? { retailerOrgId: auth.orgId } : { labOrgId: auth.orgId }),
    },
    select: {
      id: true,
      status: true,
      referenceNumber: true,
      labOrgId: true,
      retailerOrgId: true,
      retailerInvoiceId: true,
    },
  });
  if (!job) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  if (job.status !== 'DISPATCHED') {
    throw new AppError(409, 'ORDER_LOCKED', 'Only a dispatched job can be reopened');
  }
  const note = `Reopened. ${savedReason}`;
  const otherOrgId = auth.orgType === 'RETAILER' ? job.labOrgId : job.retailerOrgId;
  await prisma.$transaction(async (tx) => {
    await tx.labJob.update({
      where: { id: job.id },
      data: { status: 'CUTTING', completedAt: null },
    });
    await tx.labJobStatusHistory.create({
      data: { labJobId: job.id, status: 'CUTTING', notes: note, changedByUserId: auth.userId },
    });
    if (otherOrgId) {
      await tx.alert.create({
        data: {
          orgId: otherOrgId,
          type: 'LAB_JOB_STATUS',
          title: 'Lab job reopened',
          body: `${job.referenceNumber} was reopened. ${savedReason}`,
          relatedEntityId: job.id,
          relatedEntityType: 'LabJob',
        },
      });
    }
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'LAB_JOB_REOPENED',
        entityType: 'LabJob',
        entityId: job.id,
        metadata: { referenceNumber: job.referenceNumber, reason: savedReason },
      },
    });
    await refreshDeliveryForInvoice(tx, job.retailerInvoiceId);
  });
  return { id: job.id, message: 'The job is back in processing. The note is on its history.' };
}

export async function cancelRetailerLabJob(
  auth: AuthSessionUser,
  jobId: string,
  reason: string,
): Promise<{ id: string; sent: boolean; message: string }> {
  const retailerOrgId = requireRetailer(auth);
  const savedReason = reason.trim();
  if (!savedReason) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Write a reason for cancelling this job.');
  }
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, retailerOrgId },
    select: {
      id: true,
      status: true,
      referenceNumber: true,
      patientName: true,
      patientPhone: true,
      labOrgId: true,
      retailerInvoiceId: true,
      lab: { select: { name: true } },
      retailerInvoice: {
        select: { customer: { select: { phone: true, whatsappNumber: true } } },
      },
    },
  });
  if (!job) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  if (job.status === 'CANCELLED' || job.status === 'OUTSOURCED') {
    throw new AppError(409, 'ORDER_LOCKED', 'This job is already closed.');
  }
  if (job.status === 'DISPATCHED') {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'The laboratory has finished this job, so it cannot be cancelled.',
    );
  }
  if (labJobNeedsLabDecision(job.status)) {
    return requestReceivedCancellation(auth, job.id, savedReason);
  }
  await prisma.$transaction(async (tx) => {
    await tx.labJob.update({ where: { id: job.id }, data: { status: 'CANCELLED' } });
    await tx.labJobStatusHistory.create({
      data: {
        labJobId: job.id,
        status: 'CANCELLED',
        notes: savedReason,
        changedByUserId: auth.userId,
      },
    });
    await tx.alert.create({
      data: {
        orgId: job.labOrgId,
        type: 'LAB_JOB_STATUS',
        title: 'Lab job cancelled',
        body: `${job.referenceNumber} was cancelled by the shop. ${savedReason}`,
        relatedEntityId: job.id,
        relatedEntityType: 'LabJob',
      },
    });
    await tx.auditLog.create({
      data: {
        orgId: retailerOrgId,
        userId: auth.userId,
        action: 'LAB_JOB_CANCELLED',
        entityType: 'LabJob',
        entityId: job.id,
        metadata: { referenceNumber: job.referenceNumber, reason: savedReason },
      },
    });
    await refreshDeliveryForInvoice(tx, job.retailerInvoiceId);
  });
  return {
    id: job.id,
    sent: false,
    message: 'The job was cancelled. The laboratory can see the reason.',
  };
}

export async function redirectRetailerLabJob(
  auth: AuthSessionUser,
  jobId: string,
  labOrgId: string,
): Promise<{ id: string; message: string }> {
  const retailerOrgId = requireRetailer(auth);
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, retailerOrgId },
    select: {
      id: true,
      status: true,
      completedAt: true,
      labOrgId: true,
      retailerInvoiceId: true,
      referenceNumber: true,
      patientName: true,
      lab: { select: { name: true } },
    },
  });
  if (!job) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  if (!canRedirectLabJob(job.status) || (job.completedAt && job.status !== 'OUTSOURCED')) {
    throw new AppError(409, 'ORDER_LOCKED', 'A job marked done stays with its laboratory.');
  }
  if (job.labOrgId === labOrgId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Choose a different laboratory.');
  }
  const link = await prisma.labClient.findFirst({
    where: { labOrgId, linkedOrgId: retailerOrgId, status: 'APPROVED' },
    select: { id: true, lab: { select: { name: true } } },
  });
  if (!link) {
    throw new AppError(
      403,
      'CONNECTION_REQUIRED',
      'That laboratory has not accepted this connection',
    );
  }
  const shop = await prisma.organisation.findFirst({
    where: { id: retailerOrgId },
    select: { name: true },
  });
  await prisma.$transaction(async (tx) => {
    await tx.labJob.update({
      where: { id: job.id },
      data: { labOrgId, labClientId: link.id, status: 'SUBMITTED', completedAt: null },
    });
    await tx.labJobStatusHistory.create({
      data: {
        labJobId: job.id,
        status: 'SUBMITTED',
        notes: `Redirected from ${job.lab.name} to ${link.lab.name}.`,
        changedByUserId: auth.userId,
      },
    });
    await tx.alert.create({
      data: {
        orgId: job.labOrgId,
        type: 'LAB_JOB_STATUS',
        title: 'Lab job moved',
        body: `${job.referenceNumber} was sent to another laboratory.`,
        relatedEntityId: job.id,
        relatedEntityType: 'LabJob',
      },
    });
    await tx.alert.create({
      data: labJobAssignedAlert({
        labOrgId,
        jobId: job.id,
        referenceNumber: job.referenceNumber,
        patientName: job.patientName,
        shopName: shop?.name ?? 'A connected shop',
      }),
    });
    await refreshDeliveryForInvoice(tx, job.retailerInvoiceId);
  });
  return { id: job.id, message: `The job was sent to ${link.lab.name}.` };
}

export async function outsourceRetailerLabJob(
  auth: AuthSessionUser,
  jobId: string,
): Promise<{ id: string; message: string }> {
  const retailerOrgId = requireRetailer(auth);
  const job = await prisma.labJob.findFirst({
    where: { id: jobId, retailerOrgId },
    select: {
      id: true,
      status: true,
      labOrgId: true,
      referenceNumber: true,
      retailerInvoiceId: true,
    },
  });
  if (!job) {
    throw new AppError(404, 'NOT_FOUND', 'Lab job not found');
  }
  if (!canRedirectLabJob(job.status)) {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'Outsource is available before the material is marked received.',
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.labJob.update({
      where: { id: job.id },
      data: { status: 'OUTSOURCED', completedAt: null },
    });
    await tx.labJobStatusHistory.create({
      data: {
        labJobId: job.id,
        status: 'OUTSOURCED',
        notes: 'The shop will finish this sale outside the laboratory.',
        changedByUserId: auth.userId,
      },
    });
    await tx.alert.create({
      data: {
        orgId: job.labOrgId,
        type: 'LAB_JOB_STATUS',
        title: 'Lab job outsourced',
        body: `${job.referenceNumber} will be finished outside this laboratory.`,
        relatedEntityId: job.id,
        relatedEntityType: 'LabJob',
      },
    });
    await refreshDeliveryForInvoice(tx, job.retailerInvoiceId);
  });
  return { id: job.id, message: 'This sale will be finished outside the laboratory.' };
}

export function prescriptionJson(input: LabPrescription): {
  right: LabPrescription['right'];
  left: LabPrescription['left'];
  add: string;
  pd: string;
} {
  return { right: input.right, left: input.left, add: input.add, pd: input.pd };
}

export function frameJson(
  input: LabPrescription,
): { type: string; material: string; eyeSize: string } | undefined {
  const frame = {
    type: input.frameType?.trim() ?? '',
    material: input.frameMaterial?.trim() ?? '',
    eyeSize: input.eyeSize?.trim() ?? '',
  };
  if (!frame.type && !frame.material && !frame.eyeSize) {
    return undefined;
  }
  return frame;
}

async function activeJobCounts(retailerOrgId: string): Promise<Map<string, number>> {
  const rows = await prisma.labJob.groupBy({
    by: ['labOrgId'],
    where: { retailerOrgId, completedAt: null, status: { not: 'DISPATCHED' } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.labOrgId, row._count._all]));
}

async function averageTurnaround(retailerOrgId: string): Promise<Map<string, number>> {
  const rows = await prisma.labJobStatusHistory.findMany({
    where: {
      status: { in: ['READY', 'DISPATCHED'] },
      labJob: { retailerOrgId },
    },
    select: { changedAt: true, labJob: { select: { id: true, labOrgId: true, createdAt: true } } },
    orderBy: { changedAt: 'asc' },
  });
  const totals = new Map<string, { sum: number; count: number }>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.labJob.id)) {
      continue;
    }
    seen.add(row.labJob.id);
    const days = (row.changedAt.getTime() - row.labJob.createdAt.getTime()) / DAY_MS;
    const current = totals.get(row.labJob.labOrgId) ?? { sum: 0, count: 0 };
    current.sum += Math.max(0, days);
    current.count += 1;
    totals.set(row.labJob.labOrgId, current);
  }
  return new Map(
    [...totals].map(([labId, value]) => [labId, Math.round((value.sum / value.count) * 10) / 10]),
  );
}

function labJobOrder(
  sort: LabJobListQuery['sort'],
):
  | { updatedAt: 'desc' }
  | { patientName: 'asc' }
  | { referenceNumber: 'asc' }
  | { createdAt: 'desc' } {
  if (sort === 'PATIENT') {
    return { patientName: 'asc' };
  }
  if (sort === 'REFERENCE') {
    return { referenceNumber: 'asc' };
  }
  if (sort === 'SUBMITTED') {
    return { createdAt: 'desc' };
  }
  return { updatedAt: 'desc' };
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
  const right = asRecord(record.right ?? record.rightEye);
  const left = asRecord(record.left ?? record.leftEye);
  return {
    right: eye(right),
    left: eye(left),
    add: text(record.add),
    pd: text(record.pd ?? record.pupillaryDistance),
  };
}

function readLens(value: unknown): LabJobDetail['lens'] {
  const record = asRecord(value);
  return { name: text(record.name), type: text(record.type) };
}

function readFrame(value: unknown): LabJobDetail['frame'] {
  const record = asRecord(value);
  return {
    type: text(record.type),
    material: text(record.material),
    name: text(record.name),
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

export function labJobAssignedAlert(input: {
  labOrgId: string;
  jobId: string;
  referenceNumber: string;
  patientName: string;
  shopName: string;
}): {
  orgId: string;
  type: 'LAB_JOB_STATUS';
  title: string;
  body: string;
  relatedEntityId: string;
  relatedEntityType: string;
} {
  return {
    orgId: input.labOrgId,
    type: 'LAB_JOB_STATUS',
    title: 'New job assigned',
    body: `${input.referenceNumber} for ${input.patientName} from ${input.shopName}.`,
    relatedEntityId: input.jobId,
    relatedEntityType: 'LabJob',
  };
}

function boardFilter(
  board: LabJobListQuery['board'],
  status: LabJobListQuery['status'],
): {
  completedAt?: null | { not: null };
  status?: LabJobListQuery['status'] | { not: 'CANCELLED' } | { in: readonly string[] };
  OR?: Array<{ completedAt: { not: null } } | { status: 'CANCELLED' }>;
} {
  const matched = status ? statusMatch(status) : undefined;
  if (board === 'OPEN') {
    if (status === 'CANCELLED') {
      return { status: 'CANCELLED', completedAt: { not: null } };
    }
    return { completedAt: null, status: matched ?? { not: 'CANCELLED' } };
  }
  if (board === 'DONE') {
    if (status === 'CANCELLED') {
      return { status: 'CANCELLED' };
    }
    if (matched) {
      return { completedAt: { not: null }, status: matched };
    }
    return { OR: [{ completedAt: { not: null } }, { status: 'CANCELLED' }] };
  }
  return matched ? { status: matched } : {};
}

function statusMatch(
  status: NonNullable<LabJobListQuery['status']>,
): NonNullable<LabJobListQuery['status']> | { in: readonly string[] } {
  if (isProcessingStatus(status)) {
    return { in: PROCESSING_JOB_STATUSES };
  }
  return status;
}

export async function notifyCustomerJobStatus(
  auth: AuthSessionUser,
  entityId: string,
  entityType: 'LabJob' | 'Invoice',
  phone: string,
  shopName: string,
  referenceNumber: string,
  statusLabel: string,
  text: string,
  saved: string,
): Promise<{ sent: boolean; message: string }> {
  const orgId = auth.orgId ?? '';
  if (!phone) {
    await logJobWhatsApp(
      orgId,
      auth.userId,
      entityId,
      entityType,
      false,
      'Customer has no phone number',
    );
    return { sent: false, message: `${saved} This customer has no phone number for WhatsApp.` };
  }
  const token = process.env.WHATSAPP_API_TOKEN ?? '';
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
  if (!token || !phoneNumberId) {
    await logJobWhatsApp(
      orgId,
      auth.userId,
      entityId,
      entityType,
      false,
      'WhatsApp is not configured',
    );
    return { sent: false, message: `${saved} WhatsApp is not configured yet.` };
  }
  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
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
                { type: 'text', text: referenceNumber },
                { type: 'text', text: statusLabel },
              ],
            },
          ],
        },
      }),
    });
    if (!response.ok) {
      await logJobWhatsApp(
        orgId,
        auth.userId,
        entityId,
        entityType,
        false,
        `WhatsApp returned ${response.status}`,
      );
      return { sent: false, message: `${saved} WhatsApp could not send the update.` };
    }
    await logJobWhatsApp(orgId, auth.userId, entityId, entityType, true, text);
    return { sent: true, message: `${saved} The customer was notified on WhatsApp.` };
  } catch (error) {
    logger.error('WhatsApp job status failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
    await logJobWhatsApp(
      orgId,
      auth.userId,
      entityId,
      entityType,
      false,
      'WhatsApp request failed',
    );
    return { sent: false, message: `${saved} WhatsApp could not send the update.` };
  }
}

async function logJobWhatsApp(
  orgId: string,
  userId: string,
  entityId: string,
  entityType: 'LabJob' | 'Invoice',
  sent: boolean,
  detail: string,
): Promise<void> {
  if (!orgId) {
    return;
  }
  await prisma.auditLog.create({
    data: {
      orgId,
      userId,
      action: sent ? 'WHATSAPP_JOB_STATUS_SENT' : 'WHATSAPP_JOB_STATUS_FAILED',
      entityType,
      entityId,
      metadata: { detail: detail.slice(0, 500) },
    },
  });
}

function requireRetailer(auth: AuthSessionUser): string {
  if (auth.orgType !== 'RETAILER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'Only a retailer can use this');
  }
  return auth.orgId;
}
