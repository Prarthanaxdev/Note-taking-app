import { describe, it, expect, vi, afterEach } from 'vitest';

// Hoisted mock so generateOtp picks up the mock before module load
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});

import { randomInt } from 'crypto';
import { generateOtp } from '../otp.js';

const mockRandomInt = vi.mocked(randomInt);

afterEach(() => {
  mockRandomInt.mockRestore();
});

describe('generateOtp', () => {
  it('AUTH-UT-34: every result matches /^\\d{6}$/ across 100 calls', () => {
    // restore to real implementation for this test
    mockRandomInt.mockRestore();
    for (let i = 0; i < 100; i++) {
      expect(generateOtp()).toMatch(/^\d{6}$/);
    }
  });

  it('AUTH-UT-35: result is always exactly 6 characters', () => {
    mockRandomInt.mockRestore();
    for (let i = 0; i < 20; i++) {
      expect(generateOtp()).toHaveLength(6);
    }
  });

  it('AUTH-UT-36: pads low values — randomInt returns 42 → "000042"', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRandomInt.mockImplementation((() => 42) as any);
    expect(generateOtp()).toBe('000042');
  });

  it('AUTH-UT-37: does not pad high values — randomInt returns 999999 → "999999"', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockRandomInt.mockImplementation((() => 999999) as any);
    expect(generateOtp()).toBe('999999');
  });
});
