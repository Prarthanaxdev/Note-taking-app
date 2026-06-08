# Implementation Proposal — AB-1002: Core Authentication

| Field | Value |
|---|---|
| Ticket | AB-1002 |
| Status | **Awaiting Approval** |
| Scope | Backend only — `apps/api` + `packages/shared` (already scaffolded) |
| Depends on | AB-1001 (monorepo scaffold, Prisma schema, all stubs) |
| Unblocks | AB-1003 (OTP/forgot-password extends auth.service), AB-1010 (auth UI hooks) |

---

## 1. Goal

Implement the four core authentication flows — **register**, **login**, **logout**, and **silent token refresh** — with refresh token rotation, HttpOnly cookie, and JWT access token. This ticket delivers a fully working auth system that all subsequent tickets depend on.

OTP / forgot-password / reset-password are **not** in scope — those are AB-1003.

---

## 2. Clarifying Decisions (recorded)

| Question | Decision |
|---|---|
| Cookie `Secure` flag | Conditional: `secure: process.env.NODE_ENV === 'production'`. HTTP works in dev; HTTPS enforced in prod. |
| Raw refresh token format | `crypto.randomBytes(32).toString('hex')` → 64-char hex string. Stored raw in cookie; SHA-256 hash stored in DB. |
| Single session per user | **Yes, as FRS BR-AUTH-05.** Every login revokes all prior refresh tokens for that `userId`. |
| Logout with missing cookie | **Always 200, idempotent.** Missing cookie / already-revoked / expired token all return 200 + clear cookie. |
| Refresh response body | `{ accessToken }` only (SDS §5.1 as written). Frontend decodes JWT for `email`. |
| Integration test setup | Included in AB-1002 — first ticket requiring real DB tests. Creates shared `integration-setup.ts`. |

---

## 3. Files to Create or Modify

> All Prisma schema changes are **none** — `User` and `RefreshToken` tables were created in AB-1001's init migration. No new migration needed.

### 3.1 New Files

| File | Purpose |
|---|---|
| `apps/api/src/lib/jwt.ts` | `signAccessToken(userId, email)`, `verifyAccessToken(token)` — HS256, 15 min |
| `apps/api/src/lib/hash.ts` | `hashPassword(plain)`, `comparePassword(plain, hash)` — bcrypt wrappers, `saltRounds = BCRYPT_ROUNDS env \| 10` |
| `apps/api/src/services/auth.service.ts` | All auth business logic: `register`, `login`, `logout`, `refreshTokens`, `issueTokens` |
| `apps/api/src/test/integration-setup.ts` | Shared integration test setup: `DATABASE_URL_TEST` client, `TRUNCATE ... CASCADE` in `beforeEach` |
| `apps/api/src/services/__tests__/auth.service.test.ts` | Unit tests (mocked Prisma) — all service functions |
| `apps/api/src/routes/__tests__/auth.routes.integration.ts` | Integration tests (real `nta_test` DB) — all four endpoints |

### 3.2 Modified Files

| File | Change |
|---|---|
| `apps/api/src/middleware/auth.middleware.ts` | Replace stub with real JWT verification: read `Authorization: Bearer`, call `verifyAccessToken`, populate `req.user = { id, email }`, throw `UNAUTHORIZED` on failure |
| `apps/api/src/routes/auth.routes.ts` | Replace empty Router stub with actual route definitions wired to `auth.service` |

### 3.3 Already Correct (no changes needed)

| File | Why |
|---|---|
| `packages/shared/src/schemas/auth.schemas.ts` | `RegisterSchema`, `LoginSchema` schemas already correct from AB-1001 |
| `packages/shared/src/types/auth.types.ts` | `AuthResponse = { accessToken }`, `UserProfile = { id, email }` already correct |
| `packages/shared/src/types/errors.types.ts` | `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `REFRESH_TOKEN_INVALID`, `UNAUTHORIZED` already in union |
| `apps/api/src/middleware/rateLimit.middleware.ts` | `authLimiter` (10/15min) already configured in AB-1001 |

---

## 4. Detailed Design

### 4.1 `lib/jwt.ts`

```typescript
import jwt from 'jsonwebtoken';
import { AppError } from './errors';

const secret = process.env.JWT_SECRET!;
const expiresIn = (process.env.JWT_EXPIRES_IN ?? '15m') as string;

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

### 4.2 `lib/hash.ts`

```typescript
import bcrypt from 'bcryptjs';

const saltRounds = Number(process.env.BCRYPT_ROUNDS ?? 10);

export const hashPassword  = (plain: string) => bcrypt.hash(plain, saltRounds);
export const comparePassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
```

### 4.3 `services/auth.service.ts` — Key Function Signatures

| Function | Signature | Key Steps |
|---|---|---|
| `register` | `(email: string, password: string) → Promise<{ accessToken: string, rawRefreshToken: string }>` | 1. `lower(email)` uniqueness check → `EMAIL_TAKEN`<br>2. `hashPassword(password)`<br>3. `prisma.user.create`<br>4. `issueTokens(userId)` |
| `login` | `(email: string, password: string) → Promise<{ accessToken: string, rawRefreshToken: string }>` | 1. `findFirst({ email: lower(email) })` → `INVALID_CREDENTIALS` if not found<br>2. `comparePassword()` → `INVALID_CREDENTIALS` if mismatch (no field hint)<br>3. Revoke all prior refresh tokens for `userId`<br>4. `issueTokens(userId)` |
| `logout` | `(rawRefreshToken: string \| undefined) → Promise<void>` | 1. If no cookie → return (no-op)<br>2. Hash raw token → find in DB<br>3. If found and not yet revoked → set `revokedAt = now()`<br>4. Always returns — never throws |
| `refreshTokens` | `(rawRefreshToken: string) → Promise<{ accessToken: string, rawRefreshToken: string }>` | 1. Hash raw token<br>2. `findFirst({ token: hash, revokedAt: null })` → `REFRESH_TOKEN_INVALID` if not found<br>3. Check `expiresAt > now()` → `REFRESH_TOKEN_INVALID` if expired<br>4. Atomic: `$transaction` — revoke old, create new<br>5. Sign new access token |
| `issueTokens` | `(userId: string) → Promise<{ accessToken: string, rawRefreshToken: string }>` | 1. `signAccessToken(userId, user.email)`<br>2. `crypto.randomBytes(32).toString('hex')` → `rawRefreshToken`<br>3. `sha256(rawRefreshToken)` → store hash in `RefreshToken` with `expiresAt = now + 7d` |

**`issueTokens` must look up the user's email** (for JWT payload) via `prisma.user.findUnique({ where: { id: userId }, select: { email: true } })`.

### 4.4 `middleware/auth.middleware.ts` — Real Implementation

```typescript
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Authentication required.', 401);
  }
  const token = header.slice(7);
  req.user = verifyAccessToken(token); // sets { id, email }
  next();
};
```

### 4.5 `routes/auth.routes.ts` — Route Definitions

| Method | Path | Middleware | Handler |
|---|---|---|---|
| `POST` | `/register` | `authLimiter`, `validate(RegisterSchema)` | `authService.register` → 201 + cookie |
| `POST` | `/login` | `authLimiter`, `validate(LoginSchema)` | `authService.login` → 200 + cookie |
| `POST` | `/refresh` | _(none — reads cookie)_ | `authService.refreshTokens` → 200 + new cookie |
| `POST` | `/logout` | _(none — reads cookie)_ | `authService.logout` → 200 (always) |

**Cookie helper** (shared within route file):

```typescript
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,   // 7 days in ms
  path: '/',
};

// On logout, clear cookie:
res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict', secure: ..., path: '/' });
```

### 4.6 Token Hashing

SHA-256 is used inline (no separate helper needed):

```typescript
import { createHash } from 'crypto';
const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');
```

### 4.7 Integration Test Setup — `src/test/integration-setup.ts`

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

---

## 5. Security Invariants

These must be enforced and verified by tests:

| Invariant | Implementation |
|---|---|
| Passwords never stored in plaintext | `bcrypt.hash()` with `saltRounds ≥ 10`. Assert that `user.passwordHash !== plain` in tests. |
| `req.body.userId` never used | All service functions take explicit `userId: string` param from `req.user.id` (JWT). |
| Wrong email/password → identical `401` (no field hint) | `INVALID_CREDENTIALS` regardless of which field is wrong — prevents enumeration. |
| Revoked token reuse → `401` | `refreshTokens()` checks `revokedAt IS NULL` before issuing new token. |
| Email stored lowercase | `email.toLowerCase().trim()` on write; `findFirst({ email: lower })` on read. |
| SHA-256 hash stored, not raw token | Raw token never written to DB. `hashToken(raw)` always used before `prisma` calls. |

---

## 6. Implementation Order

Tasks must be done in this sequence to avoid type errors and broken intermediary states:

1. **`lib/jwt.ts`** — needed by auth.middleware and auth.service
2. **`lib/hash.ts`** — needed by auth.service
3. **`services/auth.service.ts`** — depends on jwt + hash + prisma
4. **`middleware/auth.middleware.ts`** — depends on jwt.ts (replace stub)
5. **`routes/auth.routes.ts`** — depends on auth.service + middleware + rate limiters
6. **`src/test/integration-setup.ts`** — needed before integration tests can run
7. **Unit tests** (`auth.service.test.ts`) — mock Prisma, no DB needed
8. **Integration tests** (`auth.routes.integration.ts`) — requires `DATABASE_URL_TEST`

---

## 7. Quality Gate Checkpoints

Run in this exact order after implementation:

```bash
# 1. Type check — 0 errors required
pnpm --filter api build

# 2. Lint — 0 warnings required
pnpm --filter api lint

# 3. Unit tests (mocked Prisma — no DB needed)
pnpm --filter api test --reporter=verbose --project unit

# 4. Integration tests (requires DATABASE_URL_TEST pointing to nta_test)
pnpm --filter api test --reporter=verbose --project integration

# 5. Coverage gate — ≥80% line + branch
pnpm --filter api test:coverage
```

All five must pass before closing this ticket.

---

## 8. Out of Scope (explicitly deferred)

| Item | Ticket |
|---|---|
| `lib/otp.ts` — OTP generation | AB-1003 |
| `forgotPassword`, `resetPassword` service functions | AB-1003 |
| Auth pages (Login, Register, etc.) | AB-1010 |
| `useAuth` hook + `apiClient.ts` silent refresh | AB-1010 |
| Playwright E2E auth journey | AB-1016 |

---

## 9. Commit Plan

Each commit passes all quality gates before the next starts:

```
feat(api): implement jwt.ts and hash.ts auth helpers
feat(api): implement auth.service with register, login, logout, refresh
feat(api): wire auth.routes and complete auth.middleware JWT verification
test(api): add auth.service unit tests (≥80% coverage)
test(api): add auth integration tests with integration-setup.ts
```
