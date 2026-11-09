import type { Request, Response } from 'express';
import { z } from 'zod';

import {
  AdjustStockSchema,
  CreateInventorySchema,
  InventoryArchiveNoteSchema,
  InventoryListQuerySchema,
  UpdateInventorySchema,
  UpdateRetailerSettingsSchema,
  UploadBillLogoSchema,
} from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import { clearBillLogo, saveBillLogo } from '../services/bill-logo.service.js';
import {
  adjustInventoryStock,
  createInventoryBatch,
  getInventoryDetail,
  getRetailerSettings,
  listInventory,
  listStockMovements,
  removeInventoryBatch,
  restoreInventoryBatch,
  updateInventoryBatch,
  updateRetailerSettings,
} from '../services/inventory.service.js';

const BatchParamsSchema = z.object({ id: z.string().uuid() });

export function createInventoryController() {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const query = InventoryListQuerySchema.parse(req.query);
      const data = await listInventory(requireSession(req), query);
      res.status(200).json({
        success: true,
        data: { rows: data.rows, categories: data.categories, categoryRules: data.categoryRules },
        meta: data.meta,
      });
    }),
    create: asyncHandler(async (req: Request, res: Response) => {
      const input = CreateInventorySchema.parse(req.body);
      const data = await createInventoryBatch(requireSession(req), input);
      res.status(201).json({ success: true, data });
    }),
    detail: asyncHandler(async (req: Request, res: Response) => {
      const params = BatchParamsSchema.parse(req.params);
      const data = await getInventoryDetail(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    update: asyncHandler(async (req: Request, res: Response) => {
      const params = BatchParamsSchema.parse(req.params);
      const input = UpdateInventorySchema.parse(req.body);
      const data = await updateInventoryBatch(requireSession(req), params.id, input);
      res.status(200).json({ success: true, data });
    }),
    remove: asyncHandler(async (req: Request, res: Response) => {
      const params = BatchParamsSchema.parse(req.params);
      const input = InventoryArchiveNoteSchema.parse(req.body);
      await removeInventoryBatch(requireSession(req), params.id, input.reason);
      res.status(200).json({ success: true, data: { id: params.id } });
    }),
    restore: asyncHandler(async (req: Request, res: Response) => {
      const params = BatchParamsSchema.parse(req.params);
      const input = InventoryArchiveNoteSchema.parse(req.body);
      const data = await restoreInventoryBatch(requireSession(req), params.id, input.reason);
      res.status(200).json({ success: true, data });
    }),
    movements: asyncHandler(async (req: Request, res: Response) => {
      const params = BatchParamsSchema.parse(req.params);
      const data = await listStockMovements(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    adjust: asyncHandler(async (req: Request, res: Response) => {
      const params = BatchParamsSchema.parse(req.params);
      const input = AdjustStockSchema.parse(req.body);
      const data = await adjustInventoryStock(requireSession(req), params.id, input);
      res.status(200).json({ success: true, data });
    }),
    settings: asyncHandler(async (req: Request, res: Response) => {
      const data = await getRetailerSettings(requireSession(req));
      res.status(200).json({ success: true, data });
    }),
    updateSettings: asyncHandler(async (req: Request, res: Response) => {
      const input = UpdateRetailerSettingsSchema.parse(req.body);
      const data = await updateRetailerSettings(requireSession(req), input);
      res.status(200).json({ success: true, data });
    }),
    uploadLogo: asyncHandler(async (req: Request, res: Response) => {
      const input = UploadBillLogoSchema.parse(req.body);
      const data = await saveBillLogo(requireSession(req), input.image);
      res.status(200).json({ success: true, data });
    }),
    removeLogo: asyncHandler(async (req: Request, res: Response) => {
      const data = await clearBillLogo(requireSession(req));
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
