import { describe, it, expect } from 'vitest';
import { AppError } from '../errors.js';

describe('AppError', () => {
  it('T47-a: has correct code, message, statusCode, and fields', () => {
    const err = new AppError('NOT_FOUND', 'Not found.', 404, { id: 'missing' });
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Not found.');
    expect(err.statusCode).toBe(404);
    expect(err.fields).toEqual({ id: 'missing' });
  });

  it('T47-b: fields is undefined when not provided', () => {
    const err = new AppError('UNAUTHORIZED', 'Auth required.', 401);
    expect(err.fields).toBeUndefined();
  });

  it('T47-c: is an instance of Error with a stack trace', () => {
    const err = new AppError('NOT_FOUND', 'Not found.', 404);
    expect(err).toBeInstanceOf(Error);
    expect(err.stack).toBeDefined();
  });
});
