# Implementation Plan — AB-1002: Core Authentication

| Field | Value |
|---|---|
| Ticket | AB-1002 |
| Status | **Awaiting Approval** |
| Scope | `apps/api/src/` only — no schema changes, no new deps, no frontend |
| Depends on | AB-1001 (completed — all stubs, Prisma schema, deps installed) |
| Unblocks | AB-1003 (`auth.service` extended for OTP), AB-1010 (frontend auth hooks) |

---

## Codebase Scan Findings

Confirmed from reading every relevant file:

| Finding | Impact on this plan |
|---|---|
| `authRouter` is already mounted in `index.ts` at `/api/v1/auth` | No change to `index.ts` needed |
| `authLimiter` / `forgotPasswordLimiter` already exported from `rateLimit.middleware.ts` | Import directly — no duplication |
| `auth.middleware.ts` has the correct `declare global` for `req.user: UserProfile` | Keep as-is; only replace the stub body |
| `validate.middleware.ts` factory pattern is working and tested | Use directly via `validate(RegisterSchema)` |
| `AppError` in `lib/errors.ts` takes `AppErrorCode` from `shared` | All 4 auth codes already in the union — no shared changes needed |
| All 4 Zod schemas (`RegisterSchema`, `LoginSchema`, etc.) and `AuthResponse`, `UserProfile` types are correct in `packages/shared` | Zero shared-package changes needed |
| `vitest.config.ts` excludes `src/routes/**` and `src/middleware/auth.middleware.ts` from coverage | Must remove `auth.middleware.ts` exclusion; routes stay excluded (thin, tested via integration) |
| **⚠️ `.env.example` bug**: `REFRESH_TOKEN_EXPIRES_DAYS=30` — contradicts FRS BR-AUTH-04 ("exactly 7 days") | Fix to `7` in `.env.example`; code defaults to `7` |
| `BCRYPT_ROUNDS` missing from `.env.example` | Add it |
| Module system: `NodeNext` — all internal imports need `.js` extension | Every import in new files must use `.js` suffix |
| `bcryptjs` and `jsonwebtoken` already in `package.json` with type definitions | No `pnpm add` needed |
| vitest `include` covers `*.test.ts` and `*.integration.ts` (single project, no multi-project split) | Integration files named `*.integration.ts`, not `*.integration-spec.ts` |

---

## Files to Create

| File | Type | Purpose |
|---|---|---|
| `apps/api/src/lib/jwt.ts` | New | `signAccessToken`, `verifyAccessToken` |
| `apps/api/src/lib/hash.ts` | New | `hashPassword`, `comparePassword` |
| `apps/api/src/services/auth.service.ts` | New | All auth business logic |
| `apps/api/src/test/integration-setup.ts` | New | Shared test setup: Prisma client for `nta_test`, `TRUNCATE` in `beforeEach` |
| `apps/api/src/lib/__tests__/jwt.test.ts` | New | Unit tests for JWT helpers |
| `apps/api/src/lib/__tests__/hash.test.ts` | New | Unit tests for bcrypt helpers |
| `apps/api/src/services/__tests__/auth.service.test.ts` | New | Unit tests for auth service (mocked Prisma) |
| `apps/api/src/middleware/__tests__/auth.middleware.test.ts` | New | Unit tests for authenticate middleware |
| `apps/api/src/routes/__tests__/auth.routes.integration.ts` | New | Integration tests — real `nta_test` DB via Supertest |

## Files to Modify

| File | Change |
|---|---|
| `apps/api/src/middleware/auth.middleware.ts` | Replace stub body with real JWT verification |
| `apps/api/src/routes/auth.routes.ts` | Replace empty Router stub with real route definitions |
| `apps/api/vitest.config.ts` | Remove `auth.middleware.ts` from coverage exclusions |
| `apps/api/.env.example` | Fix `REFRESH_TOKEN_EXPIRES_DAYS=30→7`; add `BCRYPT_ROUNDS=10` |

## No changes needed

| File | Why |
|---|---|
| `apps/api/src/index.ts` | `authRouter` already mounted; middleware chain already correct |
| `packages/shared/**` | All types, schemas, error codes already present and correct |

---

## 1. `apps/api/src/lib/jwt.ts`

```typescript
import jwt from 'jsonwebtoken';
import { AppError } from './errors.js';

const secret = process.env.JWT_SECRET!;
const expiresIn = (process.env.JWT_EXPIRES_IN ?? '15m') as jwt.SignOptions['expiresIn'];

export function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, secret, { expiresIn });
}

export function verifyAccessToken(token: string): { id: string; email: string } {
  try {
    const payload = jwt.verify(token, secret) as jwt.JwtPayload;
    return { id: payload.sub as string, email: payload.email as string };
  } catch {
    throw new AppError('UNAUTHORIZED', 'Authentication required.', 401);
  }
}
```

**Invariants:**
- `JWT_SECRET` is read at module load — process will crash at startup if missing (intentional: fail fast).
- `verifyAccessToken` catches ALL `jsonwebtoken` errors (expired, tampered, malformed) and maps them to `UNAUTHORIZED`. No JWT internals leak to the caller.
- Payload uses `sub` for userId (JWT standard) and `email` as a flat field. Both are present in `UserProfile`.

---

## 2. `apps/api/src/lib/hash.ts`

```typescript
import bcrypt from 'bcryptjs';

const saltRounds = Number(process.env.BCRYPT_ROUNDS ?? 10);

export const hashPassword  = (plain: string): Promise<string> => bcrypt.hash(plain, saltRounds);
export const comparePassword = (plain: string, hash: string): Promise<boolean> => bcrypt.compare(plain, hash);
```

**Invariants:**
- `saltRounds` defaults to 10 (FRS BR-AUTH-01 minimum). Env var allows increasing for production hardening.
- Both functions are simple wrappers — no error suppression. Errors propagate to service layer.

---

## 3. `apps/api/src/services/auth.service.ts`

Full implementation with all function signatures, token hashing, and transaction patterns.

```typescript
import { createHash, randomBytes } from 'crypto';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { signAccessToken } from '../lib/jwt.js';
import { hashPassword, comparePassword } from '../lib/hash.js';

// Raw token → SHA-256 hex digest stored in DB
const hashToken = (raw: string): string =>
  createHash('sha256').update(raw).digest('hex');

// Internal: generate both tokens for a user. Caller must have userId + email.
async function issueTokens(
  userId: string,
  email: string,
): Promise<{ accessToken: string; rawRefreshToken: string }> {
  const rawRefreshToken = randomBytes(32).toString('hex'); // 64-char hex
  const tokenHash = hashToken(rawRefreshToken);
  const expiryDays = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 7);
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { token: tokenHash, userId, expiresAt },
  });

  const accessToken = signAccessToken(userId, email);
  return { accessToken, rawRefreshToken };
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
  const user = await prisma.user.create({
    data: { email: normalizedEmail, passwordHash },
  });

  return issueTokens(user.id, user.email);
}

export async function login(
  email: string,
  password: string,
): Promise<{ accessToken: string; rawRefreshToken: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  // Always compare even if user not found — prevents timing attacks
  const passwordMatch = user ? await comparePassword(password, user.passwordHash) : false;

  if (!user || !passwordMatch) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }

  // Revoke all prior refresh tokens for this user (BR-AUTH-05: single session)
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

  // Atomic rotation: revoke old, create new in one transaction
  const [, newTokens] = await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: now },
    }),
    // issueTokens is async so we build the data inline here
    // Note: we break out of issueTokens to keep the transaction atomic
    prisma.refreshToken.create({
      data: {
        token: hashToken((() => {
          // This is pre-computed below — see implementation note
          return '';
        })()),
        userId: user.id,
        expiresAt: new Date(Date.now() + Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 7) * 24 * 60 * 60 * 1000),
      },
    }),
  ]);
```

> **Implementation Note — `refreshTokens` transaction:**
>
> `issueTokens` cannot be called inside `prisma.$transaction([...])` (array-style) because it is async and generates the random token independently. Use the **callback-style** transaction instead, which supports async operations:

```typescript
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
  const newTokenHash = hashToken(newRawToken);
  const expiryDays = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 7);
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  // Atomic: revoke old token AND create new one in one DB transaction
  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: now },
    });
    await tx.refreshToken.create({
      data: { token: newTokenHash, userId: user.id, expiresAt },
    });
  });

  const accessToken = signAccessToken(user.id, user.email);
  return { accessToken, rawRefreshToken: newRawToken };
}
```

**Complete `auth.service.ts` (authoritative — ignore the first draft above):**

```typescript
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
  if (existing) throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409);

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
  const passwordMatch = user ? await comparePassword(password, user.passwordHash) : false;
  if (!user || !passwordMatch) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password.', 401);
  }
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
  const tokenHash = hashToken(rawRefreshToken);
  await prisma.refreshToken.updateMany({
    where: { token: tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
```

**Key design choices:**

| Choice | Reasoning |
|---|---|
| `issueTokens` takes `(userId, email)` | Avoids an extra DB round-trip — caller (register/login) always has the email already |
| `login` does `comparePassword` even when user not found | Prevents timing-based email enumeration (constant-time behaviour) |
| `refreshTokens` uses callback-style `$transaction` (not array-style) | Array-style transactions require static Prisma calls; async operations inside require callback style |
| `logout` uses `updateMany` (not `update`) | Cookie may refer to an already-revoked token — `updateMany` is a no-op rather than throwing |
| `hashToken` is module-private | Raw tokens never leave `auth.service.ts`; only hashes cross the module boundary |
| `refreshExpiresAt()` reads env var at call time | Allows test overrides without restarting the process |

---

## 4. `apps/api/src/middleware/auth.middleware.ts` (modified)

Replace only the `authenticate` function body. Keep `declare global` and imports as-is.

```typescript
import type { Request, Response, NextFunction } from 'express';
import type { UserProfile } from 'shared';
import { verifyAccessToken } from '../lib/jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: UserProfile;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new (require('../lib/errors.js').AppError)('UNAUTHORIZED', 'Authentication required.', 401));
    return;
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
}
```

> **Note on import style:** `AppError` should be a proper top-level import, not an inline `require`. The final file uses:

```typescript
import type { Request, Response, NextFunction } from 'express';
import type { UserProfile } from 'shared';
import { AppError } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/jwt.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: UserProfile;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError('UNAUTHORIZED', 'Authentication required.', 401));
    return;
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch (err) {
    next(err);
  }
}
```

---

## 5. `apps/api/src/routes/auth.routes.ts` (modified)

Replace the stub. Cookie options are defined once and shared across handlers.

```typescript
import { Router, type Request, type Response, type NextFunction } from 'express';
import { validate } from '../middleware/validate.middleware.js';
import { authLimiter } from '../middleware/rateLimit.middleware.js';
import { RegisterSchema, LoginSchema } from 'shared';
import * as authService from '../services/auth.service.js';

export const authRouter = Router();

const COOKIE_NAME = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 7) * 24 * 60 * 60 * 1000,
};

function setRefreshCookie(res: Response, rawToken: string): void {
  res.cookie(COOKIE_NAME, rawToken, COOKIE_OPTIONS);
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: COOKIE_OPTIONS.secure, path: '/' });
}

authRouter.post(
  '/register',
  authLimiter,
  validate(RegisterSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const { accessToken, rawRefreshToken } = await authService.register(email, password);
      setRefreshCookie(res, rawRefreshToken);
      res.status(201).json({ accessToken });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/login',
  authLimiter,
  validate(LoginSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const { accessToken, rawRefreshToken } = await authService.login(email, password);
      setRefreshCookie(res, rawRefreshToken);
      res.status(200).json({ accessToken });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = req.cookies?.[COOKIE_NAME] as string | undefined;
      if (!rawToken) {
        next(new (await import('../lib/errors.js')).AppError('REFRESH_TOKEN_INVALID', 'Your session has expired. Please log in again.', 401));
        return;
      }
      const { accessToken, rawRefreshToken } = await authService.refreshTokens(rawToken);
      setRefreshCookie(res, rawRefreshToken);
      res.status(200).json({ accessToken });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawToken = req.cookies?.[COOKIE_NAME] as string | undefined;
      await authService.logout(rawToken);
      clearRefreshCookie(res);
      res.status(200).json({ message: 'Logged out' });
    } catch (err) {
      next(err);
    }
  },
);
```

> **Cookie parsing prerequisite:** `express` does not parse cookies by default. The `cookie-parser` package is needed to populate `req.cookies`. Check whether it is installed, and add `app.use(cookieParser())` to `index.ts` if not.

**⚠️ Critical: `cookie-parser` dependency check**

The routes read `req.cookies[COOKIE_NAME]` — this requires `cookie-parser` middleware. Scan `package.json`:
- If `cookie-parser` is absent → `pnpm --filter api add cookie-parser @types/cookie-parser` and add `app.use(cookieParser())` after `express.json()` in `index.ts`.
- If present → just add the `app.use(cookieParser())` call if not already there.

The clean alternative (avoids adding a dependency) is to parse the `Cookie` header manually:

```typescript
function getRefreshTokenFromCookies(req: Request): string | undefined {
  const cookieHeader = req.headers.cookie ?? '';
  const match = cookieHeader.match(/(?:^|;\s*)refreshToken=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}
```

This is self-contained and preferable if `cookie-parser` is not already installed.

**Decision recorded in plan:** Use the manual cookie parse approach to avoid a new dependency. A `cookieParser` dep can always be added in a later ticket.

**Final `/refresh` and `/logout` handlers use `getRefreshTokenFromCookies(req)` instead of `req.cookies[...]`.**

---

## 6. `apps/api/vitest.config.ts` (modified)

Remove `src/middleware/auth.middleware.ts` from coverage exclusions — it will have real, testable logic after AB-1002.

```diff
-      'src/middleware/auth.middleware.ts',
```

Leave the `src/routes/**` exclusion in place — routes are thin wrappers, tested via integration tests, not counted toward the unit-coverage gate.

---

## 7. `apps/api/.env.example` (modified)

```diff
-REFRESH_TOKEN_EXPIRES_DAYS=30
+REFRESH_TOKEN_EXPIRES_DAYS=7
+BCRYPT_ROUNDS=10
```

---

## 8. `apps/api/src/test/integration-setup.ts` (new)

```typescript
import { PrismaClient } from '@prisma/client';
import { beforeEach, afterAll } from 'vitest';

export const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST } },
});

beforeEach(async () => {
  await testPrisma.$executeRaw`
    TRUNCATE "User", "RefreshToken", "Note", "Tag", "NoteTag",
             "NoteVersion", "ShareLink", "PasswordResetOTP"
    CASCADE
  `;
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
```

All integration test files import this via:
```typescript
import '../test/integration-setup.js'; // side-effect import triggers beforeEach/afterAll
```

Wait — this won't work as a side-effect import since Vitest's `beforeEach` registration must happen at module eval time. The correct approach is to reference this file via `setupFiles` in `vitest.config.ts`.

**Better approach:** Add it to vitest config `setupFiles` for integration tests only, OR use it as a `setupFiles` value referenced in a separate vitest config project.

Since the current `vitest.config.ts` has a single project (not multi-project), add `integration-setup.ts` to `setupFiles` conditionally, OR use `globalSetup` for the `TRUNCATE` step.

**Simplest correct approach:** Each integration test file imports it explicitly and the `beforeEach`/`afterAll` hooks register on the file's suite. This works because Vitest shares the module registry across tests in the same run, but `beforeEach` is scoped to the describe block it's registered in.

**Actually the correct Vitest pattern:** The `integration-setup.ts` file should export the `testPrisma` client and the test files call `beforeEach` themselves with the TRUNCATE. This is more explicit and avoids hook-ordering surprises:

```typescript
// src/test/integration-setup.ts
import { PrismaClient } from '@prisma/client';

export const testPrisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_TEST } },
});

export async function resetDatabase(): Promise<void> {
  await testPrisma.$executeRaw`
    TRUNCATE "User", "RefreshToken", "Note", "Tag", "NoteTag",
             "NoteVersion", "ShareLink", "PasswordResetOTP"
    CASCADE
  `;
}
```

Then in each integration test:
```typescript
import { beforeEach, afterAll } from 'vitest';
import { testPrisma, resetDatabase } from '../test/integration-setup.js';

beforeEach(resetDatabase);
afterAll(() => testPrisma.$disconnect());
```

This is the pattern to use — explicit, no magic, no hook-ordering issues.

---

## 9. Unit Tests

### `apps/api/src/lib/__tests__/jwt.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { signAccessToken, verifyAccessToken } from '../jwt.js';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
  process.env.JWT_EXPIRES_IN = '15m';
});

describe('jwt helpers', () => {
  it('AUTH-UT-16: round-trips userId and email through sign → verify', () => {
    const token = signAccessToken('user-123', 'alice@example.com');
    const payload = verifyAccessToken(token);
    expect(payload).toEqual({ id: 'user-123', email: 'alice@example.com' });
  });

  it('AUTH-UT-17: throws UNAUTHORIZED for tampered token', () => {
    const token = signAccessToken('user-123', 'alice@example.com');
    expect(() => verifyAccessToken(token + 'tamper')).toThrowError(
      expect.objectContaining({ code: 'UNAUTHORIZED', statusCode: 401 }),
    );
  });

  it('AUTH-UT-18: throws UNAUTHORIZED for expired token', async () => {
    process.env.JWT_EXPIRES_IN = '-1s'; // already expired
    // Re-import forces fresh module with new expiresIn
    const { signAccessToken: sign, verifyAccessToken: verify } = await import('../jwt.js?expired');
    // Note: module cache — use vi.resetModules() before this test
  });
});
```

> **JWT expiry test note:** Testing an expired token requires either:
> a) Mocking `Date.now` (complex with jsonwebtoken), or
> b) Signing with `expiresIn: 0` and using a token signed 1 second ago.
>
> **Pragmatic approach:** Pass a pre-generated expired JWT string literal (signed with the test secret, expiry in the past) and assert `verifyAccessToken` throws `UNAUTHORIZED`. No need for time mocking.

**Final jwt.test.ts — pragmatic expired token approach:**
```typescript
// A token signed with secret='test-secret-at-least-32-characters-long', exp=1970 (always expired)
const EXPIRED_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MSwgImV4cCI6MX0.signature';
```

Actually generating a real expired token in the test is cleaner. Use `jsonwebtoken.sign` directly with `expiresIn: 1` and wait — or use `-1s` with `jwt.sign` outside the wrapper:

```typescript
import jwt from 'jsonwebtoken';
const expiredToken = jwt.sign({ sub: 'u1', email: 'x@x.com' }, 'test-secret-at-least-32-characters-long', { expiresIn: -1 });
```

This is the approach — `expiresIn: -1` creates an immediately expired token without any time mocking.

### `apps/api/src/lib/__tests__/hash.test.ts`

```typescript
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

  it('produces different hashes for same input (salt is random)', async () => {
    const hash1 = await hashPassword('samePassword');
    const hash2 = await hashPassword('samePassword');
    expect(hash1).not.toBe(hash2);
  });

  it('never stores raw password (hash !== plain)', async () => {
    const plain = 'myPassword123';
    const hash = await hashPassword(plain);
    expect(hash).not.toBe(plain);
  });
});
```

### `apps/api/src/services/__tests__/auth.service.test.ts`

Uses `vi.mock` to mock Prisma. The mock replaces `../lib/prisma.js` with a factory that returns mock functions for each Prisma model method used by `auth.service.ts`.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../lib/errors.js';

// Mock the entire prisma singleton
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
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      refreshToken: {
        update: vi.fn(),
        create: vi.fn(),
      },
    })),
  },
}));

// Mock jwt and hash helpers to keep tests deterministic
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

const mockPrisma = prisma as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  refreshToken: { create: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

describe('auth.service', () => {
  beforeEach(() => vi.clearAllMocks());

  // --- register ---
  describe('register', () => {
    it('AUTH-UT-01: returns accessToken and rawRefreshToken for valid inputs', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'uid-1', email: 'alice@example.com' });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await register('alice@example.com', 'password123');
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.rawRefreshToken).toHaveLength(64); // 32 bytes hex
    });

    it('AUTH-UT-02: throws EMAIL_TAKEN when email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'alice@example.com' });
      await expect(register('alice@example.com', 'password123')).rejects.toThrow(
        expect.objectContaining({ code: 'EMAIL_TAKEN', statusCode: 409 }),
      );
    });

    it('AUTH-UT-03: password hash is not equal to raw password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'uid-1', email: 'alice@example.com' });
      mockPrisma.refreshToken.create.mockResolvedValue({});
      await register('alice@example.com', 'password123');
      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).not.toBe('password123');
      expect(createCall.data.passwordHash).toBe('hashed-password');
    });

    it('AUTH-UT-04: stores email lowercased and trimmed', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ id: 'uid-1', email: 'alice@example.com' });
      mockPrisma.refreshToken.create.mockResolvedValue({});
      await register('  ALICE@Example.COM  ', 'password123');
      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.email).toBe('alice@example.com');
    });
  });

  // --- login ---
  describe('login', () => {
    it('AUTH-UT-05: returns tokens and revokes prior tokens on valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'alice@example.com', passwordHash: 'hashed-password' });
      vi.mocked(comparePassword).mockResolvedValue(true);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await login('alice@example.com', 'password123');
      expect(result.accessToken).toBe('mock-access-token');
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'uid-1', revokedAt: null } }),
      );
    });

    it('AUTH-UT-06: throws INVALID_CREDENTIALS for unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      vi.mocked(comparePassword).mockResolvedValue(false);
      await expect(login('unknown@example.com', 'password123')).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_CREDENTIALS', statusCode: 401 }),
      );
    });

    it('AUTH-UT-07: throws INVALID_CREDENTIALS for wrong password — same error as unknown email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'alice@example.com', passwordHash: 'hashed-password' });
      vi.mocked(comparePassword).mockResolvedValue(false);
      await expect(login('alice@example.com', 'wrongpassword')).rejects.toThrow(
        expect.objectContaining({ code: 'INVALID_CREDENTIALS', statusCode: 401 }),
      );
    });

    it('AUTH-UT-08: calls updateMany to revoke all prior tokens before issuing new ones', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'uid-1', email: 'alice@example.com', passwordHash: 'hashed-password' });
      vi.mocked(comparePassword).mockResolvedValue(true);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValue({});
      await login('alice@example.com', 'password123');
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledBefore?.(mockPrisma.refreshToken.create);
      // Verify the updateMany where-clause is correct
      expect(mockPrisma.refreshToken.updateMany.mock.calls[0][0].data).toEqual({ revokedAt: expect.any(Date) });
    });
  });

  // --- refreshTokens ---
  describe('refreshTokens', () => {
    it('AUTH-UT-09: returns new tokens and revokes old token atomically', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
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
      await expect(refreshTokens('nonexistent-token')).rejects.toThrow(
        expect.objectContaining({ code: 'REFRESH_TOKEN_INVALID', statusCode: 401 }),
      );
    });

    it('AUTH-UT-11: throws REFRESH_TOKEN_INVALID when token is revoked', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
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
        expiresAt: new Date(Date.now() - 1000), // expired 1 second ago
        user: { id: 'uid-1', email: 'alice@example.com' },
      });
      await expect(refreshTokens('a'.repeat(64))).rejects.toThrow(
        expect.objectContaining({ code: 'REFRESH_TOKEN_INVALID' }),
      );
    });
  });

  // --- logout ---
  describe('logout', () => {
    it('AUTH-UT-13: sets revokedAt on the matching refresh token', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      await logout('a'.repeat(64));
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
      );
    });

    it('AUTH-UT-14: no-ops and does not throw when rawRefreshToken is undefined', async () => {
      await expect(logout(undefined)).resolves.toBeUndefined();
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
```

### `apps/api/src/middleware/__tests__/auth.middleware.test.ts`

```typescript
import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../../lib/errors.js';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
});

vi.mock('../../lib/jwt.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/jwt.js')>();
  return { ...actual }; // use real implementation — allows testing expired/invalid tokens
});

import { authenticate } from '../auth.middleware.js';

function makeReq(authHeader?: string): Request {
  return { headers: { authorization: authHeader } } as Request;
}

describe('authenticate middleware', () => {
  it('AUTH-UT-21: populates req.user and calls next() for valid Bearer token', () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { sub: 'uid-1', email: 'alice@example.com' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' },
    );
    const req = makeReq(`Bearer ${token}`);
    const next = vi.fn();
    authenticate(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith(); // no error
    expect(req.user).toEqual({ id: 'uid-1', email: 'alice@example.com' });
  });

  it('AUTH-UT-22: calls next(AppError UNAUTHORIZED) when Authorization header is missing', () => {
    const next = vi.fn();
    authenticate(makeReq(undefined), {} as Response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    expect(next.mock.calls[0][0].code).toBe('UNAUTHORIZED');
  });

  it('AUTH-UT-23: calls next(AppError UNAUTHORIZED) when header does not start with Bearer', () => {
    const next = vi.fn();
    authenticate(makeReq('Basic dXNlcjpwYXNz'), {} as Response, next);
    expect(next.mock.calls[0][0].code).toBe('UNAUTHORIZED');
  });

  it('AUTH-UT-24: calls next(AppError UNAUTHORIZED) for expired JWT', () => {
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign(
      { sub: 'uid-1', email: 'alice@example.com' },
      process.env.JWT_SECRET,
      { expiresIn: -1 },
    );
    const next = vi.fn();
    authenticate(makeReq(`Bearer ${expired}`), {} as Response, next);
    expect(next.mock.calls[0][0].code).toBe('UNAUTHORIZED');
  });
});
```

---

## 10. Integration Tests — `apps/api/src/routes/__tests__/auth.routes.integration.ts`

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { testPrisma, resetDatabase } from '../../test/integration-setup.js';

beforeEach(resetDatabase);
afterAll(() => testPrisma.$disconnect());

const BASE = '/api/v1/auth';
const VALID_USER = { email: 'alice@example.com', password: 'securePassword123' };

async function registerAndGetTokens() {
  const res = await request(app).post(`${BASE}/register`).send(VALID_USER);
  const cookie = res.headers['set-cookie'] as string[];
  return { accessToken: res.body.accessToken as string, cookie };
}

describe('POST /auth/register', () => {
  it('AUTH-IT-01: returns 201 with accessToken and sets HttpOnly refreshToken cookie', async () => {
    const res = await request(app).post(`${BASE}/register`).send(VALID_USER);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    const setCookie = res.headers['set-cookie'] as string[];
    expect(setCookie.some((c: string) => c.startsWith('refreshToken='))).toBe(true);
    expect(setCookie.some((c: string) => c.includes('HttpOnly'))).toBe(true);
    expect(setCookie.some((c: string) => c.toLowerCase().includes('samesite=strict'))).toBe(true);
  });

  it('AUTH-IT-02: returns 409 EMAIL_TAKEN on duplicate registration', async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
    const res = await request(app).post(`${BASE}/register`).send(VALID_USER);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('AUTH-IT-03: treats emails case-insensitively — ALICE@EXAMPLE.COM and alice@example.com conflict', async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
    const res = await request(app).post(`${BASE}/register`).send({ ...VALID_USER, email: 'ALICE@EXAMPLE.COM' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('AUTH-IT-04: returns 400 VALIDATION_ERROR for password shorter than 8 chars', async () => {
    const res = await request(app).post(`${BASE}/register`).send({ email: 'x@x.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.fields).toHaveProperty('password');
  });

  it('AUTH-IT-05: returns 400 VALIDATION_ERROR for invalid email format', async () => {
    const res = await request(app).post(`${BASE}/register`).send({ email: 'not-an-email', password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toHaveProperty('email');
  });

  it('AUTH-IT-06: stores email lowercase and password as bcrypt hash', async () => {
    await request(app).post(`${BASE}/register`).send({ email: 'UPPER@EXAMPLE.COM', password: 'password123' });
    const user = await testPrisma.user.findUnique({ where: { email: 'upper@example.com' } });
    expect(user).not.toBeNull();
    expect(user!.passwordHash).not.toBe('password123');
    expect(user!.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await request(app).post(`${BASE}/register`).send(VALID_USER);
  });

  it('AUTH-IT-07: returns 200 with accessToken and refreshToken cookie', async () => {
    const res = await request(app).post(`${BASE}/login`).send(VALID_USER);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect((res.headers['set-cookie'] as string[]).some((c: string) => c.startsWith('refreshToken='))).toBe(true);
  });

  it('AUTH-IT-08: returns 401 INVALID_CREDENTIALS for wrong password — no fields key', async () => {
    const res = await request(app).post(`${BASE}/login`).send({ ...VALID_USER, password: 'wrongPassword' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.fields).toBeUndefined();
  });

  it('AUTH-IT-09: returns 401 INVALID_CREDENTIALS for unknown email — identical body to wrong-password case', async () => {
    const res = await request(app).post(`${BASE}/login`).send({ email: 'nobody@example.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.fields).toBeUndefined();
  });

  it('AUTH-IT-10: new login invalidates previous refresh token', async () => {
    const { cookie: firstCookie } = await registerAndGetTokens();
    await request(app).post(`${BASE}/login`).send(VALID_USER); // second login
    const refreshRes = await request(app).post(`${BASE}/refresh`).set('Cookie', firstCookie);
    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });
});

describe('POST /auth/refresh', () => {
  it('AUTH-IT-11: returns 200 with new accessToken and new refreshToken cookie', async () => {
    const { cookie } = await registerAndGetTokens();
    const res = await request(app).post(`${BASE}/refresh`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect((res.headers['set-cookie'] as string[]).some((c: string) => c.startsWith('refreshToken='))).toBe(true);
  });

  it('AUTH-IT-12: old refresh token is unusable after rotation', async () => {
    const { cookie: originalCookie } = await registerAndGetTokens();
    await request(app).post(`${BASE}/refresh`).set('Cookie', originalCookie);
    const res = await request(app).post(`${BASE}/refresh`).set('Cookie', originalCookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('AUTH-IT-13: returns 401 REFRESH_TOKEN_INVALID with no cookie', async () => {
    const res = await request(app).post(`${BASE}/refresh`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('AUTH-IT-14: returns 401 REFRESH_TOKEN_INVALID for manually revoked token', async () => {
    const { cookie } = await registerAndGetTokens();
    await request(app).post(`${BASE}/logout`).set('Cookie', cookie);
    const res = await request(app).post(`${BASE}/refresh`).set('Cookie', cookie);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });
});

describe('POST /auth/logout', () => {
  it('AUTH-IT-15: returns 200 and clears refreshToken cookie', async () => {
    const { cookie } = await registerAndGetTokens();
    const res = await request(app).post(`${BASE}/logout`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out' });
    const setCookie = res.headers['set-cookie'] as string[];
    expect(setCookie.some((c: string) => c.includes('Max-Age=0') || c.includes('refreshToken=;'))).toBe(true);
  });

  it('AUTH-IT-16: refresh token is invalid after logout', async () => {
    const { cookie } = await registerAndGetTokens();
    await request(app).post(`${BASE}/logout`).set('Cookie', cookie);
    const res = await request(app).post(`${BASE}/refresh`).set('Cookie', cookie);
    expect(res.status).toBe(401);
  });

  it('AUTH-IT-17: returns 200 even with no cookie (idempotent)', async () => {
    const res = await request(app).post(`${BASE}/logout`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out' });
  });
});

describe('authenticate middleware — protected route smoke test', () => {
  it('AUTH-IT-18: valid accessToken allows access to protected route', async () => {
    const { accessToken } = await registerAndGetTokens();
    const res = await request(app)
      .get('/api/v1/notes')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).not.toBe(401);
  });

  it('AUTH-IT-19: expired or invalid accessToken returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/notes')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('AUTH-IT-20: missing Authorization header returns 401', async () => {
    const res = await request(app).get('/api/v1/notes');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
```

> **AUTH-IT-18 note:** `GET /api/v1/notes` is a stub in AB-1001 — it returns `404` or `200 []` (depending on implementation). The test asserts `!== 401`, not `=== 200`, so it passes regardless of the notes stub state.

---

## 11. Implementation Order

Tasks must execute in this exact order — no step has a dependency it hasn't seen yet:

| Step | Task | Rationale |
|---|---|---|
| 1 | Fix `.env.example` | Prevent accidental use of 30-day default |
| 2 | Create `lib/jwt.ts` | No dependencies — imports only from `jsonwebtoken` + `errors.ts` |
| 3 | Create `lib/hash.ts` | No dependencies — imports only from `bcryptjs` |
| 4 | Create `services/auth.service.ts` | Depends on jwt, hash, prisma, errors |
| 5 | Modify `middleware/auth.middleware.ts` | Depends on jwt.ts |
| 6 | Modify `routes/auth.routes.ts` | Depends on auth.service, validate, authLimiter, shared schemas |
| 7 | Update `vitest.config.ts` | Remove `auth.middleware.ts` coverage exclusion |
| 8 | Create `test/integration-setup.ts` | Depends on Prisma client, used by integration tests |
| 9 | Create unit tests (`jwt`, `hash`, `auth.service`, `auth.middleware`) | Depend on the files created in steps 2–5 |
| 10 | Create integration tests | Depend on everything above + real DB running |

---

## 12. Quality Gate Checkpoints

Run in this order. Every gate must be green before the next:

```bash
# Gate 1 — Type check
pnpm --filter api build
# Expected: 0 errors

# Gate 2 — Lint
pnpm --filter api lint
# Expected: 0 errors, 0 warnings

# Gate 3 — Unit tests (no DB needed)
DATABASE_URL_TEST="" pnpm --filter api test
# Expected: all .test.ts pass; .integration.ts files skipped if DB unavailable

# Gate 4 — Integration tests (real nta_test DB required)
# Prerequisite: PostgreSQL running, DATABASE_URL_TEST env var set
pnpm --filter api test
# Expected: all tests pass including .integration.ts

# Gate 5 — Coverage gate (≥80% line + branch)
pnpm --filter api test:coverage
# Expected: coverage report shows ≥80% across services, middleware, lib
```

---

## 13. Out of Scope

| Item | Ticket |
|---|---|
| `lib/otp.ts` — OTP generation helper | AB-1003 |
| `forgotPassword`, `resetPassword` in `auth.service.ts` | AB-1003 |
| `POST /auth/forgot-password`, `POST /auth/reset-password` routes | AB-1003 |
| Auth pages (`LoginPage`, `RegisterPage`, etc.) | AB-1010 |
| `useAuth` TanStack Query hook | AB-1010 |
| `apiClient.ts` silent refresh interceptor (already scaffolded — no changes) | AB-1010 |
| Playwright E2E auth journey | AB-1016 |
