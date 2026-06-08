import { createHash, randomBytes } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { signAccessToken } from '../lib/jwt.js';
import { hashPassword, comparePassword } from '../lib/hash.js';

const hashToken = (raw: string): string =>
  createHash('sha256').update(raw).digest('hex');

function refreshExpiresAt(): Date {
  const days = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 7);
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function issueTokens(
  userId: string,
  email: string,
): Promise<{ accessToken: string; rawRefreshToken: string }> {
  const rawRefreshToken = randomBytes(32).toString('hex');
  await prisma.refreshToken.create({
    data: { token: hashToken(rawRefreshToken), userId, expiresAt: refreshExpiresAt() },
  });
  return { accessToken: signAccessToken(userId, email), rawRefreshToken };
}

export async function register(
  email: string,
  password: string,
): Promise<{ accessToken: string; rawRefreshToken: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409);
  }
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email: normalizedEmail, passwordHash } });
  return issueTokens(user.id, user.email);
}

export async function login(
  email: string,
  password: string,
): Promise<{ accessToken: string; rawRefreshToken: string }> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  // Always compare to prevent timing-based email enumeration
  const passwordMatch = user ? await comparePassword(password, user.passwordHash) : false;
  if (!user || !passwordMatch) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }
  // Revoke all prior refresh tokens (BR-AUTH-05: single active session)
  await prisma.refreshToken.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return issueTokens(user.id, user.email);
}

export async function refreshTokens(
  rawRefreshToken: string,
): Promise<{ accessToken: string; rawRefreshToken: string }> {
  const tokenHash = hashToken(rawRefreshToken);
  const now = new Date();

  const existing = await prisma.refreshToken.findUnique({
    where: { token: tokenHash },
    include: { user: { select: { id: true, email: true } } },
  });

  if (!existing || existing.revokedAt !== null || existing.expiresAt <= now) {
    throw new AppError('REFRESH_TOKEN_INVALID', 'Your session has expired. Please log in again.', 401);
  }

  const { user } = existing;
  const newRawToken = randomBytes(32).toString('hex');

  // Callback-style transaction required here — async ops inside need it
  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: now } });
    await tx.refreshToken.create({
      data: { token: hashToken(newRawToken), userId: user.id, expiresAt: refreshExpiresAt() },
    });
  });

  return { accessToken: signAccessToken(user.id, user.email), rawRefreshToken: newRawToken };
}

export async function logout(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) return;
  await prisma.refreshToken.updateMany({
    where: { token: hashToken(rawRefreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
