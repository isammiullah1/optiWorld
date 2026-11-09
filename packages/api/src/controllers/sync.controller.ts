import type { Request, Response } from 'express';
import {
  ResolveConflictSchema,
  SyncPullQuerySchema,
  SyncPushRequestSchema,
  type AuthSessionUser,
} from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import {
  discardOfflineConflict,
  pullChanges,
  pushOfflineInvoices,
  resolveSyncConflict,
} from '../services/sync.service.js';

export function createSyncController(): {
  push: ReturnType<typeof asyncHandler>;
  pull: ReturnType<typeof asyncHandler>;
  resolveConflict: ReturnType<typeof asyncHandler>;
} {
  return {
    push: asyncHandler(async (req: Request, res: Response) => {
      const body = SyncPushRequestSchema.parse(req.body);
      const data = await pushOfflineInvoices(session(req), body.invoices);
      res.status(200).json({ success: true, data });
    }),
    pull: asyncHandler(async (req: Request, res: Response) => {
      const query = SyncPullQuerySchema.parse({
        since: typeof req.query.since === 'string' ? req.query.since : undefined,
      });
      const since = query.since ? new Date(query.since) : null;
      const data = await pullChanges(session(req), since);
      res.status(200).json({ success: true, data });
    }),
    resolveConflict: asyncHandler(async (req: Request, res: Response) => {
      if (isDiscard(req.body)) {
        const data = await discardOfflineConflict(session(req), conflictLocalId(req.body));
        res.status(200).json({ success: true, data });
        return;
      }
      const body = ResolveConflictSchema.parse(normalizeConflictBody(req.body));
      const data = await resolveSyncConflict(session(req), body);
      res.status(200).json({ success: true, data });
    }),
  };
}

function normalizeConflictBody(body: unknown): unknown {
  if (!isRecord(body)) {
    return body;
  }
  const localId = typeof body.localId === 'string' ? body.localId : body.clientLocalId;
  if (body.resolution === 'accept') {
    return { clientLocalId: localId, resolution: 'ACCEPT_SERVER' };
  }
  if (typeof body.localId === 'string' && body.clientLocalId === undefined) {
    return { ...body, clientLocalId: body.localId };
  }
  return body;
}

function isDiscard(body: unknown): boolean {
  return isRecord(body) && body.resolution === 'discard';
}

function conflictLocalId(body: unknown): string {
  if (!isRecord(body)) {
    throw new AppError(422, 'VALIDATION_ERROR', 'A local sale id is required');
  }
  const localId = typeof body.localId === 'string' ? body.localId : body.clientLocalId;
  if (typeof localId !== 'string') {
    throw new AppError(422, 'VALIDATION_ERROR', 'A local sale id is required');
  }
  return localId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function session(req: Request): AuthSessionUser {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  return req.auth;
}
