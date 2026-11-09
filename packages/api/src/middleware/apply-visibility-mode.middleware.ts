import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../lib/errors.js';

/**
 * Second half of Price Protection. requireApprovedConnection has already
 * confirmed an APPROVED connection. CATALOG_HIDDEN stops the request.
 * PRICES_HIDDEN keeps the products and clears listedPrice on the way out.
 */
export function applyVisibilityMode(req: Request, res: Response, next: NextFunction): void {
  const connection = req.retailerConnection;
  if (!connection) {
    next(
      new AppError(403, 'CONNECTION_REQUIRED', 'This wholesaler has not approved your connection'),
    );
    return;
  }

  if (connection.visibilityMode === 'CATALOG_HIDDEN') {
    next(new AppError(403, 'CATALOG_HIDDEN', 'This wholesaler has hidden their catalog'));
    return;
  }

  if (connection.visibilityMode === 'PRICES_HIDDEN') {
    const send = res.json.bind(res);
    res.json = ((body?: unknown) => send(hideListedPrices(body))) as Response['json'];
  }

  next();
}

function hideListedPrices(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(hideListedPrices);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    next[key] = key === 'listedPrice' ? null : hideListedPrices(child);
  }
  return next;
}
