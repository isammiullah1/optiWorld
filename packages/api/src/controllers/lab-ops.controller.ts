import type { Request, Response } from 'express';
import type { AuthSessionUser } from '@optiworld/shared';
import {
  AdjustLabStockSchema,
  ConnectRetailerSchema,
  LabIncomeQuerySchema,
  LabJobHistoryQuerySchema,
  ReportRangeQuerySchema,
  RetailerSearchQuerySchema,
  SaveExternalLabClientSchema,
  SaveLabInventorySchema,
} from '@optiworld/shared';
import { z } from 'zod';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import { spreadsheetType } from '../lib/text-pdf.js';
import {
  approveLabRequest,
  cancelLabRequest,
  declineLabRequest,
  createExternalLabClient,
  listLabClientJobs,
  listLabClients,
  listLabRequests,
  updateExternalLabClient,
  requestLabRetailer,
  searchLabRetailers,
} from '../services/lab-clients.service.js';
import {
  adjustLabStock,
  createLabInventory,
  listLabInventory,
  updateLabInventory,
} from '../services/lab-inventory.service.js';
import { exportLabIncome, getLabIncome } from '../services/lab-income.service.js';
import {
  exportLabJobHistory,
  getLabJobActivity,
  getLabJobHistory,
  getLabTurnaround,
} from '../services/lab-reports.service.js';

const ItemIdSchema = z.object({ id: z.string().uuid() });

export function createLabOpsController() {
  return {
    inventory: asyncHandler(async (req: Request, res: Response) => {
      const data = await listLabInventory(session(req));
      res.status(200).json({ success: true, data });
    }),
    createInventory: asyncHandler(async (req: Request, res: Response) => {
      const input = SaveLabInventorySchema.parse(req.body);
      const data = await createLabInventory(session(req), input);
      res.status(201).json({ success: true, data });
    }),
    updateInventory: asyncHandler(async (req: Request, res: Response) => {
      const params = ItemIdSchema.parse(req.params);
      const input = SaveLabInventorySchema.parse(req.body);
      const data = await updateLabInventory(session(req), params.id, input);
      res.status(200).json({ success: true, data });
    }),
    adjustInventory: asyncHandler(async (req: Request, res: Response) => {
      const params = ItemIdSchema.parse(req.params);
      const input = AdjustLabStockSchema.parse(req.body);
      const data = await adjustLabStock(session(req), params.id, input);
      res.status(200).json({ success: true, data });
    }),
    clients: asyncHandler(async (req: Request, res: Response) => {
      const data = await listLabClients(session(req));
      res.status(200).json({ success: true, data });
    }),
    createClient: asyncHandler(async (req: Request, res: Response) => {
      const input = SaveExternalLabClientSchema.parse(req.body);
      const data = await createExternalLabClient(session(req), input);
      res.status(201).json({ success: true, data });
    }),
    updateClient: asyncHandler(async (req: Request, res: Response) => {
      const params = ItemIdSchema.parse(req.params);
      const input = SaveExternalLabClientSchema.parse(req.body);
      const data = await updateExternalLabClient(session(req), params.id, input);
      res.status(200).json({ success: true, data });
    }),
    searchRetailers: asyncHandler(async (req: Request, res: Response) => {
      const query = RetailerSearchQuerySchema.parse(req.query);
      const data = await searchLabRetailers(session(req), query.q);
      res.status(200).json({ success: true, data });
    }),
    connectRetailer: asyncHandler(async (req: Request, res: Response) => {
      const input = ConnectRetailerSchema.parse(req.body);
      const data = await requestLabRetailer(session(req), input.retailerOrgId);
      res.status(201).json({ success: true, data });
    }),
    connectionRequests: asyncHandler(async (req: Request, res: Response) => {
      const data = await listLabRequests(session(req));
      res.status(200).json({ success: true, data });
    }),
    approveConnection: asyncHandler(async (req: Request, res: Response) => {
      const params = ItemIdSchema.parse(req.params);
      const data = await approveLabRequest(session(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    declineConnection: asyncHandler(async (req: Request, res: Response) => {
      const params = ItemIdSchema.parse(req.params);
      const data = await declineLabRequest(session(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    cancelConnection: asyncHandler(async (req: Request, res: Response) => {
      const params = ItemIdSchema.parse(req.params);
      const data = await cancelLabRequest(session(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    clientJobs: asyncHandler(async (req: Request, res: Response) => {
      const params = ItemIdSchema.parse(req.params);
      const data = await listLabClientJobs(session(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    jobActivity: asyncHandler(async (req: Request, res: Response) => {
      const query = ReportRangeQuerySchema.parse(req.query);
      const data = await getLabJobActivity(session(req), query.from, query.to);
      res.status(200).json({ success: true, data });
    }),
    turnaround: asyncHandler(async (req: Request, res: Response) => {
      const query = ReportRangeQuerySchema.parse(req.query);
      const data = await getLabTurnaround(session(req), query.from, query.to);
      res.status(200).json({ success: true, data });
    }),
    jobHistory: asyncHandler(async (req: Request, res: Response) => {
      const query = LabJobHistoryQuerySchema.parse(req.query);
      const data = await getLabJobHistory(session(req), query);
      res.status(200).json({ success: true, data });
    }),
    income: asyncHandler(async (req: Request, res: Response) => {
      const query = LabIncomeQuerySchema.parse(req.query);
      const data = await getLabIncome(session(req), query);
      res.status(200).json({ success: true, data });
    }),
    exportIncome: asyncHandler(async (req: Request, res: Response) => {
      const query = LabIncomeQuerySchema.parse(req.query);
      const file = await exportLabIncome(
        session(req),
        query,
        req.query.format === 'pdf' ? 'pdf' : 'xlsx',
      );
      res.setHeader('Content-Type', spreadsheetType(file.filename));
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      res.status(200).send(file.body);
    }),
    exportJobHistory: asyncHandler(async (req: Request, res: Response) => {
      const query = LabJobHistoryQuerySchema.parse(req.query);
      const file = await exportLabJobHistory(
        session(req),
        query,
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
