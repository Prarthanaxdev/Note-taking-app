import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../../lib/errors.js';
import { authenticate } from '../auth.middleware.js';

const TEST_SECRET = 'test-secret-at-least-32-characters-long!!';

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.JWT_EXPIRES_IN = '15m';
});

function makeReq(authHeader?: string): Request {
  return { headers: { authorization: authHeader } } as unknown as Request;
}

describe('authenticate middleware', () => {
  it('AUTH-UT-21: populates req.user and calls next() with no args for a valid Bearer token', () => {
    const token = jwt.sign(
      { sub: 'uid-1', email: 'alice@example.com' },
      TEST_SECRET,
      { expiresIn: '15m' },
    );
    const req = makeReq(`Bearer ${token}`);
    const next = vi.fn();

    authenticate(req, {} as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
    expect((req as unknown as { user: { id: string; email: string } }).user).toEqual({
      id: 'uid-1',
      email: 'alice@example.com',
    });
  });

  it('AUTH-UT-22: calls next(AppError UNAUTHORIZED) when Authorization header is missing', () => {
    const next = vi.fn();

    authenticate(makeReq(undefined), {} as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('UNAUTHORIZED');
    expect((err as AppError).statusCode).toBe(401);
  });

  it('AUTH-UT-23: calls next(AppError UNAUTHORIZED) when header does not start with "Bearer "', () => {
    const next = vi.fn();

    authenticate(makeReq('Basic dXNlcjpwYXNz'), {} as Response, next as unknown as NextFunction);

    const err = next.mock.calls[0][0];
    expect((err as AppError).code).toBe('UNAUTHORIZED');
  });

  it('AUTH-UT-24: calls next(AppError UNAUTHORIZED) for an expired JWT', () => {
    const expired = jwt.sign(
      { sub: 'uid-1', email: 'alice@example.com' },
      TEST_SECRET,
      { expiresIn: -1 },
    );
    const next = vi.fn();

    authenticate(makeReq(`Bearer ${expired}`), {} as Response, next as unknown as NextFunction);

    const err = next.mock.calls[0][0];
    expect((err as AppError).code).toBe('UNAUTHORIZED');
  });
});
