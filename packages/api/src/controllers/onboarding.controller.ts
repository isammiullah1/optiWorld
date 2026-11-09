import type { Request, Response } from 'express';
import {
  AcceptInviteSchema,
  CompleteOnboardingSchema,
  InvitePreviewQuerySchema,
} from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import {
  acceptOrganisationInvite,
  previewOrganisationInvite,
} from '../services/admin-organisations.service.js';
import { completeOnboarding } from '../services/onboarding.service.js';

export function createOnboardingController() {
  return {
    complete: asyncHandler(async (req: Request, res: Response) => {
      const body = CompleteOnboardingSchema.parse(req.body);
      const data = await completeOnboarding(body);
      res.status(201).json({ success: true, data });
    }),
    previewInvite: asyncHandler(async (req: Request, res: Response) => {
      const query = InvitePreviewQuerySchema.parse(cleanQuery(req.query));
      const data = await previewOrganisationInvite(query.token);
      res.status(200).json({ success: true, data });
    }),
    acceptInvite: asyncHandler(async (req: Request, res: Response) => {
      const body = AcceptInviteSchema.parse(req.body);
      const data = await acceptOrganisationInvite(body);
      res.status(201).json({ success: true, data });
    }),
  };
}

function cleanQuery(query: Request['query']): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === 'string' && value.length > 0) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}
