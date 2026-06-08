import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../lib/errors.js';
import { errorMiddleware } from '../error.middleware.js';

describe('errorMiddleware', () => {
  it('T49-a: maps AppError to correct HTTP status and response envelope', () => {
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
    const err = new AppError('NOT_FOUND', 'Not found.', 404);
    errorMiddleware(err, {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: { code: 'NOT_FOUND', message: 'Not found.' } });
  });

  it('T49-b: includes fields in response when AppError has fields', () => {
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
    const err = new AppError('VALIDATION_ERROR', 'Invalid.', 400, { email: 'Required' });
    errorMiddleware(err, {} as Request, res, vi.fn() as NextFunction);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid.', fields: { email: 'Required' } },
    });
  });

  it('T49-c: returns 500 for unknown errors without exposing internal details', () => {
    const json = vi.fn();
    const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response;
    const err = new Error('Database crash');
    errorMiddleware(err, {} as Request, res, vi.fn() as NextFunction);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.stack).toBeUndefined();
    expect(body.error.message).not.toContain('Database');
  });
});
