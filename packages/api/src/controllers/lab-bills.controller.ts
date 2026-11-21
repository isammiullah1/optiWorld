import type { Request, Response } from 'express';
import { z } from 'zod';

import {
  AddLabBillLineSchema,
  LabBillAdjustmentRequestSchema,
  LabBillIdsSchema,
  LabBillListQuerySchema,
  SaveLabServiceSchema,
  UpdateLabBillSchema,
} from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import { spreadsheetType } from '../lib/text-pdf.js';
import {
  addLabBillLine,
  adjustIssuedLabBill,
  clearLabBill,
  clearLabBills,
  collectWalkInBalance,
  exportLaboratoryBills,
  exportRetailerLabBills,
  issueLabBill,
  listLaboratoryBills,
  remindLabBills,
  whatsappLabBillStatement,
  listLabServices,
  listPricedServicesForShop,
  listRetailerLabBills,
  listShopLabServices,
  saveLabService,
  updateOpenLabBill,
} from '../services/lab-bills.service.js';

const IdSchema = z.object({ id: z.string().uuid() });

export function createLabBillsController() {
  return {
    shopServices: asyncHandler(async (req: Request, res: Response) => {
      const data = await listShopLabServices(requireSession(req));
      res.status(200).json({ success: true, data });
    }),
    labServicesForShop: asyncHandler(async (req: Request, res: Response) => {
      const params = z.object({ labOrgId: z.string().uuid() }).parse(req.params);
      const data = await listPricedServicesForShop(requireSession(req), params.labOrgId);
      res.status(200).json({ success: true, data });
    }),
    shopBills: asyncHandler(async (req: Request, res: Response) => {
      const query = LabBillListQuerySchema.parse(req.query);
      const data = await listRetailerLabBills(requireSession(req), query);
      res.status(200).json({ success: true, data });
    }),
    shopExport: asyncHandler(async (req: Request, res: Response) => {
      const query = LabBillListQuerySchema.parse(req.query);
      const format = query.format === 'pdf' ? 'pdf' : 'xlsx';
      const file = await exportRetailerLabBills(requireSession(req), query, format);
      sendFile(res, file);
    }),
    services: asyncHandler(async (req: Request, res: Response) => {
      const data = await listLabServices(requireSession(req));
      res.status(200).json({ success: true, data });
    }),
    createService: asyncHandler(async (req: Request, res: Response) => {
      const input = SaveLabServiceSchema.parse(req.body);
      const data = await saveLabService(requireSession(req), null, input);
      res.status(201).json({ success: true, data });
    }),
    updateService: asyncHandler(async (req: Request, res: Response) => {
      const params = IdSchema.parse(req.params);
      const input = SaveLabServiceSchema.parse(req.body);
      const data = await saveLabService(requireSession(req), params.id, input);
      res.status(200).json({ success: true, data });
    }),
    labBills: asyncHandler(async (req: Request, res: Response) => {
      const query = LabBillListQuerySchema.parse(req.query);
      const data = await listLaboratoryBills(requireSession(req), query);
      res.status(200).json({ success: true, data });
    }),
    labExport: asyncHandler(async (req: Request, res: Response) => {
      const query = LabBillListQuerySchema.parse(req.query);
      const format = query.format === 'pdf' ? 'pdf' : 'xlsx';
      const file = await exportLaboratoryBills(requireSession(req), query, format);
      sendFile(res, file);
    }),
    updateBill: asyncHandler(async (req: Request, res: Response) => {
      const params = IdSchema.parse(req.params);
      const input = UpdateLabBillSchema.parse(req.body);
      const data = await updateOpenLabBill(requireSession(req), params.id, input);
      res.status(200).json({ success: true, data });
    }),
    addLine: asyncHandler(async (req: Request, res: Response) => {
      const params = IdSchema.parse(req.params);
      const input = AddLabBillLineSchema.parse(req.body);
      const data = await addLabBillLine(
        requireSession(req),
        params.id,
        input.labServiceId,
        input.quantity,
      );
      res.status(200).json({ success: true, data });
    }),
    issue: asyncHandler(async (req: Request, res: Response) => {
      const params = IdSchema.parse(req.params);
      const data = await issueLabBill(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    clear: asyncHandler(async (req: Request, res: Response) => {
      const params = IdSchema.parse(req.params);
      const data = await clearLabBill(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    clearMany: asyncHandler(async (req: Request, res: Response) => {
      const input = LabBillIdsSchema.parse(req.body);
      const data = await clearLabBills(requireSession(req), input.billIds);
      res.status(200).json({ success: true, data });
    }),
    remind: asyncHandler(async (req: Request, res: Response) => {
      const input = LabBillIdsSchema.parse(req.body);
      const data = await remindLabBills(requireSession(req), input.billIds);
      res.status(200).json({ success: true, data });
    }),
    whatsapp: asyncHandler(async (req: Request, res: Response) => {
      const input = LabBillIdsSchema.parse(req.body);
      const data = await whatsappLabBillStatement(requireSession(req), input.billIds);
      res.status(200).json({ success: true, data });
    }),
    collect: asyncHandler(async (req: Request, res: Response) => {
      const params = IdSchema.parse(req.params);
      const data = await collectWalkInBalance(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    adjust: asyncHandler(async (req: Request, res: Response) => {
      const params = IdSchema.parse(req.params);
      const input = LabBillAdjustmentRequestSchema.parse(req.body);
      const data = await adjustIssuedLabBill(
        requireSession(req),
        params.id,
        input.note,
        input.amount,
      );
      res.status(200).json({ success: true, data });
    }),
  };
}

function sendFile(res: Response, file: { filename: string; body: Buffer }): void {
  res.setHeader('Content-Type', spreadsheetType(file.filename));
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.status(200).send(file.body);
}

function requireSession(req: Request) {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  return req.auth;
}
