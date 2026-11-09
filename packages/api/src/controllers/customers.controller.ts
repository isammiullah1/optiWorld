import type { Request, Response } from 'express';
import { z } from 'zod';

import {
  CreateCustomerSchema,
  CustomerListQuerySchema,
  ItemPrescriptionSchema,
  RecordPaymentSchema,
  UpdateCustomerSchema,
} from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import {
  createCustomer,
  createCustomerPrescription,
  deleteCustomer,
  getCustomer,
  getCustomerLedger,
  listCustomerCreditBills,
  listCustomerPrescriptions,
  listCustomers,
  recordCustomerPayment,
  updateCustomer,
  updateCustomerPrescription,
} from '../services/customers.service.js';

const CustomerParamsSchema = z.object({ id: z.string().uuid() });
const PrescriptionParamsSchema = z.object({
  id: z.string().uuid(),
  prescriptionId: z.string().uuid(),
});

export function createCustomersController() {
  return {
    list: asyncHandler(async (req: Request, res: Response) => {
      const query = CustomerListQuerySchema.parse(req.query);
      const result = await listCustomers(requireSession(req), query);
      res.status(200).json({ success: true, data: result.rows, meta: result.meta });
    }),
    create: asyncHandler(async (req: Request, res: Response) => {
      const input = CreateCustomerSchema.parse(req.body);
      const data = await createCustomer(requireSession(req), input);
      res.status(201).json({ success: true, data });
    }),
    prescriptions: asyncHandler(async (req: Request, res: Response) => {
      const params = CustomerParamsSchema.parse(req.params);
      const data = await listCustomerPrescriptions(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    createPrescription: asyncHandler(async (req: Request, res: Response) => {
      const params = CustomerParamsSchema.parse(req.params);
      const input = ItemPrescriptionSchema.parse(req.body);
      const data = await createCustomerPrescription(requireSession(req), params.id, input);
      res.status(201).json({ success: true, data });
    }),
    updatePrescription: asyncHandler(async (req: Request, res: Response) => {
      const params = PrescriptionParamsSchema.parse(req.params);
      const input = ItemPrescriptionSchema.parse(req.body);
      const data = await updateCustomerPrescription(
        requireSession(req),
        params.id,
        params.prescriptionId,
        input,
      );
      res.status(200).json({ success: true, data });
    }),
    get: asyncHandler(async (req: Request, res: Response) => {
      const params = CustomerParamsSchema.parse(req.params);
      const data = await getCustomer(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    update: asyncHandler(async (req: Request, res: Response) => {
      const params = CustomerParamsSchema.parse(req.params);
      const input = UpdateCustomerSchema.parse(req.body);
      const data = await updateCustomer(requireSession(req), params.id, input);
      res.status(200).json({ success: true, data });
    }),
    remove: asyncHandler(async (req: Request, res: Response) => {
      const params = CustomerParamsSchema.parse(req.params);
      await deleteCustomer(requireSession(req), params.id);
      res.status(200).json({ success: true, data: { id: params.id } });
    }),
    ledger: asyncHandler(async (req: Request, res: Response) => {
      const params = CustomerParamsSchema.parse(req.params);
      const data = await getCustomerLedger(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    creditBills: asyncHandler(async (req: Request, res: Response) => {
      const params = CustomerParamsSchema.parse(req.params);
      const data = await listCustomerCreditBills(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    payment: asyncHandler(async (req: Request, res: Response) => {
      const params = CustomerParamsSchema.parse(req.params);
      const input = RecordPaymentSchema.parse(req.body);
      const data = await recordCustomerPayment(requireSession(req), params.id, input);
      res.status(201).json({ success: true, data });
    }),
  };
}

function requireSession(req: Request) {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  return req.auth;
}
