import type { Request, Response } from 'express';
import {
  ImportTemplateSchema,
  ImportWorkbookSchema,
  type AuthSessionUser,
} from '@optiworld/shared';

import { asyncHandler } from '../lib/async-handler.js';
import { AppError } from '../lib/errors.js';
import { importWorkbook, workbookTemplate, type ImportKind } from '../services/import.service.js';

export function createImportController() {
  return {
    template: asyncHandler(async (req: Request, res: Response) => {
      const { kind } = ImportTemplateSchema.parse(req.params);
      const file = await workbookTemplate(kind);
      res.setHeader(
        'content-type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('content-disposition', `attachment; filename="${kind}-template.xlsx"`);
      res.status(200).send(file);
    }),
    customers: workbookHandler('customers'),
    inventory: workbookHandler('inventory'),
    dues: workbookHandler('dues'),
  };
}

function workbookHandler(kind: ImportKind) {
  return asyncHandler(async (req: Request, res: Response) => {
    const body = ImportWorkbookSchema.parse(req.body);
    const data = await importWorkbook(session(req), kind, body.fileBase64, body.preview === true);
    res.status(200).json({ success: true, data });
  });
}

function session(req: Request): AuthSessionUser {
  if (!req.auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }
  return req.auth;
}
