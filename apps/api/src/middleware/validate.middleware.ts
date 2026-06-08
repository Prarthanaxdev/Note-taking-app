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
      Object.assign(req.query, result.data);
    }
    next();
  };
}
