import { prisma } from '@optiworld/db';
import {
  centsToMoney,
  moneyToCents,
  type AuthSessionUser,
  type CreateWholesalerOrderRequest,
  type ReceiveRetailerCreditRequest,
  type WholesalerLedger,
} from '@optiworld/shared';

import { AppError } from '../lib/errors.js';

export async function createWholesalerOrder(
  auth: AuthSessionUser,
  input: CreateWholesalerOrderRequest,
): Promise<{ id: string }> {
  const wholesalerOrgId = requireWholesaler(auth);
  const connection = await prisma.retailerConnection.findFirst({
    where: {
      wholesalerOrgId,
      retailerOrgId: input.retailerOrgId,
      status: 'APPROVED',
    },
    include: {
      retailer: { select: { name: true } },
      wholesaler: { select: { name: true } },
    },
  });
  if (!connection) {
    throw new AppError(403, 'CONNECTION_REQUIRED', 'Choose a retailer with an approved connection');
  }

  const products = await prisma.catalogProduct.findMany({
    where: {
      orgId: wholesalerOrgId,
      deletedAt: null,
      id: { in: input.items.map((item) => item.catalogProductId) },
    },
  });
  if (products.length !== input.items.length) {
    throw new AppError(422, 'VALIDATION_ERROR', 'A product is not in your catalog');
  }
  const productById = new Map(products.map((product) => [product.id, product]));
  const lines = input.items.map((item) => {
    const product = productById.get(item.catalogProductId);
    if (!product) {
      throw new AppError(422, 'VALIDATION_ERROR', 'A product is not in your catalog');
    }
    if (product.isPriceOnRequest || !product.listedPrice) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        `${product.name} needs a listed price before it can go on an order`,
      );
    }
    return {
      catalogProductId: product.id,
      productName: product.name,
      quantity: item.quantity,
      agreedPrice: product.listedPrice.toFixed(2),
    };
  });
  const totalCents = lines.reduce(
    (sum, line) => sum + moneyToCents(line.agreedPrice) * line.quantity,
    0,
  );
  const totalValue = centsToMoney(totalCents);
  const received = input.settlement === 'CASH' ? totalValue : '0.00';

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        wholesalerOrgId,
        retailerOrgId: connection.retailerOrgId,
        connectionId: connection.id,
        status: 'PENDING',
        totalValue,
        settlement: input.settlement,
        amountReceived: received,
        notes: input.notes && input.notes.length > 0 ? input.notes : null,
        items: { create: lines },
      },
    });
    if (input.settlement === 'CASH') {
      await tx.orderReceipt.create({
        data: {
          orderId: created.id,
          wholesalerOrgId,
          retailerOrgId: connection.retailerOrgId,
          amount: totalValue,
          notes: 'Cash taken when the order was opened',
          recordedByUserId: auth.userId,
        },
      });
    }
    const thread = await tx.chatThread.create({ data: { orderId: created.id } });
    await tx.chatMessage.create({
      data: {
        threadId: thread.id,
        senderOrgId: wholesalerOrgId,
        senderUserId: auth.userId,
        content: `${connection.wholesaler.name} opened this order for ${connection.retailer.name}. Settlement is ${input.settlement === 'CASH' ? 'cash' : 'credit'}.`,
        messageType: 'SYSTEM',
      },
    });
    await tx.alert.create({
      data: {
        orgId: connection.retailerOrgId,
        type: 'ORDER_PLACED',
        title: 'New order',
        body: `${connection.wholesaler.name} opened an order for your shop.`,
        relatedEntityId: created.id,
        relatedEntityType: 'Order',
      },
    });
    return created;
  });

  return { id: order.id };
}

export async function getWholesalerLedger(auth: AuthSessionUser): Promise<WholesalerLedger> {
  const wholesalerOrgId = requireWholesaler(auth);
  const [connections, orders] = await Promise.all([
    prisma.retailerConnection.findMany({
      where: { wholesalerOrgId, status: 'APPROVED' },
      include: { retailer: { select: { name: true, city: true, phone: true } } },
      orderBy: { retailer: { name: 'asc' } },
    }),
    prisma.order.findMany({
      where: {
        wholesalerOrgId,
        settlement: { not: null },
        status: { not: 'CANCELLED' },
      },
      select: {
        retailerOrgId: true,
        settlement: true,
        totalValue: true,
        amountReceived: true,
      },
    }),
  ]);

  const byRetailer = new Map<
    string,
    { cashCents: number; creditCents: number; openCreditOrders: number }
  >();
  for (const order of orders) {
    const current = byRetailer.get(order.retailerOrgId) ?? {
      cashCents: 0,
      creditCents: 0,
      openCreditOrders: 0,
    };
    const received = moneyToCents(order.amountReceived.toFixed(2));
    current.cashCents += received;
    if (order.settlement === 'CREDIT' && order.totalValue) {
      const due = moneyToCents(order.totalValue.toFixed(2)) - received;
      if (due > 0) {
        current.creditCents += due;
        current.openCreditOrders += 1;
      }
    }
    byRetailer.set(order.retailerOrgId, current);
  }

  const rows = connections.map((connection) => {
    const totals = byRetailer.get(connection.retailerOrgId) ?? {
      cashCents: 0,
      creditCents: 0,
      openCreditOrders: 0,
    };
    return {
      retailerOrgId: connection.retailerOrgId,
      retailerName: connection.retailer.name,
      city: connection.retailer.city,
      phone: connection.retailer.phone,
      cashReceived: centsToMoney(totals.cashCents),
      creditOutstanding: centsToMoney(totals.creditCents),
      openCreditOrders: totals.openCreditOrders,
    };
  });

  return {
    cashReceived: centsToMoney(rows.reduce((sum, row) => sum + moneyToCents(row.cashReceived), 0)),
    creditOutstanding: centsToMoney(
      rows.reduce((sum, row) => sum + moneyToCents(row.creditOutstanding), 0),
    ),
    retailersWithDues: rows.filter((row) => moneyToCents(row.creditOutstanding) > 0).length,
    rows,
  };
}

export async function receiveRetailerCredit(
  auth: AuthSessionUser,
  input: ReceiveRetailerCreditRequest,
): Promise<WholesalerLedger> {
  const wholesalerOrgId = requireWholesaler(auth);
  const connection = await prisma.retailerConnection.findFirst({
    where: {
      wholesalerOrgId,
      retailerOrgId: input.retailerOrgId,
      status: 'APPROVED',
    },
    select: { id: true },
  });
  if (!connection) {
    throw new AppError(403, 'CONNECTION_REQUIRED', 'This retailer is not connected');
  }

  const paymentCents = moneyToCents(input.amount);
  await prisma.$transaction(async (tx) => {
    const orders = await tx.order.findMany({
      where: {
        wholesalerOrgId,
        retailerOrgId: input.retailerOrgId,
        settlement: 'CREDIT',
        status: { not: 'CANCELLED' },
      },
      orderBy: { createdAt: 'asc' },
    });
    let remaining = paymentCents;
    for (const order of orders) {
      if (!order.totalValue || remaining === 0) {
        continue;
      }
      const due =
        moneyToCents(order.totalValue.toFixed(2)) - moneyToCents(order.amountReceived.toFixed(2));
      if (due <= 0) {
        continue;
      }
      const take = Math.min(due, remaining);
      await tx.order.update({
        where: { id: order.id },
        data: {
          amountReceived: centsToMoney(moneyToCents(order.amountReceived.toFixed(2)) + take),
        },
      });
      await tx.orderReceipt.create({
        data: {
          orderId: order.id,
          wholesalerOrgId,
          retailerOrgId: input.retailerOrgId,
          amount: centsToMoney(take),
          notes: input.notes && input.notes.length > 0 ? input.notes : null,
          recordedByUserId: auth.userId,
        },
      });
      remaining -= take;
    }
    if (remaining > 0) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        'That amount is more than the credit still outstanding',
      );
    }
  });

  return getWholesalerLedger(auth);
}

function requireWholesaler(auth: AuthSessionUser): string {
  if (auth.orgType !== 'WHOLESALER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'A wholesaler account is required');
  }
  return auth.orgId;
}
