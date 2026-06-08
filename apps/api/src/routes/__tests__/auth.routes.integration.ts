import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { getTestPrisma, resetDatabase } from '../../test/integration-setup.js';

const DB_AVAILABLE = Boolean(process.env.DATABASE_URL_TEST);

// Skip entire file when DATABASE_URL_TEST is not configured
beforeAll(async () => {
  if (!DB_AVAILABLE) {
    console.warn('⚠ Skipping integration tests — DATABASE_URL_TEST not set');
  }
});
beforeEach(async () => { if (DB_AVAILABLE) await resetDatabase(); });
afterAll(async () => { if (DB_AVAILABLE) await getTestPrisma().$disconnect(); });

const BASE = '/api/v1/auth';
const VALID_USER = { email: 'alice@example.com', password: 'securePassword123' };

function getSetCookieHeader(res: request.Response): string[] {
  const raw = res.headers['set-cookie'] as string | string[] | undefined;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

async function registerAndGetTokens(): Promise<{ accessToken: string; cookie: string[] }> {
  const res = await request(app).post(`${BASE}/register`).send(VALID_USER);
  return {
    accessToken: res.body.accessToken as string,
    cookie: getSetCookieHeader(res),
  };
}

// ── POST /auth/register ───────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('POST /auth/register', () => {
  it('AUTH-IT-01: returns 201 with accessToken and HttpOnly SameSite=Strict refreshToken cookie', async () => {
    const res = await request(app).post(`${BASE}/register`).send(VALID_USER);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(typeof res.body.accessToken).toBe('string');

    const setCookie = getSetCookieHeader(res);
    expect(setCookie.some((c: string) => c.startsWith('refreshToken='))).toBe(true);
    expect(setCookie.some((c: string) => c.includes('HttpOnly'))).toBe(true);
    expect(setCookie.some((c: string) => c.toLowerCase().includes('samesite=strict'))).toBe(true);
  });

  it('AUTH-IT-02: returns 409 EMAIL_TAKEN when email is already registered', async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
    const res = await request(app).post(`${BASE}/register`).send(VALID_USER);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('AUTH-IT-03: email lookup is case-insensitive — ALICE@EXAMPLE.COM conflicts with alice@example.com', async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ ...VALID_USER, email: 'ALICE@EXAMPLE.COM' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('AUTH-IT-04: returns 400 VALIDATION_ERROR with fields.password for password shorter than 8 chars', async () => {
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ email: 'x@x.com', password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toHaveProperty('password');
  });

  it('AUTH-IT-05: returns 400 VALIDATION_ERROR with fields.email for invalid email format', async () => {
    const res = await request(app)
      .post(`${BASE}/register`)
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toHaveProperty('email');
  });

  it('AUTH-IT-06: stores email lowercase and password as bcrypt hash in DB', async () => {
    await request(app)
      .post(`${BASE}/register`)
      .send({ email: 'UPPER@EXAMPLE.COM', password: 'password123' });

    const user = await getTestPrisma().user.findUnique({ where: { email: 'upper@example.com' } });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe('password123');
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
  });

  it('AUTH-IT-07: returns 200 with accessToken and refreshToken cookie for valid credentials', async () => {
    const res = await request(app).post(`${BASE}/login`).send(VALID_USER);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    const setCookie = getSetCookieHeader(res);
    expect(setCookie.some((c: string) => c.startsWith('refreshToken='))).toBe(true);
  });

  it('AUTH-IT-08: returns 401 INVALID_CREDENTIALS for wrong password — no fields key in error', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ ...VALID_USER, password: 'wrongPassword' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.fields).toBeUndefined();
  });

  it('AUTH-IT-09: returns 401 INVALID_CREDENTIALS for unknown email — identical body to wrong-password case', async () => {
    const res = await request(app)
      .post(`${BASE}/login`)
      .send({ email: 'nobody@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.fields).toBeUndefined();
  });

  it('AUTH-IT-10: new login invalidates the previous refresh token', async () => {
    const { cookie: firstCookie } = await registerAndGetTokens();
    await request(app).post(`${BASE}/login`).send(VALID_USER); // second login revokes first token

    const refreshRes = await request(app).post(`${BASE}/refresh`).set('Cookie', firstCookie);
    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });
});

// ── POST /auth/refresh ────────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('POST /auth/refresh', () => {
  it('AUTH-IT-11: returns 200 with new accessToken and a new refreshToken cookie', async () => {
    const { cookie } = await registerAndGetTokens();
    const res = await request(app).post(`${BASE}/refresh`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    const setCookie = getSetCookieHeader(res);
    expect(setCookie.some((c: string) => c.startsWith('refreshToken='))).toBe(true);
  });

  it('AUTH-IT-12: original cookie is invalid after rotation — second use of same cookie → 401', async () => {
    const { cookie: originalCookie } = await registerAndGetTokens();
    await request(app).post(`${BASE}/refresh`).set('Cookie', originalCookie); // rotate

    const res = await request(app).post(`${BASE}/refresh`).set('Cookie', originalCookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('AUTH-IT-13: returns 401 REFRESH_TOKEN_INVALID when no cookie is sent', async () => {
    const res = await request(app).post(`${BASE}/refresh`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('AUTH-IT-14: returns 401 REFRESH_TOKEN_INVALID for a manually revoked token', async () => {
    const { cookie } = await registerAndGetTokens();
    await request(app).post(`${BASE}/logout`).set('Cookie', cookie); // revoke

    const res = await request(app).post(`${BASE}/refresh`).set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('POST /auth/logout', () => {
  it('AUTH-IT-15: returns 200 with logout message and clears the refreshToken cookie', async () => {
    const { cookie } = await registerAndGetTokens();
    const res = await request(app).post(`${BASE}/logout`).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out' });

    const setCookie = getSetCookieHeader(res);
    const cleared = setCookie.some(
      (c: string) =>
        c.startsWith('refreshToken=') &&
        (c.includes('Max-Age=0') || c.includes('Expires=') || c.includes('refreshToken=;')),
    );
    expect(cleared).toBe(true);
  });

  it('AUTH-IT-16: refresh token is unusable after logout', async () => {
    const { cookie } = await registerAndGetTokens();
    await request(app).post(`${BASE}/logout`).set('Cookie', cookie);

    const res = await request(app).post(`${BASE}/refresh`).set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('AUTH-IT-17: returns 200 even when no cookie is sent — idempotent', async () => {
    const res = await request(app).post(`${BASE}/logout`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out' });
  });
});

// ── POST /auth/forgot-password ────────────────────────────────────────────────

async function triggerForgotPassword(email: string): Promise<string> {
  let capturedOtp = '';
  const spy = vi.spyOn(console, 'log').mockImplementation((msg: unknown) => {
    const match = String(msg).match(/\[OTP\] .+: (\d{6})/);
    if (match) capturedOtp = match[1];
  });
  await request(app).post(`${BASE}/forgot-password`).send({ email });
  spy.mockRestore();
  return capturedOtp;
}

describe.skipIf(!DB_AVAILABLE)('POST /auth/forgot-password', () => {
  it('AUTH-IT-21: returns 200 with generic message for a registered email', async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
    const res = await request(app).post(`${BASE}/forgot-password`).send({ email: VALID_USER.email });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'If registered, an OTP has been sent.' });
  });

  it('AUTH-IT-22: returns 200 with identical message for unknown email — prevents enumeration', async () => {
    const res = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'If registered, an OTP has been sent.' });
  });

  it('AUTH-IT-23: returns 400 VALIDATION_ERROR with fields.email for invalid email format', async () => {
    const res = await request(app)
      .post(`${BASE}/forgot-password`)
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toHaveProperty('email');
  });

  it('AUTH-IT-24: creates OTP record in DB for a registered user', async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
    await triggerForgotPassword(VALID_USER.email);

    const user = await getTestPrisma().user.findUnique({ where: { email: VALID_USER.email } });
    const otpRecord = await getTestPrisma().passwordResetOTP.findFirst({
      where: { userId: user!.id, usedAt: null },
    });
    expect(otpRecord).not.toBeNull();
    expect(otpRecord!.code).toMatch(/^\d{6}$/);
    expect(otpRecord!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

// ── POST /auth/reset-password ─────────────────────────────────────────────────

describe.skipIf(!DB_AVAILABLE)('POST /auth/reset-password', () => {
  it('AUTH-IT-25: returns 200 and password updated message for valid email + OTP + newPassword', async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
    const otp = await triggerForgotPassword(VALID_USER.email);

    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ email: VALID_USER.email, otp, newPassword: 'newSecurePass1' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Password updated.' });
  });

  it('AUTH-IT-26: returns 400 OTP_INVALID for a wrong OTP code', async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
    await triggerForgotPassword(VALID_USER.email);

    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ email: VALID_USER.email, otp: '000000', newPassword: 'newSecurePass1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_INVALID');
  });

  it('AUTH-IT-27: returns 400 OTP_INVALID for unknown email — prevents enumeration', async () => {
    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ email: 'nobody@example.com', otp: '123456', newPassword: 'newSecurePass1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_INVALID');
  });

  it('AUTH-IT-28: returns 400 OTP_EXPIRED for an expired OTP', async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
    const user = await getTestPrisma().user.findUnique({ where: { email: VALID_USER.email } });
    await getTestPrisma().passwordResetOTP.create({
      data: { userId: user!.id, code: '999999', expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ email: VALID_USER.email, otp: '999999', newPassword: 'newSecurePass1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_EXPIRED');
  });

  it('AUTH-IT-29: returns 400 OTP_USED when the same OTP is submitted twice', async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
    const otp = await triggerForgotPassword(VALID_USER.email);

    await request(app)
      .post(`${BASE}/reset-password`)
      .send({ email: VALID_USER.email, otp, newPassword: 'newSecurePass1' });

    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ email: VALID_USER.email, otp, newPassword: 'anotherNewPass1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OTP_USED');
  });

  it('AUTH-IT-30: all active refresh tokens are revoked after a successful reset', async () => {
    const { cookie } = await registerAndGetTokens();
    const otp = await triggerForgotPassword(VALID_USER.email);

    await request(app)
      .post(`${BASE}/reset-password`)
      .send({ email: VALID_USER.email, otp, newPassword: 'newSecurePass1' });

    const res = await request(app).post(`${BASE}/refresh`).set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('AUTH-IT-31: old password rejected and new password accepted after reset', async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
    const otp = await triggerForgotPassword(VALID_USER.email);
    const newPassword = 'newSecurePass1';

    await request(app)
      .post(`${BASE}/reset-password`)
      .send({ email: VALID_USER.email, otp, newPassword });

    const oldPwRes = await request(app)
      .post(`${BASE}/login`)
      .send({ email: VALID_USER.email, password: VALID_USER.password });
    expect(oldPwRes.status).toBe(401);

    const newPwRes = await request(app)
      .post(`${BASE}/login`)
      .send({ email: VALID_USER.email, password: newPassword });
    expect(newPwRes.status).toBe(200);
    expect(newPwRes.body).toHaveProperty('accessToken');
  });

  it('AUTH-IT-32: returns 400 VALIDATION_ERROR for invalid request body', async () => {
    const res = await request(app)
      .post(`${BASE}/reset-password`)
      .send({ email: 'not-an-email', otp: '12345', newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

// ── authenticate middleware (smoke tests via /notes) ─────────────────────────

describe.skipIf(!DB_AVAILABLE)('authenticate middleware', () => {
  it('AUTH-IT-18: valid accessToken allows access to a protected route (not 401)', async () => {
    const { accessToken } = await registerAndGetTokens();
    const res = await request(app)
      .get('/api/v1/notes')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).not.toBe(401);
  });

  it('AUTH-IT-19: invalid token string returns 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .get('/api/v1/notes')
      .set('Authorization', 'Bearer invalid.token.here');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('AUTH-IT-20: missing Authorization header returns 401 UNAUTHORIZED', async () => {
    const res = await request(app).get('/api/v1/notes');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
