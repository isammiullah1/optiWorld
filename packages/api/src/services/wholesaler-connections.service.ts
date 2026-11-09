import { prisma } from '@optiworld/db';
import type {
  AuthSessionUser,
  ConnectionVisibilityRequest,
  QuoteRequest,
  RetailerSearchHit,
  VisibilityMode,
  WholesalerConnectionLists,
  WholesalerRetailerConnection,
} from '@optiworld/shared';
import { z } from 'zod';

import { orgCardSelect, retailerSearchHit } from '../lib/connection-profile.js';
import { AppError } from '../lib/errors.js';

const DECLINED_ARCHIVE_MS = 30 * 24 * 60 * 60 * 1000;

export async function listWholesalerConnections(
  auth: AuthSessionUser,
): Promise<WholesalerConnectionLists> {
  const orgId = requireWholesaler(auth);
  const cutoff = new Date(Date.now() - DECLINED_ARCHIVE_MS);
  const rows = await prisma.retailerConnection.findMany({
    where: { wholesalerOrgId: orgId },
    include: {
      retailer: { select: orgCardSelect },
      orders: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { orders: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const connected: WholesalerRetailerConnection[] = [];
  const pending: WholesalerRetailerConnection[] = [];
  const outgoing: WholesalerRetailerConnection[] = [];
  const declined: WholesalerRetailerConnection[] = [];
  for (const row of rows) {
    const item = toConnection(row);
    if (row.status === 'APPROVED') {
      connected.push(item);
    } else if (row.status === 'PENDING') {
      const fromShop = !row.requestedByOrgId || row.requestedByOrgId === row.retailerOrgId;
      if (fromShop) {
        pending.push(item);
      } else {
        outgoing.push(item);
      }
    } else if (row.updatedAt >= cutoff) {
      declined.push(item);
    }
  }
  return { connected, pending, outgoing, declined };
}

export async function approveWholesalerConnection(
  auth: AuthSessionUser,
  connectionId: string,
  input: ConnectionVisibilityRequest,
): Promise<WholesalerRetailerConnection> {
  const orgId = requireWholesaler(auth);
  const existing = await ownedConnection(orgId, connectionId);
  if (existing.status !== 'PENDING') {
    throw new AppError(409, 'VALIDATION_ERROR', 'Only a pending request can be approved');
  }
  if (existing.requestedByOrgId === orgId) {
    throw new AppError(409, 'VALIDATION_ERROR', 'The shop has to accept this request');
  }
  const approvedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.retailerConnection.update({
      where: { id: connectionId },
      data: { status: 'APPROVED', visibilityMode: input.visibilityMode, approvedAt },
    });
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'CONNECTION_APPROVED',
        entityType: 'RetailerConnection',
        entityId: connectionId,
        metadata: { visibilityMode: input.visibilityMode },
      },
    });
  });
  return loadConnection(orgId, connectionId);
}

export async function declineWholesalerConnection(
  auth: AuthSessionUser,
  connectionId: string,
): Promise<WholesalerRetailerConnection> {
  const orgId = requireWholesaler(auth);
  const existing = await ownedConnection(orgId, connectionId);
  if (existing.status === 'REJECTED') {
    throw new AppError(409, 'VALIDATION_ERROR', 'This connection is already declined');
  }
  await prisma.$transaction(async (tx) => {
    await tx.retailerConnection.update({
      where: { id: connectionId },
      data: { status: 'REJECTED', approvedAt: null },
    });
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: existing.status === 'APPROVED' ? 'CONNECTION_REVOKED' : 'CONNECTION_DECLINED',
        entityType: 'RetailerConnection',
        entityId: connectionId,
        metadata: { visibilityMode: existing.visibilityMode },
      },
    });
  });
  return loadConnection(orgId, connectionId);
}

export async function cancelWholesalerRequest(
  auth: AuthSessionUser,
  connectionId: string,
): Promise<WholesalerRetailerConnection> {
  const orgId = requireWholesaler(auth);
  const existing = await ownedConnection(orgId, connectionId);
  if (existing.status !== 'PENDING' || existing.requestedByOrgId !== orgId) {
    throw new AppError(409, 'VALIDATION_ERROR', 'Only a request you sent can be cancelled');
  }
  await prisma.$transaction(async (tx) => {
    await tx.retailerConnection.update({
      where: { id: connectionId },
      data: { status: 'REJECTED', approvedAt: null },
    });
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'CONNECTION_CANCELLED',
        entityType: 'RetailerConnection',
        entityId: connectionId,
        metadata: { visibilityMode: existing.visibilityMode },
      },
    });
  });
  return loadConnection(orgId, connectionId);
}

export async function updateConnectionVisibility(
  auth: AuthSessionUser,
  connectionId: string,
  input: ConnectionVisibilityRequest,
): Promise<WholesalerRetailerConnection> {
  const orgId = requireWholesaler(auth);
  const existing = await ownedConnection(orgId, connectionId);
  if (existing.status !== 'APPROVED') {
    throw new AppError(
      409,
      'VALIDATION_ERROR',
      'Approve the connection before changing visibility',
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.retailerConnection.update({
      where: { id: connectionId },
      data: { visibilityMode: input.visibilityMode },
    });
    await tx.auditLog.create({
      data: {
        orgId,
        userId: auth.userId,
        action: 'VISIBILITY_UPDATED',
        entityType: 'RetailerConnection',
        entityId: connectionId,
        metadata: { visibilityMode: input.visibilityMode },
      },
    });
  });
  return loadConnection(orgId, connectionId);
}

export async function listQuoteRequests(auth: AuthSessionUser): Promise<QuoteRequest[]> {
  const orgId = requireWholesaler(auth);
  const rows = await prisma.orderItem.findMany({
    where: {
      agreedPrice: null,
      catalogProduct: { isPriceOnRequest: true, orgId },
      order: { wholesalerOrgId: orgId, status: { in: ['PENDING', 'CONFIRMED'] } },
    },
    include: {
      order: { select: { id: true, retailer: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((row) => ({
    id: row.id,
    orderId: row.order.id,
    retailerName: row.order.retailer.name,
    productName: row.productName,
    quantity: row.quantity,
    requestedAt: row.createdAt.toISOString(),
  }));
}

async function ownedConnection(
  orgId: string,
  connectionId: string,
): Promise<{ status: string; visibilityMode: VisibilityMode; requestedByOrgId: string | null }> {
  const row = await prisma.retailerConnection.findFirst({
    where: { id: connectionId, wholesalerOrgId: orgId },
    select: { status: true, visibilityMode: true, requestedByOrgId: true },
  });
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Connection not found');
  }
  return row;
}

async function loadConnection(
  orgId: string,
  connectionId: string,
): Promise<WholesalerRetailerConnection> {
  const row = await prisma.retailerConnection.findFirst({
    where: { id: connectionId, wholesalerOrgId: orgId },
    include: {
      retailer: { select: orgCardSelect },
      orders: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      _count: { select: { orders: true } },
    },
  });
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Connection not found');
  }
  return toConnection(row);
}

function toConnection(row: {
  id: string;
  retailerOrgId: string;
  status: WholesalerRetailerConnection['status'];
  visibilityMode: VisibilityMode;
  createdAt: Date;
  approvedAt: Date | null;
  updatedAt: Date;
  retailer: {
    name: string;
    username: string | null;
    phone: string | null;
    city: string | null;
    address: string | null;
    listingProfileNotes: string | null;
  };
  orders: { createdAt: Date }[];
  _count: { orders: number };
}): WholesalerRetailerConnection {
  const lastOrder = row.orders[0];
  return {
    id: row.id,
    retailerOrgId: row.retailerOrgId,
    retailerName: row.retailer.name,
    username: row.retailer.username,
    phone: row.retailer.phone,
    city: row.retailer.city,
    address: row.retailer.address,
    about: row.retailer.listingProfileNotes,
    status: row.status,
    visibilityMode: row.visibilityMode,
    requestedAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
    orderCount: row._count.orders,
    lastOrderAt: lastOrder ? lastOrder.createdAt.toISOString() : null,
  };
}

export async function searchWholesalerRetailers(
  auth: AuthSessionUser,
  query: string,
): Promise<RetailerSearchHit[]> {
  const orgId = requireWholesaler(auth);
  const term = query.trim();
  const retailer = await prisma.organisation.findFirst({
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
  if (!retailer) {
    return [];
  }
  const connection = await prisma.retailerConnection.findUnique({
    where: {
      wholesalerOrgId_retailerOrgId: { wholesalerOrgId: orgId, retailerOrgId: retailer.id },
    },
    select: { status: true, approvedAt: true, updatedAt: true },
  });
  return [
    retailerSearchHit(
      retailer,
      connection
        ? { status: connection.status, connectedAt: connection.approvedAt ?? connection.updatedAt }
        : null,
    ),
  ];
}

export async function requestWholesalerRetailer(
  auth: AuthSessionUser,
  retailerOrgId: string,
): Promise<RetailerSearchHit> {
  const orgId = requireWholesaler(auth);
  const retailer = await prisma.organisation.findFirst({
    where: { id: retailerOrgId, type: 'RETAILER', status: 'ACTIVE', deletedAt: null },
    select: orgCardSelect,
  });
  if (!retailer) {
    throw new AppError(404, 'NOT_FOUND', 'That shop could not be found');
  }
  const existing = await prisma.retailerConnection.findUnique({
    where: {
      wholesalerOrgId_retailerOrgId: { wholesalerOrgId: orgId, retailerOrgId: retailer.id },
    },
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
    await prisma.retailerConnection.update({
      where: { id: existing.id },
      data: { status: 'PENDING', approvedAt: null, requestedByOrgId: orgId },
    });
  } else {
    await prisma.retailerConnection.create({
      data: {
        wholesalerOrgId: orgId,
        retailerOrgId: retailer.id,
        status: 'PENDING',
        visibilityMode: 'FULL',
        requestedByOrgId: orgId,
      },
    });
  }
  return retailerSearchHit(retailer, { status: 'PENDING', connectedAt: null });
}

function requireWholesaler(auth: AuthSessionUser): string {
  if (auth.orgType !== 'WHOLESALER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'A wholesaler account is required');
  }
  return auth.orgId;
}
