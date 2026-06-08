import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../validate.middleware.js';
import { AppError } from '../../lib/errors.js';

const schema = z.object({ name: z.string().min(1) });

describe('validate middleware', () => {
  it('T48-a: calls next() with no arguments when body is valid', () => {
    const req = { body: { name: 'Alice' }, query: {} } as Request;
    const next = vi.fn() as NextFunction;
    validate(schema)(req, {} as Response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it('T48-b: calls next(AppError) with VALIDATION_ERROR when body is invalid', () => {
    const req = { body: { name: '' }, query: {} } as Request;
    const next = vi.fn() as NextFunction;
    validate(schema)(req, {} as Response, next);
    expect(next).toHaveBeenCalledOnce();
    const err = (next as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.statusCode).toBe(400);
    expect(err.fields).toBeDefined();
  });

  it('T48-c: validates req.query when target is "query"', () => {
    const req = { body: {}, query: { name: 'test' } } as unknown as Request;
    const next = vi.fn() as NextFunction;
    validate(schema, 'query')(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('mutates req.body with parsed data on success', () => {
    const trimSchema = z.object({ name: z.string().trim() });
    const req = { body: { name: '  Alice  ' }, query: {} } as Request;
    const next = vi.fn() as NextFunction;
    validate(trimSchema)(req, {} as Response, next);
    expect(req.body.name).toBe('Alice');
  });
});
