import type { Request, Response } from 'express';

import {
  CreateRetailerOrderSchema,
  UpdateRetailerOrderItemsSchema,
  OrderIdParamSchema,
  RequestWholesalerConnectionSchema,
  RetailerOrderListQuerySchema,
  WholesalerSearchQuerySchema,
} from '@optiworld/shared';
import { z } from 'zod';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import {
  cancelWholesalerConnection,
  cancelPendingOrder,
  createRetailerOrder,
  replacePendingOrderItems,
  getOrderDetail,
  getWholesalerCatalog,
  listRetailerOrders,
  disconnectWholesalerConnection,
  listWholesalerConnections,
  requestWholesalerConnection,
  respondToWholesalerConnection,
  searchWholesalers,
} from '../services/catalog-orders.service.js';
import { getWholesalerOrderDetail } from '../services/wholesaler-dashboard.service.js';

const WholesalerIdSchema = z.object({ wholesalerId: z.string().uuid() });
const ConnectionIdSchema = z.object({ connectionId: z.string().uuid() });

export function createCatalogOrdersController() {
  return {
    connections: asyncHandler(async (req: Request, res: Response) => {
      const data = await listWholesalerConnections(requireSession(req));
      res.status(200).json({ success: true, data });
    }),
    searchWholesalers: asyncHandler(async (req: Request, res: Response) => {
      const query = WholesalerSearchQuerySchema.parse(req.query);
      const data = await searchWholesalers(requireSession(req), query.q);
      res.status(200).json({ success: true, data });
    }),
    requestConnection: asyncHandler(async (req: Request, res: Response) => {
      const input = RequestWholesalerConnectionSchema.parse(req.body);
      const data = await requestWholesalerConnection(requireSession(req), input.wholesalerOrgId);
      res.status(201).json({ success: true, data });
    }),
    acceptWholesaler: asyncHandler(async (req: Request, res: Response) => {
      const params = ConnectionIdSchema.parse(req.params);
      const data = await respondToWholesalerConnection(
        requireSession(req),
        params.connectionId,
        true,
      );
      res.status(200).json({ success: true, data });
    }),
    declineWholesaler: asyncHandler(async (req: Request, res: Response) => {
      const params = ConnectionIdSchema.parse(req.params);
      const data = await respondToWholesalerConnection(
        requireSession(req),
        params.connectionId,
        false,
      );
      res.status(200).json({ success: true, data });
    }),
    cancelWholesaler: asyncHandler(async (req: Request, res: Response) => {
      const params = ConnectionIdSchema.parse(req.params);
      const data = await cancelWholesalerConnection(requireSession(req), params.connectionId);
      res.status(200).json({ success: true, data });
    }),
    disconnectWholesaler: asyncHandler(async (req: Request, res: Response) => {
      const params = ConnectionIdSchema.parse(req.params);
      const data = await disconnectWholesalerConnection(requireSession(req), params.connectionId);
      res.status(200).json({ success: true, data });
    }),
    catalog: asyncHandler(async (req: Request, res: Response) => {
      const params = WholesalerIdSchema.parse(req.params);
      const data = await getWholesalerCatalog(requireSession(req), params.wholesalerId);
      res.status(200).json({ success: true, data });
    }),
    createOrder: asyncHandler(async (req: Request, res: Response) => {
      const input = CreateRetailerOrderSchema.parse(req.body);
      const data = await createRetailerOrder(requireSession(req), input);
      res.status(201).json({ success: true, data });
    }),
    updateItems: asyncHandler(async (req: Request, res: Response) => {
      const params = OrderIdParamSchema.parse(req.params);
      const input = UpdateRetailerOrderItemsSchema.parse(req.body);
      const data = await replacePendingOrderItems(requireSession(req), params.orderId, input);
      res.status(200).json({ success: true, data });
    }),
    cancelPending: asyncHandler(async (req: Request, res: Response) => {
      const params = OrderIdParamSchema.parse(req.params);
      const data = await cancelPendingOrder(requireSession(req), params.orderId);
      res.status(200).json({ success: true, data });
    }),
    listOrders: asyncHandler(async (req: Request, res: Response) => {
      const query = RetailerOrderListQuerySchema.parse(req.query);
      const result = await listRetailerOrders(
        requireSession(req),
        query.status,
        query.page,
        query.limit,
      );
      res.status(200).json({
        success: true,
        data: result.data,
        meta: { total: result.total, page: query.page, limit: query.limit },
      });
    }),
    getOrder: asyncHandler(async (req: Request, res: Response) => {
      const params = OrderIdParamSchema.parse(req.params);
      const current = requireSession(req);
      if (current.orgType === 'WHOLESALER') {
        const data = await getWholesalerOrderDetail(current, params.orderId);
        res.status(200).json({ success: true, data });
        return;
      }
      const data = await getOrderDetail(current, params.orderId);
      res.status(200).json({ success: true, data });
    }),
  };
}

function requireSession(req: Request) {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  return req.auth;
}
