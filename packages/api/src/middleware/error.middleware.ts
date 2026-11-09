import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { ERROR_CODES } from '@optiworld/shared';

import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Validation failed',
        details: error.flatten(),
      },
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
    return;
  }

  logger.error('Unhandled API error', {
    message: error instanceof Error ? error.message : 'Unknown error',
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    },
  });
}
