import { z } from 'zod';

export const RetailerShellSchema = z.object({
  orgName: z.string(),
  unreadAlertCount: z.number().int().nonnegative(),
  activeJobCount: z.number().int().nonnegative(),
  pendingLabRequestCount: z.number().int().nonnegative(),
});

export type RetailerShellSummary = z.infer<typeof RetailerShellSchema>;
