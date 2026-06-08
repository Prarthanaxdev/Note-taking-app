import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../lib/errors.js';

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
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        refreshToken: {
          update: vi.fn(),
          create: vi.fn(),
        },
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

import { prisma } from '../../lib/prisma.js';
import { comparePassword } from '../../lib/hash.js';
import { register, login, logout, refreshTokens } from '../auth.service.js';

type MockPrisma = {
  user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  refreshToken: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
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
