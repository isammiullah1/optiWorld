import { prisma } from '@optiworld/db';
import { z } from 'zod';
import {
  centsToMoney,
  moneyToCents,
  type AuthSessionUser,
  type CatalogProduct,
  type CreateRetailerOrderRequest,
  type UpdateRetailerOrderItemsRequest,
  type OrderStatus,
  type RetailerOrderDetail,
  type RetailerOrderRow,
  type WholesalerCatalog,
  type WholesalerConnection,
  type WholesalerSearchHit,
} from '@optiworld/shared';

import { billLogoPath } from '../lib/bill-logo-store.js';
import { orgCardSelect, retailerSearchHit, type OrgCard } from '../lib/connection-profile.js';
import { AppError } from '../lib/errors.js';
import { orderActivity, orderLine, speakShopAction } from './record-activity.js';
import { loadAmendments } from './order-chat.service.js';
import { requireOrderParty } from './order-access.js';

const wholesalerCardSelect = { ...orgCardSelect, billLogoKey: true } as const;

function toWholesalerConnection(
  row: {
    id: string;
    status: WholesalerConnection['status'];
    visibilityMode: WholesalerConnection['visibilityMode'];
    approvedAt: Date | null;
    updatedAt: Date;
    requestedByOrgId: string | null;
  },
  wholesaler: OrgCard & { billLogoKey?: string | null },
  retailerOrgId: string,
): WholesalerConnection {
  return {
    id: row.id,
    status: row.status,
    visibilityMode: row.visibilityMode,
    wholesalerOrgId: wholesaler.id,
    wholesalerName: wholesaler.name,
    logoUrl: billLogoPath(wholesaler.billLogoKey ?? null),
    username: wholesaler.username,
    phone: wholesaler.phone,
    city: wholesaler.city,
    address: wholesaler.address,
    about: wholesaler.listingProfileNotes,
    connectedAt: row.status === 'APPROVED' ? (row.approvedAt ?? row.updatedAt).toISOString() : null,
    incoming: Boolean(row.requestedByOrgId && row.requestedByOrgId !== retailerOrgId),
  };
}

const MESSAGE_LIMIT = 50;

export async function listWholesalerConnections(
  auth: AuthSessionUser,
): Promise<WholesalerConnection[]> {
  const retailerOrgId = requireRetailer(auth);
  const rows = await prisma.retailerConnection.findMany({
    where: { retailerOrgId },
    include: { wholesaler: { select: wholesalerCardSelect } },
    orderBy: { createdAt: 'desc' },
  });
  const rank = { APPROVED: 0, PENDING: 1, REJECTED: 2 } as const;
  return rows
    .slice()
    .sort((left, right) => rank[left.status] - rank[right.status])
    .map((row) => toWholesalerConnection(row, row.wholesaler, retailerOrgId));
}

export async function searchWholesalers(
  auth: AuthSessionUser,
  query: string,
): Promise<WholesalerSearchHit[]> {
  const retailerOrgId = requireRetailer(auth);
  const term = query.trim();
  const wholesaler = await prisma.organisation.findFirst({
    where: {
      type: 'WHOLESALER',
      status: 'ACTIVE',
      deletedAt: null,
      ...(z.string().uuid().safeParse(term).success
        ? { id: term }
        : { username: { equals: term.toLowerCase(), mode: 'insensitive' } }),
    },
    select: orgCardSelect,
  });
  if (!wholesaler) {
    return [];
  }
  const connection = await prisma.retailerConnection.findUnique({
    where: { wholesalerOrgId_retailerOrgId: { wholesalerOrgId: wholesaler.id, retailerOrgId } },
    select: { status: true, approvedAt: true, updatedAt: true },
  });
  return [
    retailerSearchHit(
      wholesaler,
      connection
        ? { status: connection.status, connectedAt: connection.approvedAt ?? connection.updatedAt }
        : null,
    ),
  ];
}

export async function requestWholesalerConnection(
  auth: AuthSessionUser,
  wholesalerOrgId: string,
): Promise<WholesalerConnection> {
  const retailerOrgId = requireRetailer(auth);
  const wholesaler = await prisma.organisation.findFirst({
    where: { id: wholesalerOrgId, type: 'WHOLESALER', status: 'ACTIVE', deletedAt: null },
    select: wholesalerCardSelect,
  });
  if (!wholesaler) {
    throw new AppError(404, 'NOT_FOUND', 'That wholesaler could not be found');
  }

  const existing = await prisma.retailerConnection.findUnique({
    where: { wholesalerOrgId_retailerOrgId: { wholesalerOrgId, retailerOrgId } },
  });
  if (existing?.status === 'APPROVED') {
    throw new AppError(422, 'VALIDATION_ERROR', 'This wholesaler is already connected');
  }
  if (existing?.status === 'PENDING') {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'A request to this wholesaler is already waiting for them to accept it',
    );
  }

  const saved = existing
    ? await prisma.retailerConnection.update({
        where: { id: existing.id },
        data: { status: 'PENDING', approvedAt: null, requestedByOrgId: retailerOrgId },
      })
    : await prisma.retailerConnection.create({
        data: {
          wholesalerOrgId,
          retailerOrgId,
          status: 'PENDING',
          visibilityMode: 'FULL',
          requestedByOrgId: retailerOrgId,
        },
      });

  return toWholesalerConnection(saved, wholesaler, retailerOrgId);
}

export async function disconnectWholesalerConnection(
  auth: AuthSessionUser,
  connectionId: string,
): Promise<WholesalerConnection> {
  const retailerOrgId = requireRetailer(auth);
  const existing = await prisma.retailerConnection.findFirst({
    where: { id: connectionId, retailerOrgId },
    include: { wholesaler: { select: wholesalerCardSelect } },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'That connection was not found');
  }
  if (existing.status !== 'APPROVED') {
    throw new AppError(409, 'VALIDATION_ERROR', 'Only an accepted connection can be disconnected');
  }
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.retailerConnection.update({
      where: { id: existing.id },
      data: { status: 'REJECTED', approvedAt: null },
    });
    await tx.auditLog.create({
      data: {
        orgId: retailerOrgId,
        userId: auth.userId,
        action: 'CONNECTION_REVOKED',
        entityType: 'RetailerConnection',
        entityId: existing.id,
        metadata: { wholesalerOrgId: existing.wholesalerOrgId },
      },
    });
    return updated;
  });
  return toWholesalerConnection(saved, existing.wholesaler, retailerOrgId);
}

export async function respondToWholesalerConnection(
  auth: AuthSessionUser,
  connectionId: string,
  accept: boolean,
): Promise<WholesalerConnection> {
  const retailerOrgId = requireRetailer(auth);
  const existing = await prisma.retailerConnection.findFirst({
    where: { id: connectionId, retailerOrgId },
    include: { wholesaler: { select: wholesalerCardSelect } },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'That connection was not found');
  }
  if (
    existing.status !== 'PENDING' ||
    !existing.requestedByOrgId ||
    existing.requestedByOrgId === retailerOrgId
  ) {
    throw new AppError(409, 'VALIDATION_ERROR', 'This request is waiting for the wholesaler');
  }
  const status = accept ? 'APPROVED' : 'REJECTED';
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.retailerConnection.update({
      where: { id: existing.id },
      data: { status, approvedAt: accept ? new Date() : null },
    });
    await tx.auditLog.create({
      data: {
        orgId: retailerOrgId,
        userId: auth.userId,
        action: accept ? 'CONNECTION_APPROVED' : 'CONNECTION_DECLINED',
        entityType: 'RetailerConnection',
        entityId: existing.id,
        metadata: { wholesalerOrgId: existing.wholesalerOrgId },
      },
    });
    return updated;
  });
  return toWholesalerConnection(saved, existing.wholesaler, retailerOrgId);
}

export async function cancelWholesalerConnection(
  auth: AuthSessionUser,
  connectionId: string,
): Promise<WholesalerConnection> {
  const retailerOrgId = requireRetailer(auth);
  const existing = await prisma.retailerConnection.findFirst({
    where: { id: connectionId, retailerOrgId },
    include: { wholesaler: { select: wholesalerCardSelect } },
  });
  if (!existing) {
    throw new AppError(404, 'NOT_FOUND', 'That connection was not found');
  }
  const sentByShop = !existing.requestedByOrgId || existing.requestedByOrgId === retailerOrgId;
  if (existing.status !== 'PENDING' || !sentByShop) {
    throw new AppError(409, 'VALIDATION_ERROR', 'Only a request you sent can be cancelled');
  }
  const saved = await prisma.$transaction(async (tx) => {
    const updated = await tx.retailerConnection.update({
      where: { id: existing.id },
      data: { status: 'REJECTED', approvedAt: null },
    });
    await tx.auditLog.create({
      data: {
        orgId: retailerOrgId,
        userId: auth.userId,
        action: 'CONNECTION_CANCELLED',
        entityType: 'RetailerConnection',
        entityId: existing.id,
        metadata: { wholesalerOrgId: existing.wholesalerOrgId },
      },
    });
    return updated;
  });
  return toWholesalerConnection(saved, existing.wholesaler, retailerOrgId);
}

export async function getWholesalerCatalog(
  auth: AuthSessionUser,
  wholesalerOrgId: string,
): Promise<WholesalerCatalog> {
  const retailerOrgId = requireRetailer(auth);
  const connection = await prisma.retailerConnection.findFirst({
    where: { retailerOrgId, wholesalerOrgId, status: 'APPROVED' },
    include: {
      wholesaler: {
        select: {
          id: true,
          name: true,
          phone: true,
          city: true,
          whatsappNumber: true,
          listingProfileNotes: true,
          type: true,
        },
      },
    },
  });
  if (!connection || connection.wholesaler.type !== 'WHOLESALER') {
    throw new AppError(
      403,
      'CONNECTION_REQUIRED',
      'This wholesaler has not approved your connection',
    );
  }
  if (connection.visibilityMode === 'CATALOG_HIDDEN') {
    throw new AppError(403, 'CATALOG_HIDDEN', 'This wholesaler has hidden their catalog');
  }

  const pricesVisible = connection.visibilityMode === 'FULL';
  const products = await prisma.catalogProduct.findMany({
    where: { orgId: connection.wholesalerOrgId, deletedAt: null },
    orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
  });

  return {
    wholesaler: {
      id: connection.wholesaler.id,
      name: connection.wholesaler.name,
      phone: connection.wholesaler.phone,
      city: connection.wholesaler.city,
      whatsappNumber: connection.wholesaler.whatsappNumber,
      listingProfileNotes: connection.wholesaler.listingProfileNotes,
    },
    visibilityMode: pricesVisible ? 'FULL' : 'PRICES_HIDDEN',
    pricesVisible,
    products: products.map((product) => toCatalogProduct(product, pricesVisible)),
  };
}

export async function createRetailerOrder(
  auth: AuthSessionUser,
  input: CreateRetailerOrderRequest,
): Promise<{ id: string }> {
  const retailerOrgId = requireRetailer(auth);
  const connection = await prisma.retailerConnection.findFirst({
    where: { retailerOrgId, wholesalerOrgId: input.wholesalerOrgId, status: 'APPROVED' },
    include: { retailer: { select: { name: true } }, wholesaler: { select: { type: true } } },
  });
  if (!connection || connection.wholesaler.type !== 'WHOLESALER') {
    throw new AppError(
      403,
      'CONNECTION_REQUIRED',
      'This wholesaler has not approved your connection',
    );
  }
  if (connection.visibilityMode === 'CATALOG_HIDDEN') {
    throw new AppError(403, 'CATALOG_HIDDEN', 'This wholesaler has hidden their catalog');
  }

  const products = await prisma.catalogProduct.findMany({
    where: {
      orgId: connection.wholesalerOrgId,
      deletedAt: null,
      id: { in: input.items.map((item) => item.catalogProductId) },
    },
  });
  if (products.length !== input.items.length) {
    throw new AppError(422, 'VALIDATION_ERROR', 'A product is not in this catalog');
  }
  const productById = new Map(products.map((product) => [product.id, product]));
  const pricesVisible = connection.visibilityMode === 'FULL';
  const lines = input.items.map((item) => {
    const product = productById.get(item.catalogProductId);
    if (!product) {
      throw new AppError(422, 'VALIDATION_ERROR', 'A product is not in this catalog');
    }
    const agreedPrice =
      pricesVisible && product.listedPrice && !product.isPriceOnRequest
        ? product.listedPrice.toFixed(2)
        : null;
    return {
      catalogProductId: product.id,
      productName: product.name,
      quantity: item.quantity,
      agreedPrice,
    };
  });
  const totalValue =
    pricesVisible && lines.every((line) => line.agreedPrice)
      ? centsToMoney(
          lines.reduce(
            (sum, line) => sum + moneyToCents(line.agreedPrice ?? '0.00') * line.quantity,
            0,
          ),
        )
      : null;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        wholesalerOrgId: connection.wholesalerOrgId,
        retailerOrgId,
        connectionId: connection.id,
        status: 'PENDING',
        totalValue,
        notes: input.notes && input.notes.length > 0 ? input.notes : null,
        items: { create: lines },
      },
    });
    const thread = await tx.chatThread.create({ data: { orderId: created.id } });
    await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderOrgId: retailerOrgId,
        senderUserId: auth.userId,
        content: `New order from ${connection.retailer.name}.`,
        messageType: 'SYSTEM',
      },
    });
    await tx.alert.create({
      data: {
        orgId: connection.wholesalerOrgId,
        type: 'ORDER_PLACED',
        title: 'New order',
        body: `${connection.retailer.name} placed an order.`,
        relatedEntityId: created.id,
        relatedEntityType: 'Order',
      },
    });
    return created;
  });

  return { id: order.id };
}

export async function replacePendingOrderItems(
  auth: AuthSessionUser,
  orderId: string,
  input: UpdateRetailerOrderItemsRequest,
): Promise<{ id: string }> {
  const retailerOrgId = requireRetailer(auth);
  const order = await prisma.order.findFirst({
    where: { id: orderId, retailerOrgId },
    include: { items: true, connection: true },
  });
  if (!order) {
    throw new AppError(404, 'NOT_FOUND', 'Order not found');
  }
  if (order.status !== 'PENDING' || order.lockedAt) {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'A pending order can be edited until the wholesaler confirms it',
    );
  }
  if (
    order.connection.status !== 'APPROVED' ||
    order.connection.visibilityMode === 'CATALOG_HIDDEN'
  ) {
    throw new AppError(403, 'CONNECTION_REQUIRED', 'This wholesaler catalog is not available');
  }
  const products = await prisma.catalogProduct.findMany({
    where: {
      orgId: order.wholesalerOrgId,
      deletedAt: null,
      id: { in: input.items.map((item) => item.catalogProductId) },
    },
  });
  if (products.length !== input.items.length) {
    throw new AppError(422, 'VALIDATION_ERROR', 'A product is not in this catalog');
  }
  const productById = new Map(products.map((product) => [product.id, product]));
  const existingByProduct = new Map(
    order.items.flatMap((item) =>
      item.catalogProductId ? [[item.catalogProductId, item] as const] : [],
    ),
  );
  const pricesVisible = order.connection.visibilityMode === 'FULL';
  const lines = input.items.map((item) => {
    const product = productById.get(item.catalogProductId);
    if (!product) {
      throw new AppError(422, 'VALIDATION_ERROR', 'A product is not in this catalog');
    }
    const existing = existingByProduct.get(product.id);
    if (!existing && product.availabilityStatus === 'OUT_OF_STOCK') {
      throw new AppError(422, 'VALIDATION_ERROR', `${product.name} is out of stock`);
    }
    const agreedPrice = existing
      ? (existing.agreedPrice?.toFixed(2) ?? null)
      : pricesVisible && product.listedPrice && !product.isPriceOnRequest
        ? product.listedPrice.toFixed(2)
        : null;
    return {
      catalogProductId: product.id,
      productName: existing?.productName ?? product.name,
      quantity: item.quantity,
      agreedPrice,
    };
  });
  const totalValue = lines.every((line) => line.agreedPrice)
    ? centsToMoney(
        lines.reduce(
          (sum, line) => sum + moneyToCents(line.agreedPrice ?? '0.00') * line.quantity,
          0,
        ),
      )
    : null;
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findFirst({
      where: { id: order.id, retailerOrgId },
      select: { status: true, lockedAt: true },
    });
    if (!fresh || fresh.status !== 'PENDING' || fresh.lockedAt) {
      throw new AppError(
        409,
        'ORDER_LOCKED',
        'A pending order can be edited until the wholesaler confirms it',
      );
    }
    await tx.orderItem.deleteMany({ where: { orderId: order.id } });
    await tx.orderItem.createMany({ data: lines.map((line) => ({ ...line, orderId: order.id })) });
    await tx.order.update({ where: { id: order.id }, data: { totalValue } });
    const thread = await tx.chatThread.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id },
      update: {},
    });
    await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderOrgId: retailerOrgId,
        senderUserId: auth.userId,
        content: 'The retailer updated this pending order.',
        messageType: 'SYSTEM',
      },
    });
  });
  return { id: order.id };
}

export async function cancelPendingOrder(
  auth: AuthSessionUser,
  orderId: string,
): Promise<{ id: string }> {
  const retailerOrgId = requireRetailer(auth);
  const order = await prisma.order.findFirst({
    where: { id: orderId, retailerOrgId },
    select: { id: true, status: true, lockedAt: true, wholesalerOrgId: true },
  });
  if (!order) {
    throw new AppError(404, 'NOT_FOUND', 'Order not found');
  }
  if (order.status !== 'PENDING' || order.lockedAt) {
    throw new AppError(
      409,
      'ORDER_LOCKED',
      'A confirmed order cannot be cancelled from the shop alone',
    );
  }
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findFirst({
      where: { id: order.id },
      select: { status: true, lockedAt: true },
    });
    if (!fresh || fresh.status !== 'PENDING' || fresh.lockedAt) {
      throw new AppError(
        409,
        'ORDER_LOCKED',
        'A confirmed order cannot be cancelled from the shop alone',
      );
    }
    await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
    const thread = await tx.chatThread.upsert({
      where: { orderId: order.id },
      create: { orderId: order.id },
      update: {},
    });
    await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderOrgId: retailerOrgId,
        senderUserId: auth.userId,
        content: 'The retailer cancelled this pending order.',
        messageType: 'SYSTEM',
      },
    });
    await tx.alert.create({
      data: {
        orgId: order.wholesalerOrgId,
        type: 'ORDER_PLACED',
        title: 'Order cancelled',
        body: 'A retailer cancelled a pending order.',
        relatedEntityId: order.id,
        relatedEntityType: 'Order',
      },
    });
  });
  return { id: order.id };
}

export async function listRetailerOrders(
  auth: AuthSessionUser,
  status: OrderStatus | undefined,
  page: number,
  limit: number,
): Promise<{ data: RetailerOrderRow[]; total: number }> {
  const retailerOrgId = requireRetailer(auth);
  const where = { retailerOrgId, ...(status ? { status } : {}) };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        wholesaler: { select: { name: true } },
        connection: { select: { visibilityMode: true } },
        items: { select: { productName: true }, orderBy: { createdAt: 'asc' } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);
  return {
    total,
    data: rows.map((row) => ({
      id: row.id,
      reference: orderReference(row.id),
      wholesalerName: row.wholesaler.name,
      itemCount: row._count.items,
      products: row.items.map((item) => item.productName),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      totalValue: row.connection.visibilityMode === 'FULL' ? moneyText(row.totalValue) : null,
    })),
  };
}

export async function getOrderDetail(
  auth: AuthSessionUser,
  orderId: string,
): Promise<RetailerOrderDetail> {
  const order = await requireOrderParty(auth, orderId);
  const [record, messages] = await Promise.all([
    prisma.order.findFirst({
      where: { id: order.id },
      include: {
        wholesaler: { select: { id: true, name: true, phone: true } },
        retailer: { select: { name: true } },
        connection: { select: { visibilityMode: true } },
        items: { orderBy: { createdAt: 'asc' } },
      },
    }),
    prisma.chatMessage.findMany({
      where: { thread: { orderId: order.id } },
      orderBy: { createdAt: 'asc' },
      take: MESSAGE_LIMIT,
      include: { senderUser: { select: { name: true } } },
    }),
  ]);
  if (!record) {
    throw new AppError(404, 'NOT_FOUND', 'Order not found');
  }
  const amendments = await loadAmendments(
    record.id,
    record.items,
    record.status === 'PENDING' || record.status === 'CONFIRMED',
  );
  const pricesVisible =
    auth.orgType === 'WHOLESALER' || record.connection.visibilityMode === 'FULL';
  return {
    id: record.id,
    reference: orderReference(record.id),
    status: record.status,
    lockedAt: record.lockedAt ? record.lockedAt.toISOString() : null,
    notes: record.notes,
    createdAt: record.createdAt.toISOString(),
    activity: orderActivity(
      messages.map((message) => ({
        content: message.content,
        spoken: speakShopAction(message.content, {
          isViewer: message.senderUserId === auth.userId,
          name: message.senderUser.name,
          shopName: record.retailer.name,
        }),
        createdAt: message.createdAt,
        senderName: message.senderUser.name,
      })),
      record.items.map((item) =>
        orderLine(
          item.productName,
          item.quantity,
          pricesVisible ? moneyText(item.agreedPrice) : null,
        ),
      ),
    ),
    wholesaler: record.wholesaler,
    pricesVisible,
    totalValue: pricesVisible ? moneyText(record.totalValue) : null,
    openAmendment: amendments.openLines,
    items: record.items.map((item) => ({
      id: item.id,
      catalogProductId: item.catalogProductId,
      productName: item.productName,
      quantity: item.quantity,
      agreedPrice: pricesVisible ? moneyText(item.agreedPrice) : null,
    })),
    messages: messages.map((message) => {
      const amendment = amendments.byMessageId.get(message.id);
      return {
        id: message.id,
        senderName: message.senderUser.name,
        senderOrgId: message.senderOrgId,
        content: speakShopAction(message.content, {
          isViewer: message.senderUserId === auth.userId,
          name: message.senderUser.name,
          shopName: record.retailer.name,
        }),
        messageType: message.messageType,
        createdAt: message.createdAt.toISOString(),
        amendment: amendment ? { status: amendment.status, lines: amendment.lines } : null,
      };
    }),
  };
}

function toCatalogProduct(
  product: {
    id: string;
    name: string;
    category: string;
    description: string | null;
    productCode: string;
    listedPrice: { toFixed: (digits: number) => string } | null;
    isPriceOnRequest: boolean;
    availabilityStatus: 'AVAILABLE' | 'OUT_OF_STOCK';
  },
  pricesVisible: boolean,
): CatalogProduct {
  const hidePrice = !pricesVisible || product.isPriceOnRequest || !product.listedPrice;
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    description: product.description,
    productCode: product.productCode,
    listedPrice: hidePrice ? null : (product.listedPrice?.toFixed(2) ?? null),
    isPriceOnRequest: product.isPriceOnRequest || !pricesVisible,
    availabilityStatus: product.availabilityStatus,
  };
}

function moneyText(value: { toFixed: (digits: number) => string } | null): string | null {
  return value ? value.toFixed(2) : null;
}

function orderReference(id: string): string {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function requireRetailer(auth: AuthSessionUser): string {
  if (auth.orgType !== 'RETAILER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'Only a retailer can use this');
  }
  return auth.orgId;
}
