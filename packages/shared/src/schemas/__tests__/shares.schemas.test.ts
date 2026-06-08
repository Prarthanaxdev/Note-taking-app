import { describe, it, expect } from 'vitest';
import { CreateShareSchema } from '../shares.schemas.js';

describe('CreateShareSchema', () => {
  it('T46-a: parses valid ISO 8601 datetime', () => {
    const result = CreateShareSchema.safeParse({ expiresAt: '2026-12-31T23:59:59.000Z' });
    expect(result.success).toBe(true);
  });

  it('T46-b: parses without expiresAt (optional)', () => {
    const result = CreateShareSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('T46-c: rejects non-datetime string', () => {
    const result = CreateShareSchema.safeParse({ expiresAt: 'not-a-date' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('expiresAt');
    }
  });
});
