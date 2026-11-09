import ExcelJS from 'exceljs';
import { prisma } from '@optiworld/db';
import type {
  AuthSessionUser,
  JobStatus,
  LabJobActivity,
  LabJobHistory,
  LabTurnaround,
} from '@optiworld/shared';
import {
  isMarkedDoneNote,
  isProcessingStatus,
  JOB_STATUS_LABEL,
  JOB_STATUSES,
  PROCESSING_JOB_STATUSES,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { styleSheet } from '../lib/sheet-table.js';
import { pdfWhen, renderTablePdf } from '../lib/text-pdf.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MAX_DAYS = 366;

type HistoryRow = { status: JobStatus; changedAt: Date };

export async function getLabJobActivity(
  auth: AuthSessionUser,
  from: string,
  to: string,
): Promise<LabJobActivity> {
  const labOrgId = requireLab(auth);
  const range = parseRange(from, to);
  const [received, history] = await Promise.all([
    prisma.labJob.findMany({
      where: { labOrgId, createdAt: { gte: range.start, lt: range.end } },
      select: { createdAt: true },
    }),
    prisma.labJobStatusHistory.findMany({
      where: {
        status: { in: ['READY', 'DISPATCHED'] },
        changedAt: { gte: range.start, lt: range.end },
        labJob: { labOrgId },
      },
      select: { labJobId: true, status: true, changedAt: true },
      orderBy: { changedAt: 'asc' },
    }),
  ]);
  const days = dayKeys(range).map((date) => ({ date, received: 0, completed: 0 }));
  const index = new Map(days.map((day, position) => [day.date, position]));
  for (const job of received) {
    const slot = index.get(dayKey(job.createdAt));
    if (slot !== undefined) {
      const day = days[slot];
      if (day) {
        day.received += 1;
      }
    }
  }
  const seen = new Set<string>();
  for (const entry of history) {
    if (seen.has(entry.labJobId)) {
      continue;
    }
    seen.add(entry.labJobId);
    const slot = index.get(dayKey(entry.changedAt));
    if (slot !== undefined) {
      const day = days[slot];
      if (day) {
        day.completed += 1;
      }
    }
  }
  return { from, to, days };
}

export async function getLabTurnaround(
  auth: AuthSessionUser,
  from: string,
  to: string,
): Promise<LabTurnaround> {
  const labOrgId = requireLab(auth);
  const range = parseRange(from, to);
  const jobs = await prisma.labJob.findMany({
    where: { labOrgId, createdAt: { gte: range.start, lt: range.end } },
    include: {
      retailer: { select: { name: true } },
      labClient: { select: { name: true } },
      statusHistory: { orderBy: { changedAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const stageTotals = new Map<JobStatus, { sum: number; count: number }>();
  const rows = jobs.map((job) => {
    collectStageHours(job.statusHistory, stageTotals);
    const finished = firstDone(job.statusHistory);
    const end = finished?.getTime() ?? Date.now();
    const hours = Math.round(((end - job.createdAt.getTime()) / HOUR_MS) * 10) / 10;
    return {
      id: job.id,
      referenceNumber: job.referenceNumber,
      patientName: job.patientName,
      clientName: job.retailer?.name ?? job.labClient?.name ?? null,
      status: job.status,
      hours,
      slow: false,
    };
  });
  const average =
    rows.length === 0 ? 0 : rows.reduce((sum, row) => sum + row.hours, 0) / rows.length;
  return {
    from,
    to,
    stages: JOB_STATUSES.filter((status) => status !== 'FITTING' && status !== 'QC').map(
      (status) => {
        const total = isProcessingStatus(status)
          ? PROCESSING_JOB_STATUSES.reduce(
              (sum, step) => {
                const part = stageTotals.get(step);
                return { sum: sum.sum + (part?.sum ?? 0), count: sum.count + (part?.count ?? 0) };
              },
              { sum: 0, count: 0 },
            )
          : stageTotals.get(status);
        return {
          status,
          averageHours:
            total && total.count > 0 ? Math.round((total.sum / total.count) * 10) / 10 : null,
        };
      },
    ),
    jobs: rows.map((row) => ({ ...row, slow: rows.length > 1 && row.hours > average })),
  };
}

export async function getLabJobHistory(
  auth: AuthSessionUser,
  filters: { q?: string; status?: JobStatus; from?: string; to?: string },
): Promise<LabJobHistory> {
  const labOrgId = requireLab(auth);
  const jobs = await loadHistory(labOrgId, filters);
  return { jobs };
}

export async function exportLabJobHistory(
  auth: AuthSessionUser,
  filters: { q?: string; status?: JobStatus; from?: string; to?: string },
  format: 'xlsx' | 'pdf' = 'xlsx',
): Promise<{ filename: string; body: Buffer }> {
  if (format === 'pdf') {
    const history = await getLabJobHistory(auth, filters);
    return {
      filename: 'job-history.pdf',
      body: renderTablePdf({
        title: 'OptiWorld job history',
        landscape: true,
        tables: [
          {
            columns: [
              'Reference',
              'Patient',
              'Client',
              'Status',
              'Received',
              'Completed',
              'Urgent',
            ],
            widths: [1.3, 1.4, 1.5, 1, 1.2, 1.2, 0.7],
            empty: 'No jobs match this export.',
            rows: history.jobs.map((job) => [
              job.referenceNumber,
              job.patientName,
              job.clientName ?? '',
              JOB_STATUS_LABEL[job.status],
              pdfWhen(job.createdAt),
              pdfWhen(job.completedAt),
              job.isUrgent ? 'Yes' : 'No',
            ]),
          },
        ],
      }),
    };
  }
  const history = await getLabJobHistory(auth, filters);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Job history');
  sheet.columns = [
    { header: 'Reference', key: 'reference', width: 22 },
    { header: 'Patient', key: 'patient', width: 24 },
    { header: 'Client', key: 'client', width: 28 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Received', key: 'received', width: 22 },
    { header: 'Completed', key: 'completed', width: 22 },
    { header: 'Urgent', key: 'urgent', width: 10 },
  ];
  for (const job of history.jobs) {
    sheet.addRow({
      reference: job.referenceNumber,
      patient: job.patientName,
      client: job.clientName ?? '',
      status: JOB_STATUS_LABEL[job.status],
      received: job.createdAt,
      completed: job.completedAt ?? '',
      urgent: job.isUrgent ? 'Yes' : 'No',
    });
  }
  styleSheet(sheet);
  const body = Buffer.from(await workbook.xlsx.writeBuffer());
  return { filename: 'job-history.xlsx', body };
}

async function loadHistory(
  labOrgId: string,
  filters: { q?: string; status?: JobStatus; from?: string; to?: string },
): Promise<LabJobHistory['jobs']> {
  const q = filters.q?.trim();
  const createdAt = dateFilter(filters.from, filters.to);
  const jobs = await prisma.labJob.findMany({
    where: {
      labOrgId,
      ...(filters.status
        ? {
            status: isProcessingStatus(filters.status)
              ? { in: [...PROCESSING_JOB_STATUSES] }
              : filters.status,
          }
        : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(q
        ? {
            OR: [
              { patientName: { contains: q, mode: 'insensitive' } },
              { referenceNumber: { contains: q, mode: 'insensitive' } },
              { retailer: { name: { contains: q, mode: 'insensitive' } } },
              { labClient: { name: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    include: {
      retailer: { select: { name: true } },
      labClient: { select: { name: true } },
      statusHistory: { orderBy: { changedAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return jobs.map((job) => ({
    id: job.id,
    referenceNumber: job.referenceNumber,
    patientName: job.patientName,
    clientName: job.retailer?.name ?? job.labClient?.name ?? null,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    completedAt: firstDone(job.statusHistory)?.toISOString() ?? null,
    isUrgent: job.isUrgent,
  }));
}

function collectStageHours(
  history: readonly (HistoryRow & { notes?: string | null })[],
  totals: Map<JobStatus, { sum: number; count: number }>,
): void {
  const stages = history.filter((entry) => !isMarkedDoneNote(entry.notes));
  for (let index = 0; index < stages.length - 1; index += 1) {
    const current = stages[index];
    const next = stages[index + 1];
    if (!current || !next) {
      continue;
    }
    const hours = Math.max(0, (next.changedAt.getTime() - current.changedAt.getTime()) / HOUR_MS);
    const bucket = totals.get(current.status) ?? { sum: 0, count: 0 };
    bucket.sum += hours;
    bucket.count += 1;
    totals.set(current.status, bucket);
  }
}

function firstDone(history: readonly HistoryRow[]): Date | null {
  const done = history.find((entry) => entry.status === 'READY' || entry.status === 'DISPATCHED');
  return done?.changedAt ?? null;
}

function parseRange(from: string, to: string): { start: Date; end: Date } {
  if (from > to) {
    throw new AppError(422, 'VALIDATION_ERROR', 'The start date must be on or before the end date');
  }
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS);
  if ((end.getTime() - start.getTime()) / DAY_MS > MAX_DAYS) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Choose a range of 366 days or fewer');
  }
  return { start, end };
}

function dateFilter(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) {
    return undefined;
  }
  if (from && to) {
    const range = parseRange(from, to);
    return { gte: range.start, lt: range.end };
  }
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lt: new Date(Date.parse(`${to}T00:00:00.000Z`) + DAY_MS) } : {}),
  };
}

function dayKeys(range: { start: Date; end: Date }): string[] {
  const keys: string[] = [];
  for (let time = range.start.getTime(); time < range.end.getTime(); time += DAY_MS) {
    keys.push(new Date(time).toISOString().slice(0, 10));
  }
  return keys;
}

function dayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function requireLab(auth: AuthSessionUser): string {
  if (auth.orgType !== 'LABORATORY' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'This action is available to laboratories');
  }
  return auth.orgId;
}
