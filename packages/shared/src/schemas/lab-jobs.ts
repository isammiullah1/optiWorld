import { z } from 'zod';

import { RecordActivitySchema } from './record-activity.js';

import { CONNECTION_STATUSES, JOB_STATUSES } from '../enums/index.js';
import { isShopPhone, shopPhoneMessage } from '../phone/shop-phone.js';
import { prescriptionIssuePaths } from '../prescription/reading.js';
import { ItemPrescriptionSchema } from './customers.js';
import { LabPrescriptionObject, withLabPrescriptionRules } from './pos-billing.js';

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const EyeSummarySchema = z.object({
  sphere: z.string(),
  cylinder: z.string(),
  axis: z.string(),
});

export const LabConnectionSchema = z.object({
  id: uuid,
  name: z.string(),
  logoUrl: z.string().nullable(),
  username: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  about: z.string().nullable(),
  connectedAt: z.string().nullable(),
  status: z.enum(CONNECTION_STATUSES),
  incoming: z.boolean(),
  activeJobs: z.number().int().nonnegative(),
  averageTurnaroundDays: z.number().nullable(),
});

export const LabSearchHitSchema = z.object({
  id: uuid,
  name: z.string(),
  username: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  about: z.string().nullable(),
  connectedAt: z.string().nullable(),
  connectionStatus: z.enum(CONNECTION_STATUSES).nullable(),
});

export const LabSearchQuerySchema = z.object({
  q: z.string().trim().min(3).max(80),
});

export const LabRetailerRequestSchema = z.object({
  id: uuid,
  retailerOrgId: uuid.nullable(),
  retailerName: z.string(),
  username: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  about: z.string().nullable(),
  status: z.enum(CONNECTION_STATUSES),
  requestedAt: z.string(),
});

export const LabRequestListsSchema = z.object({
  pending: z.array(LabRetailerRequestSchema),
  outgoing: z.array(LabRetailerRequestSchema),
  declined: z.array(LabRetailerRequestSchema),
});

export const ConnectLabSchema = z.object({
  labOrgId: uuid,
});

export const CreateLabJobSchema = withLabPrescriptionRules(
  LabPrescriptionObject.extend({
    patientName: z.string().trim().min(1).max(120),
  }),
);

export const LAB_JOB_SORTS = ['RECENT', 'PATIENT', 'REFERENCE', 'SUBMITTED'] as const;

export const LabJobListQuerySchema = z.object({
  q: z.string().trim().optional().default(''),
  status: z.enum(JOB_STATUSES).optional(),
  labOrgId: uuid.optional(),
  from: day.optional(),
  to: day.optional(),
  sort: z.enum(LAB_JOB_SORTS).optional().default('RECENT'),
  board: z.enum(['OPEN', 'DONE']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export type LabJobListQuery = z.infer<typeof LabJobListQuerySchema>;

export const LabJobRowSchema = z.object({
  id: uuid,
  referenceNumber: z.string(),
  patientName: z.string(),
  labName: z.string(),
  labLogoUrl: z.string().nullable(),
  status: z.enum(JOB_STATUSES),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const LabShopRequestSchema = z.object({
  kind: z.enum(['CANCEL', 'PRESCRIPTION']),
  summary: z.string(),
});

export type LabShopRequest = z.infer<typeof LabShopRequestSchema>;

export const RespondLabShopRequestSchema = z.object({
  action: z.enum(['ACCEPT', 'DECLINE']),
});

export type RespondLabShopRequest = z.infer<typeof RespondLabShopRequestSchema>;

export const LabJobDetailSchema = z.object({
  id: uuid,
  referenceNumber: z.string(),
  patientName: z.string(),
  patientPhone: z.string().nullable(),
  status: z.enum(JOB_STATUSES),
  completedAt: z.string().datetime().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  activity: z.array(RecordActivitySchema).optional(),
  notifyWhatsapp: z.boolean(),
  specialInstructions: z.string().nullable(),
  notes: z.string().nullable(),
  lab: z.object({
    id: uuid,
    name: z.string(),
    phone: z.string().nullable(),
    city: z.string().nullable(),
  }),
  invoice: z
    .object({
      id: uuid,
      invoiceNumber: z.number().int().positive(),
    })
    .nullable(),
  prescription: z.object({
    right: EyeSummarySchema,
    left: EyeSummarySchema,
    add: z.string(),
    pd: z.string(),
  }),
  frame: z.object({
    name: z.string(),
    type: z.string(),
    material: z.string(),
    eyeSize: z.string(),
  }),
  lens: z.object({
    name: z.string(),
    type: z.string(),
  }),
  history: z.array(
    z.object({
      id: uuid,
      status: z.enum(JOB_STATUSES),
      notes: z.string().nullable(),
      changedAt: z.string(),
      changedByName: z.string(),
      action: z.string(),
    }),
  ),
  shopRequest: LabShopRequestSchema.nullable(),
});

export const UpdateLabJobSchema = z.object({
  notifyWhatsapp: z.boolean(),
});

export const SetLabJobCompletionSchema = z.object({
  done: z.boolean(),
});

export type SetLabJobCompletionRequest = z.infer<typeof SetLabJobCompletionSchema>;

export const LabKanbanQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  retailerOrgId: uuid.optional(),
  from: day.optional(),
  to: day.optional(),
});

export const LabKanbanCardSchema = z.object({
  id: uuid,
  referenceNumber: z.string(),
  patientName: z.string(),
  patientPhone: z.string().nullable(),
  retailerName: z.string().nullable(),
  retailerLogoUrl: z.string().nullable(),
  retailerOrgId: uuid.nullable(),
  status: z.enum(JOB_STATUSES),
  isUrgent: z.boolean(),
  rxSummary: z.string(),
  stageNote: z.string().nullable(),
  stageEnteredAt: z.string(),
  createdAt: z.string(),
  trail: z.array(z.enum(JOB_STATUSES)),
  shopRequest: LabShopRequestSchema.nullable(),
});

export const LabBoardSchema = z.object({
  jobs: z.array(LabKanbanCardSchema),
  retailers: z.array(z.object({ id: uuid, name: z.string() })),
});

export const LabBoardJobSchema = LabJobDetailSchema.extend({
  isUrgent: z.boolean(),
  retailerName: z.string().nullable(),
});

export const UpdateLabJobStatusSchema = z.object({
  status: z.enum(JOB_STATUSES),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});

export const UpdateLabJobUrgentSchema = z.object({
  isUrgent: z.boolean(),
});

export const UpdateLabJobNotesSchema = z.object({
  notes: z.string().trim().max(2_000),
});

export const UpdateLabJobPrescriptionSchema = z.object({
  prescription: ItemPrescriptionSchema,
});

export const ReopenLabJobSchema = z.object({
  reason: z.string().trim().min(1, 'Write why this job is being reopened.').max(500),
});

export type ReopenLabJobRequest = z.infer<typeof ReopenLabJobSchema>;

export const CancelLabJobSchema = z.object({
  reason: z.string().trim().min(1, 'Write a reason for cancelling this job.').max(500),
});

export const RedirectLabJobSchema = z.object({
  labOrgId: uuid,
});

export const CreateLabBoardJobSchema = z.object({
  patientName: z.string().trim().min(1, 'Enter the customer name.').max(120),
  patientPhone: z
    .string()
    .trim()
    .min(1, 'Enter a phone number.')
    .max(30, 'Phone must be 30 characters or fewer.')
    .superRefine((value, ctx) => {
      if (!isShopPhone(value)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: shopPhoneMessage(value) });
      }
    }),
  frameName: z.string().trim().min(1, 'Enter the frame name.').max(80),
  frameType: z.string().trim().min(1, 'Enter the frame type.').max(80),
  lensName: z.string().trim().min(1, 'Enter the lens name.').max(80),
  lensType: z.string().trim().min(1, 'Enter the lens type.').max(80),
  frameMaterial: z.string().trim().max(80).optional().or(z.literal('')),
  eyeSize: z.string().trim().max(20).optional().or(z.literal('')),
  retailerOrgId: uuid.optional().or(z.literal('')),
  labClientId: uuid.optional().or(z.literal('')),
  specialInstructions: z.string().trim().max(500).optional().or(z.literal('')),
  referenceNumber: z
    .string()
    .regex(/^(?:OW-\d{4}-\d{3}|OW-LAB-\d{4}-[A-Z0-9]{5})$/, 'The product tag number is not ready.')
    .optional()
    .or(z.literal('')),
  prescription: ItemPrescriptionSchema,
});

export type LabKanbanCard = z.infer<typeof LabKanbanCardSchema>;
export type LabBoard = z.infer<typeof LabBoardSchema>;
export type LabBoardJob = z.infer<typeof LabBoardJobSchema>;
export type CreateLabBoardJobRequest = z.infer<typeof CreateLabBoardJobSchema>;

export type LabConnection = z.infer<typeof LabConnectionSchema>;
export type LabSearchHit = z.infer<typeof LabSearchHitSchema>;
export type LabRetailerRequest = z.infer<typeof LabRetailerRequestSchema>;
export type LabRequestLists = z.infer<typeof LabRequestListsSchema>;
const EyePowerSchema = z.object({
  sphere: z.string().max(20),
  cylinder: z.string().max(20),
  axis: z.string().max(20),
});

export const CreateDirectLabJobSchema = z
  .object({
    patientName: z.string().trim().min(1, 'Enter the patient name.').max(120),
    patientPhone: z.string().trim().max(30).optional().or(z.literal('')),
    labOrgId: uuid,
    right: EyePowerSchema,
    left: EyePowerSchema,
    add: z.string().max(20).default(''),
    pd: z.string().max(20).default(''),
    notes: z.string().max(500).default(''),
    lensName: z.string().trim().min(1, 'Enter the lens name.').max(80),
    lensType: z.string().trim().min(1, 'Enter the lens type.').max(80),
    frameName: z.string().trim().max(80).optional().or(z.literal('')),
    frameType: z.string().trim().max(80).optional().or(z.literal('')),
    frameMaterial: z.string().trim().max(80).optional().or(z.literal('')),
    eyeSize: z.string().trim().max(20).optional().or(z.literal('')),
    specialInstructions: z.string().trim().max(500).optional().or(z.literal('')),
    bill: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('NONE') }),
      z.object({ mode: z.literal('EXISTING'), invoiceId: uuid }),
    ]),
  })
  .superRefine((value, ctx) => {
    const phone = value.patientPhone?.trim() ?? '';
    if (phone.length > 0 && !isShopPhone(phone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: shopPhoneMessage(phone),
        path: ['patientPhone'],
      });
    }
    for (const issue of prescriptionIssuePaths({
      right: value.right,
      left: value.left,
      add: value.add,
      pd: value.pd,
      notes: value.notes,
    })) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue.message, path: issue.path });
    }
  });

export type CreateDirectLabJobRequest = z.infer<typeof CreateDirectLabJobSchema>;

export const LabSaleOptionSchema = z.object({
  id: uuid,
  invoiceNumber: z.number().int().positive(),
  customerName: z.string(),
  issuedAt: z.string().datetime(),
});

export type LabSaleOption = z.infer<typeof LabSaleOptionSchema>;

export type CreateLabJobRequest = z.infer<typeof CreateLabJobSchema>;
export type LabJobRow = z.infer<typeof LabJobRowSchema>;
export type LabJobDetail = z.infer<typeof LabJobDetailSchema>;
