import { prisma } from '@optiworld/db';
import type { AuthSessionUser, RetailerShellSummary } from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { syncIncomingLabRequestNotices } from './lab-clients.service.js';

const ACTIVE_JOB_STATUSES = [
  'SUBMITTED',
  'CONFIRMED',
  'REJECTED',
  'RECEIVED',
  'CUTTING',
  'FITTING',
  'QC',
  'READY',
] as const;

export async function getRetailerShell(auth: AuthSessionUser): Promise<RetailerShellSummary> {
  const orgId = auth.orgId;
  if (!orgId || auth.orgType !== 'RETAILER') {
    throw new AppError(403, 'FORBIDDEN', 'This area is not available for your organisation');
  }

  const org = await prisma.organisation.findFirst({
    where: { id: orgId, type: 'RETAILER' },
    select: { name: true },
  });
  if (!org) {
    throw new AppError(404, 'NOT_FOUND', 'Organisation was not found');
  }

  const pendingLabRequestCount = await syncIncomingLabRequestNotices(orgId);
  const [unreadAlertCount, activeJobCount] = await Promise.all([
    prisma.alert.count({ where: { orgId, isRead: false } }),
    prisma.labJob.count({
      where: { retailerOrgId: orgId, completedAt: null, status: { in: [...ACTIVE_JOB_STATUSES] } },
    }),
  ]);

  return { orgName: org.name, unreadAlertCount, activeJobCount, pendingLabRequestCount };
}
