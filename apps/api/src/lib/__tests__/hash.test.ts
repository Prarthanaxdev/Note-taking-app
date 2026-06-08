import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword } from '../hash.js';

describe('hash helpers', () => {
  it('AUTH-UT-19: hashed password matches original via comparePassword', async () => {
    const hash = await hashPassword('myPassword123');
    await expect(comparePassword('myPassword123', hash)).resolves.toBe(true);
  });

  it('AUTH-UT-20: wrong password does not match', async () => {
    const hash = await hashPassword('myPassword123');
    await expect(comparePassword('wrongPassword', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same input (random salt)', async () => {
    const hash1 = await hashPassword('samePassword');
    const hash2 = await hashPassword('samePassword');
    expect(hash1).not.toBe(hash2);
  });

  it('hash is never equal to the raw password', async () => {
    const plain = 'myPassword123';
    const hash = await hashPassword(plain);
    expect(hash).not.toBe(plain);
  });
});
