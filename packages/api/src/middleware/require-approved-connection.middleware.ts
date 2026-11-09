import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '@optiworld/db';
import type { ApprovedConnection, VisibilityMode } from '@optiworld/shared';

import { AppError } from '../lib/errors.js';

export type ConnectionLookup = (input: {
  retailerOrgId: string;
  wholesalerOrgId: string;
}) => Promise<ApprovedConnection | null>;

const defaultLookup: ConnectionLookup = async ({ retailerOrgId, wholesalerOrgId }) => {
  const connection = await prisma.retailerConnection.findFirst({
    where: {
      retailerOrgId,
      wholesalerOrgId,
      status: 'APPROVED',
    },
    select: {
      id: true,
      retailerOrgId: true,
      wholesalerOrgId: true,
      visibilityMode: true,
    },
  });

  if (!connection) {
    return null;
  }

  return {
    id: connection.id,
    retailerOrgId: connection.retailerOrgId,
    wholesalerOrgId: connection.wholesalerOrgId,
    visibilityMode: connection.visibilityMode,
  };
};

/**
 * Price protection gate. The retailer id always comes from the access token.
 * A client-supplied retailer id is ignored. Only an APPROVED connection counts.
 * applyVisibilityMode then hides the catalog or clears listed prices.
 */
export function requireApprovedConnection(
  wholesalerIdParam = 'wholesalerId',
  lookup: ConnectionLookup = defaultLookup,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    void enforceApprovedConnection(req, wholesalerIdParam, lookup).then(
      () => next(),
      (error: unknown) => next(error),
    );
  };
}

async function enforceApprovedConnection(
  req: Request,
  wholesalerIdParam: string,
  lookup: ConnectionLookup,
): Promise<void> {
  const auth = req.auth;
  if (!auth) {
    throw new AppError(401, 'UNAUTHORIZED', 'Sign in is required');
  }

  if (auth.orgType !== 'RETAILER' || !auth.orgId) {
    throw new AppError(403, 'FORBIDDEN', 'Only a retailer can open a wholesaler catalog');
  }

  const wholesalerOrgId = req.params[wholesalerIdParam];
  if (typeof wholesalerOrgId !== 'string' || wholesalerOrgId.length === 0) {
    throw new AppError(422, 'VALIDATION_ERROR', 'A wholesaler id is required');
  }

  const connection = await lookup({
    retailerOrgId: auth.orgId,
    wholesalerOrgId,
  });

  if (!connection) {
    throw new AppError(
      403,
      'CONNECTION_REQUIRED',
      'This wholesaler has not approved your connection',
    );
  }

  req.retailerConnection = connection;
}

export function isVisibilityMode(value: string): value is VisibilityMode {
  return value === 'FULL' || value === 'PRICES_HIDDEN' || value === 'CATALOG_HIDDEN';
}
