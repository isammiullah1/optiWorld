import type { Request, Response } from 'express';

import {
  CancelInvoiceSchema,
  ClearInvoiceCreditSchema,
  CreatePosInvoiceSchema,
  SendInvoiceLabSchema,
  SendReceiptRequestSchema,
  FinalizeInvoiceLabSchema,
  UpdateInvoicePrescriptionSchema,
} from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import { clearInvoiceCredit, removeInvoice } from '../services/invoice-actions.service.js';
import {
  cancelInvoiceLab,
  cancelRetailerInvoice,
  sendInvoiceToLab,
  unsendInvoiceLab,
  finalizeInvoiceLabEdit,
  updateInvoicePrescription,
} from '../services/invoice-sale.service.js';
import {
  createPosInvoice,
  getPosReceipt,
  listConnectedLabs,
  searchCustomers,
  searchInventory,
  sendReceiptWhatsApp,
} from '../services/pos-billing.service.js';

export function createPosBillingController() {
  return {
    searchInventory: asyncHandler(async (req: Request, res: Response) => {
      const data = await searchInventory(requireSession(req), readQuery(req.query.q));
      res.status(200).json({ success: true, data });
    }),
    searchCustomers: asyncHandler(async (req: Request, res: Response) => {
      const data = await searchCustomers(requireSession(req), readQuery(req.query.q));
      res.status(200).json({ success: true, data });
    }),
    labs: asyncHandler(async (req: Request, res: Response) => {
      const data = await listConnectedLabs(requireSession(req));
      res.status(200).json({ success: true, data });
    }),
    createInvoice: asyncHandler(async (req: Request, res: Response) => {
      const input = CreatePosInvoiceSchema.parse(req.body);
      const data = await createPosInvoice(requireSession(req), input);
      res.status(201).json({ success: true, data });
    }),
    clearCredit: asyncHandler(async (req: Request, res: Response) => {
      const input = ClearInvoiceCreditSchema.parse(req.body ?? {});
      const data = await clearInvoiceCredit(
        requireSession(req),
        readParam(req.params.invoiceId),
        input.amount,
      );
      res.status(200).json({ success: true, data });
    }),
    removeInvoice: asyncHandler(async (req: Request, res: Response) => {
      const data = await removeInvoice(requireSession(req), readParam(req.params.invoiceId));
      res.status(200).json({ success: true, data });
    }),
    cancelInvoice: asyncHandler(async (req: Request, res: Response) => {
      const input = CancelInvoiceSchema.parse(req.body);
      const data = await cancelRetailerInvoice(
        requireSession(req),
        readParam(req.params.invoiceId),
        input.reason,
      );
      res.status(200).json({ success: true, data });
    }),
    sendToLab: asyncHandler(async (req: Request, res: Response) => {
      const input = SendInvoiceLabSchema.parse(req.body);
      const data = await sendInvoiceToLab(
        requireSession(req),
        readParam(req.params.invoiceId),
        input.labOrgId,
      );
      res.status(200).json({ success: true, data });
    }),
    unsendLab: asyncHandler(async (req: Request, res: Response) => {
      const data = await unsendInvoiceLab(requireSession(req), readParam(req.params.invoiceId));
      res.status(200).json({ success: true, data });
    }),
    cancelLab: asyncHandler(async (req: Request, res: Response) => {
      const input = CancelInvoiceSchema.parse(req.body);
      const data = await cancelInvoiceLab(
        requireSession(req),
        readParam(req.params.invoiceId),
        input.reason,
      );
      res.status(200).json({ success: true, data });
    }),
    finalizeLab: asyncHandler(async (req: Request, res: Response) => {
      const input = FinalizeInvoiceLabSchema.parse(req.body);
      const data = await finalizeInvoiceLabEdit(
        requireSession(req),
        readParam(req.params.invoiceId),
        input,
      );
      res.status(200).json({ success: true, data });
    }),
    updatePrescription: asyncHandler(async (req: Request, res: Response) => {
      const input = UpdateInvoicePrescriptionSchema.parse(req.body);
      const data = await updateInvoicePrescription(
        requireSession(req),
        readParam(req.params.invoiceId),
        input.items,
      );
      res.status(200).json({ success: true, data });
    }),
    receipt: asyncHandler(async (req: Request, res: Response) => {
      const invoiceId = readParam(req.params.invoiceId);
      const data = await getPosReceipt(requireSession(req), invoiceId);
      res.status(200).json({ success: true, data });
    }),
    sendReceipt: asyncHandler(async (req: Request, res: Response) => {
      const input = SendReceiptRequestSchema.parse(req.body);
      const data = await sendReceiptWhatsApp(requireSession(req), input.invoiceId);
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

function readQuery(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return '';
}

function readParam(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invoice id is required');
  }
  return raw;
}
