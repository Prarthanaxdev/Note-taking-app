import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../lib/errors.js';
import { generateOtp } from '../../lib/otp.js';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    passwordResetOTP: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        refreshToken: { update: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
        passwordResetOTP: { updateMany: vi.fn(), create: vi.fn(), update: vi.fn() },
        user: { update: vi.fn() },
      }),
    ),
  },
}));

vi.mock('../../lib/jwt.js', () => ({
  signAccessToken: vi.fn().mockReturnValue('mock-access-token'),
}));

vi.mock('../../lib/hash.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed-password'),
  comparePassword: vi.fn(),
}));

vi.mock('../../lib/otp.js', () => ({
  generateOtp: vi.fn().mockReturnValue('123456'),
}));

import { prisma } from '../../lib/prisma.js';
import { comparePassword, hashPassword } from '../../lib/hash.js';
import { register, login, logout, refreshTokens, forgotPassword, resetPassword } from '../auth.service.js';

type MockPrisma = {
  user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  refreshToken: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  passwordResetOTP: {
    updateMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};


const mockPrisma = prisma as unknown as MockPrisma;

beforeEach(() => vi.clearAllMocks());

// ── register ─────────────────────────────────────────────────────────────────

describe('register', () => {
  it('AUTH-UT-01: returns accessToken and 64-char rawRefreshToken for valid inputs', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'uid-1', email: 'alice@example.com' });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const result = await register('alice@example.com', 'password123');
    expect(result.accessToken).toBe('mock-access-token');
    expect(result.rawRefreshToken).toHaveLength(64);
  });

  it('AUTH-UT-02: throws EMAIL_TAKEN (409) when email already exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'alice@example.com' });

    await expect(register('alice@example.com', 'password123')).rejects.toThrow(
      expect.objectContaining({ code: 'EMAIL_TAKEN', statusCode: 409 }),
    );
  });

  it('AUTH-UT-03: stores bcrypt hash, not the raw password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'uid-1', email: 'alice@example.com' });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    await register('alice@example.com', 'password123');

    const createCall = mockPrisma.user.create.mock.calls[0][0] as { data: { passwordHash: string } };
    expect(createCall.data.passwordHash).toBe('hashed-password');
    expect(createCall.data.passwordHash).not.toBe('password123');
  });

  it('AUTH-UT-04: normalises email to lowercase and trimmed', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'uid-1', email: 'alice@example.com' });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    await register('  ALICE@Example.COM  ', 'password123');

    const createCall = mockPrisma.user.create.mock.calls[0][0] as { data: { email: string } };
    expect(createCall.data.email).toBe('alice@example.com');
  });
});

// ── login ─────────────────────────────────────────────────────────────────────

describe('login', () => {
  it('AUTH-UT-05: returns tokens and revokes prior tokens for valid credentials', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'uid-1',
      email: 'alice@example.com',
      passwordHash: 'hashed-password',
    });
    vi.mocked(comparePassword).mockResolvedValue(true);
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const result = await login('alice@example.com', 'password123');
    expect(result.accessToken).toBe('mock-access-token');
    expect(result.rawRefreshToken).toHaveLength(64);
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'uid-1', revokedAt: null } }),
    );
  });

  it('AUTH-UT-06: throws INVALID_CREDENTIALS (401) for unknown email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    vi.mocked(comparePassword).mockResolvedValue(false);

    await expect(login('nobody@example.com', 'password123')).rejects.toThrow(
      expect.objectContaining({ code: 'INVALID_CREDENTIALS', statusCode: 401 }),
    );
  });

  it('AUTH-UT-07: throws INVALID_CREDENTIALS for wrong password — identical error to unknown email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'uid-1',
      email: 'alice@example.com',
      passwordHash: 'hashed-password',
    });
    vi.mocked(comparePassword).mockResolvedValue(false);

    const err = await login('alice@example.com', 'wrongPassword').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('INVALID_CREDENTIALS');
    expect((err as AppError).fields).toBeUndefined();
  });

  it('AUTH-UT-08: calls updateMany before create — prior tokens revoked before new one issued', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'uid-1',
      email: 'alice@example.com',
      passwordHash: 'hashed-password',
    });
    vi.mocked(comparePassword).mockResolvedValue(true);
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    await login('alice@example.com', 'password123');

    const updateOrder = mockPrisma.refreshToken.updateMany.mock.invocationCallOrder[0];
    const createOrder = mockPrisma.refreshToken.create.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(createOrder);
  });
});

// ── refreshTokens ─────────────────────────────────────────────────────────────

describe('refreshTokens', () => {
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  it('AUTH-UT-09: returns new tokens and calls $transaction to rotate atomically', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      revokedAt: null,
      expiresAt: futureDate,
      user: { id: 'uid-1', email: 'alice@example.com' },
    });

    const result = await refreshTokens('a'.repeat(64));
    expect(result.accessToken).toBe('mock-access-token');
    expect(result.rawRefreshToken).toHaveLength(64);
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });

  it('AUTH-UT-10: throws REFRESH_TOKEN_INVALID when token not in DB', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(refreshTokens('nonexistent')).rejects.toThrow(
      expect.objectContaining({ code: 'REFRESH_TOKEN_INVALID', statusCode: 401 }),
    );
  });

  it('AUTH-UT-11: throws REFRESH_TOKEN_INVALID when token is revoked', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      revokedAt: new Date(),
      expiresAt: futureDate,
      user: { id: 'uid-1', email: 'alice@example.com' },
    });

    await expect(refreshTokens('a'.repeat(64))).rejects.toThrow(
      expect.objectContaining({ code: 'REFRESH_TOKEN_INVALID' }),
    );
  });

  it('AUTH-UT-12: throws REFRESH_TOKEN_INVALID when token is expired', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      user: { id: 'uid-1', email: 'alice@example.com' },
    });

    await expect(refreshTokens('a'.repeat(64))).rejects.toThrow(
      expect.objectContaining({ code: 'REFRESH_TOKEN_INVALID' }),
    );
  });
});

// ── logout ────────────────────────────────────────────────────────────────────

describe('logout', () => {
  it('AUTH-UT-13: sets revokedAt on the matching refresh token', async () => {
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

    await logout('a'.repeat(64));

    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
    );
  });

  it('AUTH-UT-14: is a no-op and does not throw when rawRefreshToken is undefined', async () => {
    await expect(logout(undefined)).resolves.toBeUndefined();
    expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('AUTH-UT-15: rawRefreshToken from issueTokens is a 64-char hex string', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'uid-1', email: 'alice@example.com' });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const { rawRefreshToken } = await register('alice@example.com', 'password123');
    expect(rawRefreshToken).toHaveLength(64);
    expect(rawRefreshToken).toMatch(/^[0-9a-f]+$/);
  });
});

// ── forgotPassword ────────────────────────────────────────────────────────────

describe('forgotPassword', () => {
  beforeEach(() => {
    vi.mocked(generateOtp).mockReturnValue('123456');
  });

  it('AUTH-UT-25: resolves silently without calling $transaction when user is not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(forgotPassword('nobody@test.com')).resolves.toBeUndefined();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('AUTH-UT-26: calls $transaction once and logs OTP to console.log when user exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'a@b.com' });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await forgotPassword('a@b.com');

    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('123456'));
    consoleSpy.mockRestore();
  });

  it('AUTH-UT-27: invalidates prior OTPs before creating new one within the transaction', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'a@b.com' });
    const callOrder: string[] = [];
    const txUpdateMany = vi.fn().mockImplementation(() => {
      callOrder.push('updateMany');
      return Promise.resolve({ count: 1 });
    });
    const txCreate = vi.fn().mockImplementation(() => {
      callOrder.push('create');
      return Promise.resolve({});
    });
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ passwordResetOTP: { updateMany: txUpdateMany, create: txCreate } }),
    );

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await forgotPassword('a@b.com');

    expect(callOrder[0]).toBe('updateMany');
    expect(callOrder[1]).toBe('create');
    consoleSpy.mockRestore();
  });

  it('AUTH-UT-28: creates OTP record with code from generateOtp mock ("123456")', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'a@b.com' });
    const txCreate = vi.fn().mockResolvedValue({});
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ passwordResetOTP: { updateMany: vi.fn().mockResolvedValue({}), create: txCreate } }),
    );

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await forgotPassword('a@b.com');

    expect(txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: '123456' }) }),
    );
    consoleSpy.mockRestore();
  });

  it('AUTH-UT-29: OTP expiresAt is approximately now + 15 minutes', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'a@b.com' });
    let capturedData: Record<string, unknown> | undefined;
    const txCreate = vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
      capturedData = args.data;
      return Promise.resolve({});
    });
    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ passwordResetOTP: { updateMany: vi.fn().mockResolvedValue({}), create: txCreate } }),
    );

    const before = Date.now();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await forgotPassword('a@b.com');

    const expiresAt = capturedData?.expiresAt as Date;
    const expectedMs = before + 15 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMs - 1000);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(expectedMs + 5000);
    consoleSpy.mockRestore();
  });
});

// ── resetPassword ─────────────────────────────────────────────────────────────

describe('resetPassword', () => {
  const futureDate = new Date(Date.now() + 15 * 60 * 1000);

  it('AUTH-UT-30: throws OTP_INVALID (400) when user is not found', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(resetPassword('nobody@test.com', '123456', 'newpass123')).rejects.toThrow(
      expect.objectContaining({ code: 'OTP_INVALID', statusCode: 400 }),
    );
  });

  it('AUTH-UT-31: throws OTP_INVALID (400) when OTP record does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'a@b.com' });
    mockPrisma.passwordResetOTP.findFirst.mockResolvedValue(null);

    await expect(resetPassword('a@b.com', '000000', 'newpass123')).rejects.toThrow(
      expect.objectContaining({ code: 'OTP_INVALID', statusCode: 400 }),
    );
  });

  it('AUTH-UT-32: throws OTP_EXPIRED (400) when OTP is expired', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'a@b.com' });
    mockPrisma.passwordResetOTP.findFirst.mockResolvedValue({
      id: 'otp-1',
      code: '123456',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(resetPassword('a@b.com', '123456', 'newpass123')).rejects.toThrow(
      expect.objectContaining({ code: 'OTP_EXPIRED', statusCode: 400 }),
    );
  });

  it('AUTH-UT-33: throws OTP_USED (400) when OTP has already been used', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'a@b.com' });
    mockPrisma.passwordResetOTP.findFirst.mockResolvedValue({
      id: 'otp-1',
      code: '123456',
      usedAt: new Date(),
      expiresAt: futureDate,
    });

    await expect(resetPassword('a@b.com', '123456', 'newpass123')).rejects.toThrow(
      expect.objectContaining({ code: 'OTP_USED', statusCode: 400 }),
    );
  });

  it('AUTH-UT-34b: throws OTP_EXPIRED (not OTP_USED) when OTP is both expired and used', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'a@b.com' });
    mockPrisma.passwordResetOTP.findFirst.mockResolvedValue({
      id: 'otp-1',
      code: '123456',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() - 1000),
    });

    const err = await resetPassword('a@b.com', '123456', 'newpass123').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('OTP_EXPIRED');
  });

  it('AUTH-UT-35b: resolves and calls $transaction for a valid OTP', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'a@b.com' });
    mockPrisma.passwordResetOTP.findFirst.mockResolvedValue({
      id: 'otp-1',
      code: '123456',
      usedAt: null,
      expiresAt: futureDate,
    });

    await expect(resetPassword('a@b.com', '123456', 'newpass123')).resolves.toBeUndefined();
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
  });

  it('AUTH-UT-36b: all three operations are called within the $transaction callback', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'a@b.com' });
    mockPrisma.passwordResetOTP.findFirst.mockResolvedValue({
      id: 'otp-1',
      code: '123456',
      usedAt: null,
      expiresAt: futureDate,
    });
    // Explicitly set hashPassword return value for this test to avoid mock state drift
    vi.mocked(hashPassword).mockResolvedValue('hashed-password');

    const txOtpUpdate = vi.fn().mockResolvedValue({});
    const txUserUpdate = vi.fn().mockResolvedValue({});
    const txTokenUpdateMany = vi.fn().mockResolvedValue({ count: 0 });

    mockPrisma.$transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          passwordResetOTP: { update: txOtpUpdate, updateMany: vi.fn(), create: vi.fn() },
          user: { update: txUserUpdate },
          refreshToken: { updateMany: txTokenUpdateMany, update: vi.fn(), create: vi.fn() },
        }),
    );

    await resetPassword('a@b.com', '123456', 'newpass123');

    expect(txOtpUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'otp-1' }, data: { usedAt: expect.any(Date) } }),
    );
    expect(txUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'uid-1' }, data: { passwordHash: 'hashed-password' } }),
    );
    expect(txTokenUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'uid-1', revokedAt: null }, data: { revokedAt: expect.any(Date) } }),
    );
  });
});
