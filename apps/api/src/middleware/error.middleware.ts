import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors.js';

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      code: err.code,
      message: err.message,
    };
    if (err.fields) body.fields = err.fields;
    res.status(err.statusCode).json({ error: body });
    return;
  }

  console.error('Unhandled error:', err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}
