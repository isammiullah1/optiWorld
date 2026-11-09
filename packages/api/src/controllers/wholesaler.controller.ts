import type { Request, Response } from 'express';
import {
  BulkAvailabilitySchema,
  CatalogCategorySchema,
  CatalogListQuerySchema,
  ConnectionVisibilitySchema,
  ConnectRetailerSchema,
  RetailerSearchQuerySchema,
  ReportRangeQuerySchema,
  SaveCatalogProductSchema,
  UpdateWholesalerListingProfileSchema,
  WholesalerOrderListQuerySchema,
  type AuthSessionUser,
} from '@optiworld/shared';
import { z } from 'zod';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import { spreadsheetType } from '../lib/text-pdf.js';
import {
  acceptCatalogCategory,
  createCatalogProduct,
  deleteCatalogProduct,
  listCatalog,
  listCatalogCategories,
  setCatalogAvailability,
  updateCatalogProduct,
} from '../services/wholesaler-catalog.service.js';
import {
  getWholesalerDashboard,
  getWholesalerShell,
  listWholesalerOrders,
} from '../services/wholesaler-dashboard.service.js';
import {
  approveWholesalerConnection,
  cancelWholesalerRequest,
  declineWholesalerConnection,
  listQuoteRequests,
  listWholesalerConnections,
  requestWholesalerRetailer,
  searchWholesalerRetailers,
  updateConnectionVisibility,
} from '../services/wholesaler-connections.service.js';
import { getListingProfile, updateListingProfile } from '../services/wholesaler-profile.service.js';
import {
  exportOrderHistory,
  getCatalogActivity,
  getOrderActivity,
} from '../services/wholesaler-reports.service.js';

const ProductIdSchema = z.object({ productId: z.string().uuid() });
const ConnectionIdSchema = z.object({ connectionId: z.string().uuid() });

export function createWholesalerController() {
  return {
    shell: asyncHandler(async (req: Request, res: Response) => {
      const data = await getWholesalerShell(session(req));
      res.status(200).json({ success: true, data });
    }),
    dashboard: asyncHandler(async (req: Request, res: Response) => {
      const data = await getWholesalerDashboard(session(req));
      res.status(200).json({ success: true, data });
    }),
    orders: asyncHandler(async (req: Request, res: Response) => {
      const query = WholesalerOrderListQuerySchema.parse(req.query);
      const result = await listWholesalerOrders(session(req), query);
      res.status(200).json({
        success: true,
        data: result.orders,
        meta: {
          total: result.total,
          page: query.page,
          limit: query.limit,
          pipeline: result.pipeline,
        },
      });
    }),
    listCatalog: asyncHandler(async (req: Request, res: Response) => {
      const query = CatalogListQuerySchema.parse(req.query);
      const data = await listCatalog(session(req), query);
      res.status(200).json({ success: true, data });
    }),
    createProduct: asyncHandler(async (req: Request, res: Response) => {
      const input = SaveCatalogProductSchema.parse(req.body);
      const data = await createCatalogProduct(session(req), input);
      res.status(201).json({ success: true, data });
    }),
    updateProduct: asyncHandler(async (req: Request, res: Response) => {
      const { productId } = ProductIdSchema.parse(req.params);
      const input = SaveCatalogProductSchema.parse(req.body);
      const data = await updateCatalogProduct(session(req), productId, input);
      res.status(200).json({ success: true, data });
    }),
    deleteProduct: asyncHandler(async (req: Request, res: Response) => {
      const { productId } = ProductIdSchema.parse(req.params);
      await deleteCatalogProduct(session(req), productId);
      res.status(200).json({ success: true, data: { deleted: true } });
    }),
    setAvailability: asyncHandler(async (req: Request, res: Response) => {
      const input = BulkAvailabilitySchema.parse(req.body);
      const data = await setCatalogAvailability(session(req), input);
      res.status(200).json({ success: true, data });
    }),
    categories: asyncHandler(async (req: Request, res: Response) => {
      const data = await listCatalogCategories(session(req));
      res.status(200).json({ success: true, data });
    }),
    createCategory: asyncHandler(async (req: Request, res: Response) => {
      const input = CatalogCategorySchema.parse(req.body);
      const data = acceptCatalogCategory(session(req), input.name);
      res.status(201).json({ success: true, data });
    }),
    searchRetailers: asyncHandler(async (req: Request, res: Response) => {
      const query = RetailerSearchQuerySchema.parse(req.query);
      const data = await searchWholesalerRetailers(session(req), query.q);
      res.status(200).json({ success: true, data });
    }),
    connectRetailer: asyncHandler(async (req: Request, res: Response) => {
      const input = ConnectRetailerSchema.parse(req.body);
      const data = await requestWholesalerRetailer(session(req), input.retailerOrgId);
      res.status(201).json({ success: true, data });
    }),
    connections: asyncHandler(async (req: Request, res: Response) => {
      const data = await listWholesalerConnections(session(req));
      res.status(200).json({ success: true, data });
    }),
    approveConnection: asyncHandler(async (req: Request, res: Response) => {
      const { connectionId } = ConnectionIdSchema.parse(req.params);
      const input = ConnectionVisibilitySchema.parse(req.body);
      const data = await approveWholesalerConnection(session(req), connectionId, input);
      res.status(200).json({ success: true, data });
    }),
    declineConnection: asyncHandler(async (req: Request, res: Response) => {
      const { connectionId } = ConnectionIdSchema.parse(req.params);
      const data = await declineWholesalerConnection(session(req), connectionId);
      res.status(200).json({ success: true, data });
    }),
    cancelConnection: asyncHandler(async (req: Request, res: Response) => {
      const { connectionId } = ConnectionIdSchema.parse(req.params);
      const data = await cancelWholesalerRequest(session(req), connectionId);
      res.status(200).json({ success: true, data });
    }),
    updateVisibility: asyncHandler(async (req: Request, res: Response) => {
      const { connectionId } = ConnectionIdSchema.parse(req.params);
      const input = ConnectionVisibilitySchema.parse(req.body);
      const data = await updateConnectionVisibility(session(req), connectionId, input);
      res.status(200).json({ success: true, data });
    }),
    quoteRequests: asyncHandler(async (req: Request, res: Response) => {
      const data = await listQuoteRequests(session(req));
      res.status(200).json({ success: true, data });
    }),
    profile: asyncHandler(async (req: Request, res: Response) => {
      const data = await getListingProfile(session(req));
      res.status(200).json({ success: true, data });
    }),
    updateProfile: asyncHandler(async (req: Request, res: Response) => {
      const input = UpdateWholesalerListingProfileSchema.parse(req.body);
      const data = await updateListingProfile(session(req), input);
      res.status(200).json({ success: true, data });
    }),
    orderActivity: asyncHandler(async (req: Request, res: Response) => {
      const query = ReportRangeQuerySchema.parse(req.query);
      const data = await getOrderActivity(session(req), query.from, query.to);
      res.status(200).json({ success: true, data });
    }),
    catalogActivity: asyncHandler(async (req: Request, res: Response) => {
      const query = ReportRangeQuerySchema.parse(req.query);
      const data = await getCatalogActivity(session(req), query.from, query.to);
      res.status(200).json({ success: true, data });
    }),
    exportOrderHistory: asyncHandler(async (req: Request, res: Response) => {
      const query = ReportRangeQuerySchema.parse(req.query);
      const file = await exportOrderHistory(
        session(req),
        query.from,
        query.to,
        req.query.format === 'pdf' ? 'pdf' : 'xlsx',
      );
      res.setHeader('Content-Type', spreadsheetType(file.filename));
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.status(200).send(file.body);
    }),
  };
}

function session(req: Request): AuthSessionUser {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  return req.auth;
}
