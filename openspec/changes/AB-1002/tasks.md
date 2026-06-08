# Task Checklist — AB-1002: Core Authentication

| Field | Value |
|---|---|
| Ticket | AB-1002 |
| Status | **Awaiting Approval** |
| Plan ref | `openspec/changes/AB-1002/plan.md` |
| Spec ref | `openspec/changes/AB-1002/spec.md` |
| Total tasks | 38 |

Legend: `[ ]` = todo · `[x]` = done · `[~]` = in progress · `[P]` = can run in parallel with sibling `[P]` tasks

---

## Phase 1 — Config & Foundation

> No new logic. Fix a known `.env.example` bug and unblock coverage tracking for the middleware being implemented in this ticket. Must complete before any source files are written.

- [ ] **T01** Fix `apps/api/.env.example`
  - Change `REFRESH_TOKEN_EXPIRES_DAYS=30` → `REFRESH_TOKEN_EXPIRES_DAYS=7`
    - Rationale: FRS BR-AUTH-04 says "exactly 7 days". 30 was a bug introduced in AB-1001 scaffolding.
  - Add `BCRYPT_ROUNDS=10` (was missing; code defaults to `10` but the example should document it)
  - Verify: file contains no placeholder values that would mislead anyone running the app locally

- [ ] **T02** Update `apps/api/vitest.config.ts` — remove `auth.middleware.ts` from coverage exclusions
  - Remove the line `'src/middleware/auth.middleware.ts'` from the `coverage.exclude` array
  - Leave `src/routes/**` in the exclude list (routes are thin, covered by integration tests, not counted toward the 80% gate)
  - Verify: `pnpm --filter api build` still passes after this change (no TS errors from the config)

---

### ✅ Phase 1 Checkpoint

```bash
pnpm --filter api build   # 0 type errors
pnpm --filter api lint    # 0 errors, 0 warnings
```

---

## Phase 2 — Library Helpers

> `jwt.ts` and `hash.ts` are independent of each other and can be written in parallel. Both must exist before `auth.service.ts` can be written.

- [P] **T03** Create `apps/api/src/lib/jwt.ts`
  - Export `signAccessToken(userId: string, email: string): string`
    - Uses `jwt.sign({ sub: userId, email }, process.env.JWT_SECRET!, { expiresIn })`
    - `expiresIn` reads `process.env.JWT_EXPIRES_IN ?? '15m'` cast to `jwt.SignOptions['expiresIn']`
  - Export `verifyAccessToken(token: string): { id: string; email: string }`
    - Calls `jwt.verify(token, secret)` wrapped in try/catch
    - Any `jsonwebtoken` error → throw `new AppError('UNAUTHORIZED', 'Authentication required.', 401)`
    - Returns `{ id: payload.sub as string, email: payload.email as string }`
  - Import: `import jwt from 'jsonwebtoken'` and `import { AppError } from './errors.js'`
  - All internal imports use `.js` extension (NodeNext module resolution)

- [P] **T04** Create `apps/api/src/lib/hash.ts`
  - Export `hashPassword(plain: string): Promise<string>`
    - `bcrypt.hash(plain, saltRounds)` where `saltRounds = Number(process.env.BCRYPT_ROUNDS ?? 10)`
  - Export `comparePassword(plain: string, hash: string): Promise<boolean>`
    - `bcrypt.compare(plain, hash)`
  - Import: `import bcrypt from 'bcryptjs'`
  - `saltRounds` is module-level constant (read once on import)

---

### ✅ Phase 2 Checkpoint

```bash
pnpm --filter api build   # 0 type errors — jwt.ts and hash.ts must resolve
pnpm --filter api lint    # 0 errors, 0 warnings
```

---

## Phase 3 — Service, Middleware & Routes

> `auth.service.ts` depends on T03 + T04. `auth.middleware.ts` depends on T03 only. `auth.routes.ts` depends on all three. Do T05 and T06 in parallel once T03 + T04 are done, then T07.

- [P] **T05** Create `apps/api/src/services/auth.service.ts`

  **Module-private helpers (not exported):**
  - `hashToken(raw: string): string` — `createHash('sha256').update(raw).digest('hex')`
  - `refreshExpiresAt(): Date` — reads `REFRESH_TOKEN_EXPIRES_DAYS` env (default `7`), returns `new Date(now + days * 24h)`
  - `issueTokens(userId: string, email: string): Promise<{ accessToken, rawRefreshToken }>` — generates 64-char hex token, stores SHA-256 hash in `RefreshToken` table, signs JWT

  **Exported functions:**

  `register(email, password)`:
  - Normalize: `email.toLowerCase().trim()`
  - `prisma.user.findUnique({ where: { email: normalizedEmail } })` → throw `EMAIL_TAKEN` (409) if found
  - `hashPassword(password)` → `prisma.user.create({ data: { email: normalizedEmail, passwordHash } })`
  - Call `issueTokens(user.id, user.email)` and return result

  `login(email, password)`:
  - Normalize email
  - `prisma.user.findUnique({ where: { email: normalizedEmail } })`
  - **Always** call `comparePassword(password, user?.passwordHash ?? '')` — avoids timing-based enumeration
  - If user is null OR compare returns false → throw `INVALID_CREDENTIALS` (401)
  - `prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })` (revoke all prior — BR-AUTH-05)
  - Call `issueTokens(user.id, user.email)` and return result

  `refreshTokens(rawRefreshToken)`:
  - `hashToken(rawRefreshToken)` → `prisma.refreshToken.findUnique({ where: { token: hash }, include: { user: { select: { id, email } } } })`
  - Reject (throw `REFRESH_TOKEN_INVALID` 401) if: record not found, `revokedAt !== null`, or `expiresAt <= new Date()`
  - Generate new raw token: `randomBytes(32).toString('hex')`
  - `prisma.$transaction(async (tx) => { tx.refreshToken.update (revoke old); tx.refreshToken.create (store new hash) })`
    - Must use **callback-style** `$transaction` (not array-style) — async ops inside require it
  - `signAccessToken(user.id, user.email)` → return `{ accessToken, rawRefreshToken: newRawToken }`

  `logout(rawRefreshToken: string | undefined)`:
  - If `rawRefreshToken` is undefined/falsy → return immediately (no-op, no DB call)
  - `hashToken(rawRefreshToken)` → `prisma.refreshToken.updateMany({ where: { token: hash, revokedAt: null }, data: { revokedAt: new Date() } })`
  - Never throws — `updateMany` is a no-op if token not found or already revoked

  **Imports:** `createHash`, `randomBytes` from `'crypto'`; `prisma` from `'../lib/prisma.js'`; `AppError` from `'../lib/errors.js'`; `signAccessToken` from `'../lib/jwt.js'`; `hashPassword`, `comparePassword` from `'../lib/hash.js'`

- [P] **T06** Modify `apps/api/src/middleware/auth.middleware.ts` — replace stub with real implementation
  - Keep the `declare global` block and `UserProfile` import as-is (already correct from AB-1001)
  - Add import: `import { verifyAccessToken } from '../lib/jwt.js'`
  - Replace the `authenticate` function body:
    ```typescript
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
  - Remove the comment `// AB-1002 will verify the JWT and populate req.user` and the stub `next(new AppError(...))` that unconditionally fails
  - Verify: no references to `req` or `res` for anything other than reading the header and calling `next`

- [ ] **T07** Modify `apps/api/src/routes/auth.routes.ts` — replace empty Router stub with real route definitions

  **Cookie helpers (module-level constants, not exported):**
  ```typescript
  const COOKIE_NAME = 'refreshToken';
  const COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 7) * 24 * 60 * 60 * 1000,
  };
  function setRefreshCookie(res: Response, raw: string): void {
    res.cookie(COOKIE_NAME, raw, COOKIE_OPTIONS);
  }
  function clearRefreshCookie(res: Response): void {
    res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: COOKIE_OPTIONS.secure, path: '/' });
  }
  ```

  **Cookie reading (no `cookie-parser` — parse the `Cookie` header manually):**
  ```typescript
  function getRefreshTokenFromRequest(req: Request): string | undefined {
    const header = req.headers.cookie ?? '';
    const match = header.match(/(?:^|;\s*)refreshToken=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }
  ```

  **Routes (in order):**
  - `POST /register` — `authLimiter`, `validate(RegisterSchema)`, handler calls `authService.register`, sets cookie, returns `201 { accessToken }`
  - `POST /login` — `authLimiter`, `validate(LoginSchema)`, handler calls `authService.login`, sets cookie, returns `200 { accessToken }`
  - `POST /refresh` — no auth middleware; reads cookie via `getRefreshTokenFromRequest`; if missing → `next(new AppError('REFRESH_TOKEN_INVALID', ..., 401))`; else calls `authService.refreshTokens`, sets new cookie, returns `200 { accessToken }`
  - `POST /logout` — no auth middleware; reads cookie; calls `authService.logout(rawToken)`; clears cookie; returns `200 { message: 'Logged out' }` — **never fails**

  **Imports:** `Router`, `Request`, `Response`, `NextFunction` from `'express'`; `validate` from `'../middleware/validate.middleware.js'`; `authLimiter` from `'../middleware/rateLimit.middleware.js'`; `RegisterSchema`, `LoginSchema` from `'shared'`; `* as authService` from `'../services/auth.service.js'`; `AppError` from `'../lib/errors.js'`

  **Sub-task:** Confirm `notes.routes.ts` uses `authenticate` middleware — it should already, or if not, this is the ticket where it gets wired. Check the stub: if `notesRouter` has no `authenticate` applied and just returns empty data, AUTH-IT-18 still works (the test checks `!== 401`).

---

### ✅ Phase 3 Checkpoint

```bash
pnpm --filter api build   # 0 type errors — all new files must compile clean
pnpm --filter api lint    # 0 errors, 0 warnings
```

---

## Phase 4 — Test Infrastructure & Unit Tests

> `integration-setup.ts` (T08) is needed by integration tests only — write it before Phase 5. Unit tests T09–T12 are independent of each other and can be written in parallel.

- [ ] **T08** Create `apps/api/src/test/integration-setup.ts`
  - Export `testPrisma: PrismaClient` — instantiated with `{ datasources: { db: { url: process.env.DATABASE_URL_TEST } } }`
  - Export `resetDatabase(): Promise<void>` — runs `TRUNCATE "User", "RefreshToken", "Note", "Tag", "NoteTag", "NoteVersion", "ShareLink", "PasswordResetOTP" CASCADE`
  - Do NOT call `beforeEach`/`afterAll` here — each test file registers those hooks itself (explicit is better, avoids hook-ordering surprises)
  - Import: `PrismaClient` from `'@prisma/client'`

- [P] **T09** Create `apps/api/src/lib/__tests__/jwt.test.ts`

  ```
  describe('jwt helpers')
  ```
  - `AUTH-UT-16` — round-trip: `signAccessToken('uid-1', 'a@b.com')` → `verifyAccessToken(token)` → `{ id: 'uid-1', email: 'a@b.com' }`
    - Set `process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long'` in `beforeAll`
  - `AUTH-UT-17` — tampered token: `verifyAccessToken(token + 'x')` throws `AppError` with `code: 'UNAUTHORIZED'`, `statusCode: 401`
  - `AUTH-UT-18` — expired token: use `jwt.sign({ sub: 'u', email: 'x@x.com' }, secret, { expiresIn: -1 })` directly (no time-mocking needed), then assert `verifyAccessToken` throws `UNAUTHORIZED`
    - Import `jsonwebtoken` directly in the test file to generate the expired token fixture

- [P] **T10** Create `apps/api/src/lib/__tests__/hash.test.ts`

  ```
  describe('hash helpers')
  ```
  - `AUTH-UT-19` — round-trip: `hashPassword('abc12345')` → `comparePassword('abc12345', hash)` resolves `true`
  - `AUTH-UT-20` — wrong password: `comparePassword('wrongpass', hash)` resolves `false`
  - Extra: hash !== plain — `hashPassword('abc12345')` result does not equal `'abc12345'`
  - Extra: different hashes for same input (salt randomness) — two calls to `hashPassword` with same input produce different strings

- [P] **T11** Create `apps/api/src/services/__tests__/auth.service.test.ts`

  Mock setup at top of file:
  ```typescript
  vi.mock('../../lib/prisma.js', () => ({ prisma: { user: { findUnique: vi.fn(), create: vi.fn() }, refreshToken: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() }, $transaction: vi.fn(async (fn) => fn({ refreshToken: { update: vi.fn(), create: vi.fn() } })) } }))
  vi.mock('../../lib/jwt.js', () => ({ signAccessToken: vi.fn().mockReturnValue('mock-access-token') }))
  vi.mock('../../lib/hash.js', () => ({ hashPassword: vi.fn().mockResolvedValue('hashed-password'), comparePassword: vi.fn() }))
  ```
  Call `vi.clearAllMocks()` in `beforeEach`.

  **register tests:**
  - `AUTH-UT-01` — valid inputs: `findUnique` returns null, `create` returns `{ id, email }` → result has `accessToken: 'mock-access-token'` and `rawRefreshToken` of length 64
  - `AUTH-UT-02` — email taken: `findUnique` returns a user → throws `AppError` `EMAIL_TAKEN` 409
  - `AUTH-UT-03` — hash check: assert `prisma.user.create` was called with `data.passwordHash === 'hashed-password'` (the mock value, not the raw password)
  - `AUTH-UT-04` — email normalized: call `register('  ALICE@Example.COM  ', 'pass')`, assert `prisma.user.create` called with `data.email === 'alice@example.com'`

  **login tests:**
  - `AUTH-UT-05` — valid: `comparePassword` mock returns `true`, `updateMany` called → returns tokens; assert `updateMany` called with `where: { userId, revokedAt: null }`
  - `AUTH-UT-06` — unknown email: `findUnique` returns null, `comparePassword` returns false → throws `INVALID_CREDENTIALS` 401
  - `AUTH-UT-07` — wrong password: `findUnique` returns a user, `comparePassword` returns false → throws `INVALID_CREDENTIALS` 401; assert error body has no `fields` key
  - `AUTH-UT-08` — revoke-before-issue order: assert `prisma.refreshToken.updateMany` is called before `prisma.refreshToken.create` (check mock call order using `.mock.invocationCallOrder`)

  **refreshTokens tests:**
  - `AUTH-UT-09` — valid token: `findUnique` returns `{ id, revokedAt: null, expiresAt: future, user: { id, email } }` → `$transaction` called; result has `accessToken` and 64-char `rawRefreshToken`
  - `AUTH-UT-10` — not in DB: `findUnique` returns null → throws `REFRESH_TOKEN_INVALID` 401
  - `AUTH-UT-11` — revoked: `findUnique` returns `{ revokedAt: new Date(), expiresAt: future, ... }` → throws `REFRESH_TOKEN_INVALID` 401
  - `AUTH-UT-12` — expired: `findUnique` returns `{ revokedAt: null, expiresAt: new Date(Date.now() - 1000), ... }` → throws `REFRESH_TOKEN_INVALID` 401

  **logout tests:**
  - `AUTH-UT-13` — valid token: `updateMany` called with `where: { token: <sha256hash>, revokedAt: null }` and `data: { revokedAt: expect.any(Date) }`
  - `AUTH-UT-14` — undefined token: no call to `updateMany`; function resolves without throwing

  **issueTokens implicit tests (via register/login):**
  - `AUTH-UT-15` — output format: `rawRefreshToken` has exactly 64 characters; `accessToken` is the mocked string

- [P] **T12** Create `apps/api/src/middleware/__tests__/auth.middleware.test.ts`

  Use **real** `verifyAccessToken` (not mocked) so tests verify actual JWT behaviour:
  ```typescript
  beforeAll(() => { process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long'; })
  ```
  Generate tokens inline using `jsonwebtoken` directly for full control.

  - `AUTH-UT-21` — valid token: sign a JWT with `sub: 'uid-1'`, `email: 'a@b.com'`; call `authenticate(req, res, next)`; assert `next()` called with no args; assert `req.user === { id: 'uid-1', email: 'a@b.com' }`
  - `AUTH-UT-22` — missing header: `req.headers.authorization` is undefined; assert `next` called with `AppError` `UNAUTHORIZED`
  - `AUTH-UT-23` — wrong prefix: header is `'Basic dXNlcjpwYXNz'`; assert `next` called with `AppError` `UNAUTHORIZED`
  - `AUTH-UT-24` — expired JWT: `jwt.sign({ sub: 'u', email: 'x@x.com' }, secret, { expiresIn: -1 })` → `authenticate` → assert `next` called with `AppError` `UNAUTHORIZED`

---

### ✅ Phase 4 Checkpoint

```bash
pnpm --filter api build           # 0 type errors (test files must also type-check)
pnpm --filter api lint            # 0 errors, 0 warnings
pnpm --filter api test            # all *.test.ts pass; *.integration.ts skipped if DB absent
pnpm --filter api test:coverage   # ≥80% line + branch — services/, lib/jwt.ts, lib/hash.ts, middleware/auth.middleware.ts all covered
```

---

## Phase 5 — Integration Tests

> Requires a running PostgreSQL instance with `nta_test` database created and migrations applied. Each test starts from a clean DB state via `resetDatabase()` in `beforeEach`.

**Pre-conditions before running:**
```bash
# One-time setup (if not done):
createdb nta_test  # or psql -c "CREATE DATABASE nta_test;"
DATABASE_URL_TEST="postgresql://..." pnpm --filter api prisma migrate deploy
```

- [ ] **T13** Create `apps/api/src/routes/__tests__/auth.routes.integration.ts`

  File-level setup:
  ```typescript
  import { beforeEach, afterAll } from 'vitest';
  import { testPrisma, resetDatabase } from '../../test/integration-setup.js';
  beforeEach(resetDatabase);
  afterAll(() => testPrisma.$disconnect());
  ```
  Use `supertest(app)` — app is already exported from `index.ts`.
  Declare `VALID_USER = { email: 'alice@example.com', password: 'securePassword123' }` as a module-level constant.
  Declare helper `registerAndGetTokens()` that POSTs to `/register` and returns `{ accessToken, cookie }`.

  **POST /auth/register — 6 tests:**
  - `AUTH-IT-01` — 201 + `{ accessToken }` + `Set-Cookie: refreshToken=...` with `HttpOnly` + `SameSite=Strict` attributes
  - `AUTH-IT-02` — duplicate email → 409 `EMAIL_TAKEN`
  - `AUTH-IT-03` — email case-insensitivity: register with `alice@example.com`, then `ALICE@EXAMPLE.COM` → 409 `EMAIL_TAKEN`
  - `AUTH-IT-04` — password < 8 chars → 400 `VALIDATION_ERROR` with `fields.password` defined
  - `AUTH-IT-05` — invalid email format → 400 `VALIDATION_ERROR` with `fields.email` defined
  - `AUTH-IT-06` — DB record check: `testPrisma.user.findUnique({ where: { email: 'upper@example.com' } })` after registering `UPPER@EXAMPLE.COM` → record exists with `passwordHash` matching `/^\$2[aby]\$/` and not equal to raw password

  **POST /auth/login — 4 tests:**
  - Use `beforeEach` (inner scope) to register `VALID_USER` before each login test
  - `AUTH-IT-07` — 200 + `{ accessToken }` + refreshToken cookie
  - `AUTH-IT-08` — wrong password → 401 `INVALID_CREDENTIALS`; `res.body.error.fields` is undefined
  - `AUTH-IT-09` — unknown email → 401 `INVALID_CREDENTIALS`; body identical to wrong-password case
  - `AUTH-IT-10` — prior token invalidated: register → capture cookie; login again → try the original cookie on `/refresh` → 401 `REFRESH_TOKEN_INVALID`

  **POST /auth/refresh — 4 tests:**
  - `AUTH-IT-11` — valid cookie → 200 + new accessToken + new `Set-Cookie: refreshToken=...`
  - `AUTH-IT-12` — original cookie invalid after one rotation: use cookie once, then use same cookie again → 401 `REFRESH_TOKEN_INVALID`
  - `AUTH-IT-13` — no cookie → 401 `REFRESH_TOKEN_INVALID`
  - `AUTH-IT-14` — manually revoked (post-logout) → 401 `REFRESH_TOKEN_INVALID`

  **POST /auth/logout — 3 tests:**
  - `AUTH-IT-15` — 200 + `{ message: 'Logged out' }` + `Set-Cookie` clears `refreshToken` (either `Max-Age=0` or cookie value `refreshToken=;`)
  - `AUTH-IT-16` — POST /refresh with the same cookie after logout → 401
  - `AUTH-IT-17` — no cookie → still 200 + `{ message: 'Logged out' }` (idempotent)

  **authenticate middleware smoke tests — 3 tests:**
  - `AUTH-IT-18` — valid accessToken on `GET /api/v1/notes` → status is NOT 401 (notes stub returns 200 or 404, either is acceptable)
  - `AUTH-IT-19` — invalid token string `'Bearer invalid.token.here'` → 401 `UNAUTHORIZED`
  - `AUTH-IT-20` — no Authorization header → 401 `UNAUTHORIZED`

---

### ✅ Phase 5 Checkpoint (Final Quality Gate)

```bash
pnpm --filter api build           # 0 type errors
pnpm --filter api lint            # 0 errors, 0 warnings
pnpm --filter api test            # all 38 tests pass (unit + integration)
pnpm --filter api test:coverage   # ≥80% line + branch for all non-excluded source files
```

Confirm the coverage report shows:
- `src/lib/jwt.ts` — ≥80%
- `src/lib/hash.ts` — ≥80%
- `src/services/auth.service.ts` — ≥80%
- `src/middleware/auth.middleware.ts` — ≥80% (was excluded before this ticket)

---

## Commit Sequence

Each commit is only made after its phase's checkpoint passes cleanly:

| Commit | After | Message |
|---|---|---|
| 1 | Phase 1 checkpoint | `chore(api): fix refresh token expiry days in env example` |
| 2 | Phase 2 checkpoint | `feat(api): add jwt.ts and hash.ts auth helpers` |
| 3 | Phase 3 checkpoint | `feat(api): implement auth service, middleware, and routes` |
| 4 | Phase 4 checkpoint | `test(api): add unit tests for jwt, hash, auth.service, authenticate` |
| 5 | Phase 5 checkpoint | `test(api): add auth integration tests covering all four endpoints` |

---

## Out of Scope

| Item | Ticket |
|---|---|
| `lib/otp.ts` | AB-1003 |
| `forgotPassword`, `resetPassword` in auth.service | AB-1003 |
| `POST /auth/forgot-password`, `POST /auth/reset-password` routes | AB-1003 |
| `forgotPasswordLimiter` applied to a route | AB-1003 |
| Auth pages (LoginPage, RegisterPage, etc.) | AB-1010 |
| `useAuth` TanStack Query hook + frontend login/logout | AB-1010 |
| `apiClient.ts` silent-refresh interceptor (already scaffolded) | AB-1010 |
| Playwright E2E auth journey | AB-1016 |
