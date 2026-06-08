import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAccessToken, verifyAccessToken } from '../jwt.js';
import { AppError } from '../errors.js';

const TEST_SECRET = 'test-secret-at-least-32-characters-long!!';

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.JWT_EXPIRES_IN = '15m';
});

describe('jwt helpers', () => {
  it('AUTH-UT-16: round-trips userId and email through sign → verify', () => {
    const token = signAccessToken('user-123', 'alice@example.com');
    const result = verifyAccessToken(token);
    expect(result).toEqual({ id: 'user-123', email: 'alice@example.com' });
  });

  it('AUTH-UT-17: throws UNAUTHORIZED for a tampered token', () => {
    const token = signAccessToken('user-123', 'alice@example.com');
    expect(() => verifyAccessToken(token + 'tamper')).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED', statusCode: 401 }),
    );
  });

  it('AUTH-UT-18: throws UNAUTHORIZED for an expired token', () => {
    const expired = jwt.sign(
      { sub: 'user-123', email: 'alice@example.com' },
      TEST_SECRET,
      { expiresIn: -1 },
    );
    expect(() => verifyAccessToken(expired)).toThrow(
      expect.objectContaining({ code: 'UNAUTHORIZED', statusCode: 401 }),
    );
  });

  it('throws UNAUTHORIZED for a completely malformed token', () => {
    expect(() => verifyAccessToken('not.a.jwt')).toThrow(AppError);
  });
});
