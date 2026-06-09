import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../lib/errors.js';

type ValidateTarget = 'body' | 'query';

export function validate(schema: ZodTypeAny, target: ValidateTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const fields: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.');
        if (key) fields[key] = issue.message;
      }
      next(new AppError('VALIDATION_ERROR', 'Invalid input.', 400, fields));
      return;
    }
    if (target === 'body') {
      req.body = result.data as Record<string, unknown>;
    } else {
      // Express v5: req.query is a prototype getter that re-parses on every access.
      // Shadow it with an own property so the coerced values (e.g. numbers from
      // z.coerce.number()) are visible to route handlers instead of raw strings.
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        configurable: true,
      });
    }
    next();
  };
}
