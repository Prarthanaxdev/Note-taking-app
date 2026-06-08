import type { Request, Response, NextFunction } from 'express';
import type { UserProfile } from 'shared';
import { AppError } from '../lib/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: UserProfile;
    }
  }
}

// AB-1002: Replace with real JWT verification
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError('UNAUTHORIZED', 'Authentication required.', 401));
    return;
  }
  // AB-1002 will verify the JWT and populate req.user
  next(new AppError('UNAUTHORIZED', 'Authentication required.', 401));
}
