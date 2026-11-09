import type { Request, Response } from 'express';
import { z } from 'zod';

import {
  CancelLabJobSchema,
  CreateDirectLabJobSchema,
  ReopenLabJobSchema,
  RespondLabShopRequestSchema,
  RedirectLabJobSchema,
  ConnectLabSchema,
  CreateLabBoardJobSchema,
  CreateLabJobSchema,
  LabJobListQuerySchema,
  LabKanbanQuerySchema,
  LabSearchQuerySchema,
  SetLabJobCompletionSchema,
  UpdateLabJobNotesSchema,
  UpdateLabJobPrescriptionSchema,
  UpdateLabJobSchema,
  UpdateLabJobStatusSchema,
  UpdateLabJobUrgentSchema,
} from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import {
  acceptLabJob,
  cancelLabJob,
  createLabBoardJob,
  getLabBoardJob,
  listLabBoard,
  reserveLabReference,
  notifyLabRetailer,
  rejectLabJob,
  remindLabMaterial,
  updateLabJobNotes,
  updateLabJobPrescription,
  updateLabJobStatus,
  updateLabJobUrgent,
} from '../services/lab-board.service.js';
import { respondToShopRequest } from '../services/lab-job-requests.service.js';
import {
  cancelLabConnection,
  connectLab,
  cancelRetailerLabJob,
  outsourceRetailerLabJob,
  reopenDispatchedLabJob,
  redirectRetailerLabJob,
  createDirectLabJob,
  createLabJob,
  disconnectLab,
  getRetailerLabJob,
  listLabConnections,
  listLabJobHistory,
  listRetailerLabJobs,
  respondToLabConnection,
  searchLabs,
  searchRetailerSales,
  setLabJobCompletion,
  updateLabJobNotify,
} from '../services/lab-jobs.service.js';

const JobIdSchema = z.object({ id: z.string().uuid() });
const LabOrgParamSchema = z.object({ labOrgId: z.string().uuid() });

export function createLabJobsController() {
  return {
    connections: asyncHandler(async (req: Request, res: Response) => {
      const data = await listLabConnections(requireSession(req));
      res.status(200).json({ success: true, data });
    }),
    search: asyncHandler(async (req: Request, res: Response) => {
      const query = LabSearchQuerySchema.parse(req.query);
      const data = await searchLabs(requireSession(req), query.q);
      res.status(200).json({ success: true, data });
    }),
    connect: asyncHandler(async (req: Request, res: Response) => {
      const input = ConnectLabSchema.parse(req.body);
      const data = await connectLab(requireSession(req), input.labOrgId);
      res.status(201).json({ success: true, data });
    }),
    acceptLab: asyncHandler(async (req: Request, res: Response) => {
      const params = LabOrgParamSchema.parse(req.params);
      const data = await respondToLabConnection(requireSession(req), params.labOrgId, true);
      res.status(200).json({ success: true, data });
    }),
    declineLab: asyncHandler(async (req: Request, res: Response) => {
      const params = LabOrgParamSchema.parse(req.params);
      const data = await respondToLabConnection(requireSession(req), params.labOrgId, false);
      res.status(200).json({ success: true, data });
    }),
    cancelLab: asyncHandler(async (req: Request, res: Response) => {
      const params = LabOrgParamSchema.parse(req.params);
      const data = await cancelLabConnection(requireSession(req), params.labOrgId);
      res.status(200).json({ success: true, data });
    }),
    disconnect: asyncHandler(async (req: Request, res: Response) => {
      const params = LabOrgParamSchema.parse(req.params);
      const data = await disconnectLab(requireSession(req), params.labOrgId);
      res.status(200).json({ success: true, data });
    }),
    cancelRetailer: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const input = CancelLabJobSchema.parse(req.body);
      const data = await cancelRetailerLabJob(requireSession(req), params.id, input.reason);
      res.status(200).json({ success: true, data });
    }),
    redirectRetailer: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const input = RedirectLabJobSchema.parse(req.body);
      const data = await redirectRetailerLabJob(requireSession(req), params.id, input.labOrgId);
      res.status(200).json({ success: true, data });
    }),
    outsourceRetailer: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const data = await outsourceRetailerLabJob(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    reopen: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const input = ReopenLabJobSchema.parse(req.body);
      const data = await reopenDispatchedLabJob(requireSession(req), params.id, input.reason);
      res.status(200).json({ success: true, data });
    }),
    completion: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const input = SetLabJobCompletionSchema.parse(req.body);
      const data = await setLabJobCompletion(requireSession(req), params.id, input.done);
      res.status(200).json({ success: true, data });
    }),
    sales: asyncHandler(async (req: Request, res: Response) => {
      const query = z
        .object({ q: z.string().trim().max(80).optional().default('') })
        .parse(req.query);
      const data = await searchRetailerSales(requireSession(req), query.q);
      res.status(200).json({ success: true, data });
    }),
    createDirect: asyncHandler(async (req: Request, res: Response) => {
      const input = CreateDirectLabJobSchema.parse(req.body);
      const data = await createDirectLabJob(requireSession(req), input);
      res.status(201).json({ success: true, data });
    }),
    list: asyncHandler(async (req: Request, res: Response) => {
      const query = LabJobListQuerySchema.parse(req.query);
      const result = await listRetailerLabJobs(requireSession(req), query);
      res.status(200).json({
        success: true,
        data: result.data,
        meta: { total: result.total, page: query.page, limit: query.limit },
      });
    }),
    create: asyncHandler(async (req: Request, res: Response) => {
      const input = CreateLabJobSchema.parse(req.body);
      const data = await createLabJob(requireSession(req), input);
      res.status(201).json({ success: true, data });
    }),
    detail: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const data = await getRetailerLabJob(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    history: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const data = await listLabJobHistory(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    notify: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const input = UpdateLabJobSchema.parse(req.body);
      const data = await updateLabJobNotify(requireSession(req), params.id, input.notifyWhatsapp);
      res.status(200).json({ success: true, data });
    }),
    board: asyncHandler(async (req: Request, res: Response) => {
      const query = LabKanbanQuerySchema.parse(req.query);
      const data = await listLabBoard(requireSession(req), query);
      res.status(200).json({ success: true, data });
    }),
    boardJob: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const data = await getLabBoardJob(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    nextReference: asyncHandler(async (req: Request, res: Response) => {
      const data = await reserveLabReference(requireSession(req));
      res.status(200).json({ success: true, data });
    }),
    addJob: asyncHandler(async (req: Request, res: Response) => {
      const input = CreateLabBoardJobSchema.parse(req.body);
      const data = await createLabBoardJob(requireSession(req), input);
      res.status(201).json({ success: true, data });
    }),
    status: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const input = UpdateLabJobStatusSchema.parse(req.body);
      const data = await updateLabJobStatus(
        requireSession(req),
        params.id,
        input.status,
        input.note,
      );
      res.status(200).json({ success: true, data });
    }),
    urgent: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const input = UpdateLabJobUrgentSchema.parse(req.body);
      const data = await updateLabJobUrgent(requireSession(req), params.id, input.isUrgent);
      res.status(200).json({ success: true, data });
    }),
    notes: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const input = UpdateLabJobNotesSchema.parse(req.body);
      const data = await updateLabJobNotes(requireSession(req), params.id, input.notes);
      res.status(200).json({ success: true, data });
    }),
    prescription: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const input = UpdateLabJobPrescriptionSchema.parse(req.body);
      const data = await updateLabJobPrescription(
        requireSession(req),
        params.id,
        input.prescription,
      );
      res.status(200).json({ success: true, data });
    }),
    cancel: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const input = CancelLabJobSchema.parse(req.body);
      const data = await cancelLabJob(requireSession(req), params.id, input.reason);
      res.status(200).json({ success: true, data });
    }),
    notifyRetailer: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const data = await notifyLabRetailer(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    accept: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const data = await acceptLabJob(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    reject: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const input = CancelLabJobSchema.parse(req.body);
      const data = await rejectLabJob(requireSession(req), params.id, input.reason);
      res.status(200).json({ success: true, data });
    }),
    remindMaterial: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const data = await remindLabMaterial(requireSession(req), params.id);
      res.status(200).json({ success: true, data });
    }),
    shopRequest: asyncHandler(async (req: Request, res: Response) => {
      const params = JobIdSchema.parse(req.params);
      const input = RespondLabShopRequestSchema.parse(req.body);
      const auth = requireSession(req);
      await respondToShopRequest(auth, params.id, input.action);
      const data = await getLabBoardJob(auth, params.id);
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
