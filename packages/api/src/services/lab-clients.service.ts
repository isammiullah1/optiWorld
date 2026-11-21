import { prisma } from '@optiworld/db';
import type {
  AuthSessionUser,
  JobStatus,
  LabClientJobs,
  LabClientRow,
  LabRequestLists,
  LabRetailerRequest,
  RetailerSearchHit,
  SaveExternalLabClientRequest,
} from '@optiworld/shared';
import { centsToMoney, moneyToCents } from '@optiworld/shared';
import { z } from 'zod';

import { orgCardSelect, retailerSearchHit, type OrgCard } from '../lib/connection-profile.js';
import { AppError } from '../lib/errors.js';

const HOUR_MS = 3_600_000;

export async function createExternalLabClient(
  auth: AuthSessionUser,
  input: SaveExternalLabClientRequest,
): Promise<LabClientRow> {
  const labOrgId = requireLab(auth);
  await assertClientNameFree(labOrgId, input.name, null);
  const created = await prisma.labClient.create({
    data: {
      labOrgId,
      name: input.name.trim(),
      phone: blankToNull(input.phone),
      city: blankToNull(input.city),
      address: blankToNull(input.address),
      about: blankToNull(input.about),
      status: 'APPROVED',
    },
    include: { linkedOrg: { select: clientOrgSelect } },
  });
  await prisma.auditLog.create({
    data: {
      orgId: labOrgId,
      userId: auth.userId,
      action: 'LAB_CLIENT_CREATED',
      entityType: 'LabClient',
      entityId: created.id,
      metadata: { name: created.name },
    },
  });
  return toClientRow(created, []);
}

export async function updateExternalLabClient(
  auth: AuthSessionUser,
  clientId: string,
  input: SaveExternalLabClientRequest,
): Promise<LabClientRow> {
  const labOrgId = requireLab(auth);
  const existing = await prisma.labClient.findFirst({
    where: { id: clientId, labOrgId, status: 'APPROVED' },
    select: { id: true, linkedOrgId: true },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'That client could not be found');
  }
  if (existing.linkedOrgId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'An OptiWorld shop keeps its own profile.');
  }
  await assertClientNameFree(labOrgId, input.name, existing.id);
  const updated = await prisma.labClient.update({
    where: { id: existing.id },
    data: {
      name: input.name.trim(),
      phone: blankToNull(input.phone),
      city: blankToNull(input.city),
      address: blankToNull(input.address),
      about: blankToNull(input.about),
    },
    include: { linkedOrg: { select: clientOrgSelect } },
  });
  const jobs = await prisma.labJob.findMany({
    where: { labOrgId, labClientId: updated.id },
    select: {
      id: true,
      referenceNumber: true,
      patientName: true,
      status: true,
      labClientId: true,
      retailerOrgId: true,
      createdAt: true,
      labBill: { select: { status: true, total: true } },
    },
  });
  await prisma.auditLog.create({
    data: {
      orgId: labOrgId,
      userId: auth.userId,
      action: 'LAB_CLIENT_UPDATED',
      entityType: 'LabClient',
      entityId: updated.id,
      metadata: { name: updated.name },
    },
  });
  return toClientRow(updated, jobs);
}

const clientOrgSelect = {
  username: true,
  city: true,
  address: true,
  listingProfileNotes: true,
} as const;

export async function listLabClients(auth: AuthSessionUser): Promise<LabClientRow[]> {
  const labOrgId = requireLab(auth);
  const clients = await prisma.labClient.findMany({
    where: { labOrgId, status: 'APPROVED' },
    include: {
      linkedOrg: { select: clientOrgSelect },
    },
    orderBy: { name: 'asc' },
  });
  const jobs = await prisma.labJob.findMany({
    where: { labOrgId },
    select: {
      id: true,
      referenceNumber: true,
      patientName: true,
      status: true,
      labClientId: true,
      retailerOrgId: true,
      createdAt: true,
      labBill: { select: { status: true, total: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return clients.map((client) =>
    toClientRow(
      client,
      jobs.filter((job) => jobMatches(job, client)),
    ),
  );
}

export async function listLabClientJobs(
  auth: AuthSessionUser,
  clientId: string,
): Promise<LabClientJobs> {
  const labOrgId = requireLab(auth);
  const client = await prisma.labClient.findFirst({
    where: { id: clientId, labOrgId, status: 'APPROVED' },
    include: {
      linkedOrg: { select: clientOrgSelect },
    },
  });
  if (!client) {
    throw new AppError(404, 'NOT_FOUND', 'That client could not be found');
  }
  const jobs = await prisma.labJob.findMany({
    where: {
      labOrgId,
      OR: [
        { labClientId: client.id },
        ...(client.linkedOrgId ? [{ retailerOrgId: client.linkedOrgId }] : []),
      ],
    },
    include: {
      statusHistory: { orderBy: { changedAt: 'asc' } },
      labBill: { select: { status: true, total: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const turnarounds = jobs
    .map((job) => turnaroundHours(job.createdAt, job.statusHistory))
    .filter((hours): hours is number => hours !== null);
  const average =
    turnarounds.length === 0
      ? null
      : Math.round((turnarounds.reduce((sum, hours) => sum + hours, 0) / turnarounds.length) * 10) /
        10;
  return {
    client: {
      ...toClientRow(client, jobs),
      averageTurnaroundHours: average,
    },
    jobs: jobs.map((job) => ({
      id: job.id,
      referenceNumber: job.referenceNumber,
      patientName: job.patientName,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      completedAt: completedAt(job.statusHistory),
    })),
  };
}

const DECLINED_ARCHIVE_MS = 30 * 24 * 60 * 60 * 1000;

export async function listLabRequests(auth: AuthSessionUser): Promise<LabRequestLists> {
  const labOrgId = requireLab(auth);
  const cutoff = new Date(Date.now() - DECLINED_ARCHIVE_MS);
  const rows = await prisma.labClient.findMany({
    where: { labOrgId, linkedOrgId: { not: null }, status: { in: ['PENDING', 'REJECTED'] } },
    include: {
      linkedOrg: {
        select: {
          name: true,
          username: true,
          city: true,
          phone: true,
          address: true,
          listingProfileNotes: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
  const pending: LabRetailerRequest[] = [];
  const outgoing: LabRetailerRequest[] = [];
  const declined: LabRetailerRequest[] = [];
  for (const row of rows) {
    const item = toRequest(row);
    if (row.status === 'PENDING') {
      const fromShop = !row.requestedByOrgId || row.requestedByOrgId === row.linkedOrgId;
      if (fromShop) {
        pending.push(item);
      } else {
        outgoing.push(item);
      }
    } else if (row.updatedAt >= cutoff) {
      declined.push(item);
    }
  }
  return { pending, outgoing, declined };
}

export async function approveLabRequest(
  auth: AuthSessionUser,
  requestId: string,
): Promise<LabRetailerRequest> {
  const labOrgId = requireLab(auth);
  const existing = await ownedRequest(labOrgId, requestId);
  if (existing.status !== 'PENDING') {
    throw new AppError(409, 'VALIDATION_ERROR', 'Only a pending request can be accepted');
  }
  if (existing.requestedByOrgId && existing.requestedByOrgId === labOrgId) {
    throw new AppError(409, 'VALIDATION_ERROR', 'The shop has to accept this request');
  }
  await prisma.$transaction(async (tx) => {
    await tx.labClient.update({ where: { id: requestId }, data: { status: 'APPROVED' } });
    await tx.auditLog.create({
      data: {
        orgId: labOrgId,
        userId: auth.userId,
        action: 'LAB_CONNECTION_APPROVED',
        entityType: 'LabClient',
        entityId: requestId,
        metadata: { retailerOrgId: existing.linkedOrgId },
      },
    });
  });
  return loadRequest(labOrgId, requestId);
}

export async function declineLabRequest(
  auth: AuthSessionUser,
  requestId: string,
): Promise<LabRetailerRequest> {
  const labOrgId = requireLab(auth);
  const existing = await ownedRequest(labOrgId, requestId);
  if (existing.status === 'REJECTED') {
    throw new AppError(409, 'VALIDATION_ERROR', 'This connection is already declined');
  }
  if (!existing.linkedOrgId) {
    throw new AppError(422, 'VALIDATION_ERROR', 'A walk-in client cannot be declined');
  }
  await prisma.$transaction(async (tx) => {
    await tx.labClient.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
    await tx.auditLog.create({
      data: {
        orgId: labOrgId,
        userId: auth.userId,
        action:
          existing.status === 'APPROVED' ? 'LAB_CONNECTION_REVOKED' : 'LAB_CONNECTION_DECLINED',
        entityType: 'LabClient',
        entityId: requestId,
        metadata: { retailerOrgId: existing.linkedOrgId },
      },
    });
  });
  return loadRequest(labOrgId, requestId);
}

export async function cancelLabRequest(
  auth: AuthSessionUser,
  requestId: string,
): Promise<LabRetailerRequest> {
  const labOrgId = requireLab(auth);
  const existing = await ownedRequest(labOrgId, requestId);
  if (existing.status !== 'PENDING' || existing.requestedByOrgId !== labOrgId) {
    throw new AppError(409, 'VALIDATION_ERROR', 'Only a request you sent can be cancelled');
  }
  await prisma.$transaction(async (tx) => {
    await tx.labClient.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
    await tx.auditLog.create({
      data: {
        orgId: labOrgId,
        userId: auth.userId,
        action: 'LAB_CONNECTION_CANCELLED',
        entityType: 'LabClient',
        entityId: requestId,
        metadata: { retailerOrgId: existing.linkedOrgId },
      },
    });
  });
  return loadRequest(labOrgId, requestId);
}

async function ownedRequest(
  labOrgId: string,
  requestId: string,
): Promise<{
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  linkedOrgId: string | null;
  requestedByOrgId: string | null;
}> {
  const row = await prisma.labClient.findFirst({
    where: { id: requestId, labOrgId },
    select: { status: true, linkedOrgId: true, requestedByOrgId: true },
  });
  if (!row || !row.linkedOrgId) {
    throw new AppError(404, 'NOT_FOUND', 'That connection request was not found');
  }
  return row;
}

async function loadRequest(labOrgId: string, requestId: string): Promise<LabRetailerRequest> {
  const row = await prisma.labClient.findFirst({
    where: { id: requestId, labOrgId },
    include: {
      linkedOrg: {
        select: {
          name: true,
          username: true,
          city: true,
          phone: true,
          address: true,
          listingProfileNotes: true,
        },
      },
    },
  });
  if (!row?.linkedOrg) {
    throw new AppError(404, 'NOT_FOUND', 'That connection request was not found');
  }
  return toRequest(row);
}

function toRequest(row: {
  id: string;
  linkedOrgId: string | null;
  name: string;
  phone: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: Date;
  linkedOrg: {
    name: string;
    username: string | null;
    city: string | null;
    phone: string | null;
    address: string | null;
    listingProfileNotes: string | null;
  } | null;
}): LabRetailerRequest {
  return {
    id: row.id,
    retailerOrgId: row.linkedOrgId,
    retailerName: row.linkedOrg?.name ?? row.name,
    username: row.linkedOrg?.username ?? null,
    city: row.linkedOrg?.city ?? null,
    phone: row.linkedOrg?.phone ?? row.phone,
    address: row.linkedOrg?.address ?? null,
    about: row.linkedOrg?.listingProfileNotes ?? null,
    status: row.status,
    requestedAt: row.createdAt.toISOString(),
  };
}

const LIVE_JOB_STATUSES = new Set<JobStatus>([
  'SUBMITTED',
  'CONFIRMED',
  'RECEIVED',
  'CUTTING',
  'FITTING',
  'QC',
  'READY',
]);

function toClientRow(
  client: {
    id: string;
    name: string;
    phone: string | null;
    city: string | null;
    address: string | null;
    about: string | null;
    linkedOrgId: string | null;
    updatedAt: Date;
    linkedOrg: {
      username: string | null;
      city: string | null;
      address: string | null;
      listingProfileNotes: string | null;
    } | null;
  },
  jobs: readonly {
    id: string;
    referenceNumber: string;
    patientName: string;
    status: JobStatus;
    createdAt: Date;
    labBill: { status: string; total: { toFixed(digits: number): string } } | null;
  }[],
): LabClientRow {
  const ordered = [...jobs].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
  const live = ordered.filter((job) => LIVE_JOB_STATUSES.has(job.status));
  const outstanding = ordered.reduce((sum, job) => {
    if (job.labBill?.status !== 'ISSUED') {
      return sum;
    }
    return sum + moneyToCents(job.labBill.total.toFixed(2));
  }, 0);
  const last = ordered[0]?.createdAt ?? null;
  return {
    id: client.id,
    name: client.name,
    username: client.linkedOrg?.username ?? null,
    phone: client.phone,
    city: client.linkedOrg?.city ?? client.city,
    address: client.linkedOrg?.address ?? client.address,
    about: client.linkedOrg?.listingProfileNotes ?? client.about,
    connectedAt: client.updatedAt.toISOString(),
    type: client.linkedOrgId ? 'OPTIWORLD' : 'EXTERNAL',
    totalJobs: ordered.length,
    activeJobs: live.length,
    outstanding: centsToMoney(outstanding),
    liveJobs: live.slice(0, 8).map((job) => ({
      id: job.id,
      referenceNumber: job.referenceNumber,
      patientName: job.patientName,
      status: job.status,
    })),
    lastJobAt: last ? last.toISOString() : null,
  };
}

function jobMatches(
  job: { labClientId: string | null; retailerOrgId: string | null },
  client: { id: string; linkedOrgId: string | null },
): boolean {
  if (job.labClientId === client.id) {
    return true;
  }
  return client.linkedOrgId !== null && job.retailerOrgId === client.linkedOrgId;
}

function completedAt(history: readonly { status: JobStatus; changedAt: Date }[]): string | null {
  const done = history.find((entry) => entry.status === 'READY' || entry.status === 'DISPATCHED');
  return done ? done.changedAt.toISOString() : null;
}

function turnaroundHours(
  createdAt: Date,
  history: readonly { status: JobStatus; changedAt: Date }[],
): number | null {
  const done = completedAt(history);
  if (!done) {
    return null;
  }
  return Math.max(0, (Date.parse(done) - createdAt.getTime()) / HOUR_MS);
}

export async function searchLabRetailers(
  auth: AuthSessionUser,
  query: string,
): Promise<RetailerSearchHit[]> {
  const labOrgId = requireLab(auth);
  const retailer = await findRetailer(query);
  if (!retailer) {
    return [];
  }
  const link = await prisma.labClient.findFirst({
    where: { labOrgId, linkedOrgId: retailer.id },
    select: { status: true, updatedAt: true },
  });
  return [
    retailerSearchHit(retailer, link ? { status: link.status, connectedAt: link.updatedAt } : null),
  ];
}

export async function requestLabRetailer(
  auth: AuthSessionUser,
  retailerOrgId: string,
): Promise<RetailerSearchHit> {
  const labOrgId = requireLab(auth);
  const retailer = await prisma.organisation.findFirst({
    where: { id: retailerOrgId, type: 'RETAILER', status: 'ACTIVE', deletedAt: null },
    select: orgCardSelect,
  });
  if (!retailer) {
    throw new AppError(404, 'NOT_FOUND', 'That shop could not be found');
  }
  const existing = await prisma.labClient.findFirst({
    where: { labOrgId, linkedOrgId: retailer.id },
    select: { id: true, status: true },
  });
  if (existing?.status === 'APPROVED') {
    throw new AppError(422, 'VALIDATION_ERROR', 'This shop is already connected');
  }
  if (existing?.status === 'PENDING') {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'A request to this shop is already waiting for them to accept it',
    );
  }
  if (existing) {
    await prisma.labClient.update({
      where: { id: existing.id },
      data: {
        status: 'PENDING',
        name: retailer.name,
        phone: retailer.phone,
        requestedByOrgId: labOrgId,
      },
    });
  } else {
    await prisma.labClient.create({
      data: {
        labOrgId,
        linkedOrgId: retailer.id,
        name: retailer.name,
        phone: retailer.phone,
        status: 'PENDING',
        requestedByOrgId: labOrgId,
      },
    });
  }
  await syncIncomingLabRequestNotices(retailer.id);
  return retailerSearchHit(retailer, { status: 'PENDING', connectedAt: null });
}

export async function syncIncomingLabRequestNotices(retailerOrgId: string): Promise<number> {
  const pending = await prisma.labClient.findMany({
    where: {
      linkedOrgId: retailerOrgId,
      status: 'PENDING',
      requestedByOrgId: { not: retailerOrgId },
    },
    include: { lab: { select: { name: true } } },
  });
  const incoming = pending.filter((row) => row.requestedByOrgId === row.labOrgId);
  if (incoming.length === 0) {
    return 0;
  }
  const existing = await prisma.alert.findMany({
    where: {
      orgId: retailerOrgId,
      type: 'CONNECTION_REQUEST',
      relatedEntityType: 'Organisation',
      relatedEntityId: { in: incoming.map((row) => row.labOrgId) },
      isRead: false,
    },
    select: { relatedEntityId: true },
  });
  const known = new Set(existing.map((row) => row.relatedEntityId));
  const missing = incoming.filter((row) => !known.has(row.labOrgId));
  if (missing.length > 0) {
    await prisma.alert.createMany({
      data: missing.map((row) => ({
        orgId: retailerOrgId,
        type: 'CONNECTION_REQUEST' as const,
        title: 'Laboratory connection request',
        body: `${row.lab.name} wants to connect. Accept the request to send jobs to this laboratory.`,
        relatedEntityId: row.labOrgId,
        relatedEntityType: 'Organisation',
      })),
    });
  }
  return incoming.length;
}

function findRetailer(query: string): Promise<OrgCard | null> {
  const term = query.trim();
  return prisma.organisation.findFirst({
    where: {
      type: 'RETAILER',
      status: 'ACTIVE',
      deletedAt: null,
      ...(z.string().uuid().safeParse(term).success
        ? { id: term }
        : { username: { equals: term.toLowerCase(), mode: 'insensitive' } }),
    },
    select: orgCardSelect,
  });
}

async function assertClientNameFree(
  labOrgId: string,
  name: string,
  exceptId: string | null,
): Promise<void> {
  const clash = await prisma.labClient.findFirst({
    where: {
      labOrgId,
      status: 'APPROVED',
      ...(exceptId ? { id: { not: exceptId } } : {}),
      name: { equals: name.trim(), mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (clash) {
    throw new AppError(422, 'VALIDATION_ERROR', 'A client with this name is already on the list.');
  }
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function requireLab(auth: AuthSessionUser): string {
  if (auth.orgType !== 'LABORATORY' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This action is available to laboratories');
  }
  return auth.orgId;
}
