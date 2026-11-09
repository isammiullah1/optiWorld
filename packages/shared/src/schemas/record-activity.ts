import { z } from 'zod';

export const RECORD_ACTIVITY_KINDS = ['PREPARED', 'UPDATED', 'CANCELLED', 'DELETED'] as const;

export const RecordDetailSchema = z.object({
  text: z.string(),
  lines: z.array(z.string()).optional(),
});

export const RecordActivitySchema = z.object({
  kind: z.enum(RECORD_ACTIVITY_KINDS),
  at: z.string().datetime(),
  userName: z.string().nullable(),
  details: z.array(RecordDetailSchema).optional(),
});

export type RecordActivity = z.infer<typeof RecordActivitySchema>;
