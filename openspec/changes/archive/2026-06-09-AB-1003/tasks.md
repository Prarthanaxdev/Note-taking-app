# Task Checklist — AB-1003: OTP / Forgot-Password / Reset-Password

| Field | Value |
|---|---|
| Ticket | AB-1003 |
| Status | **Awaiting Approval** |
| Plan ref | `openspec/changes/AB-1003/plan.md` |
| Spec ref | `openspec/changes/AB-1003/spec.md` |
| Total tasks | 28 |

Legend: `[ ]` = todo · `[x]` = done · `[~]` = in progress · `[P]` = can run in parallel with sibling `[P]` tasks

---

## Phase 1 — Initial Migration

> No `migrations/` directory exists. This phase creates it. Required before any integration tests can run.

- [x] **T01** Create the initial Prisma migration
  - Run: `pnpm --filter api prisma migrate dev --name init`
  - Verify: `apps/api/prisma/migrations/` directory is created with exactly one subdirectory
  - Verify: the generated `migration.sql` contains `CREATE TABLE "PasswordResetOTP"` (and all other models)
  - Verify: running `pnpm --filter api prisma migrate deploy` against the test DB (`DATABASE_URL_TEST`) applies cleanly with 0 errors
  - Sub-task: commit the migration file — `git add apps/api/prisma/migrations/`

---

### ✅ Phase 1 Checkpoint

```bash
pnpm --filter api prisma migrate status   # migration applied, no pending
pnpm --filter api build                   # 0 type errors
```

---

## Phase 2 — `lib/otp.ts`

> Pure helper, no dependencies. Can be done immediately after Phase 1.

- [x] **T02** Create `apps/api/src/lib/otp.ts`
  - Export `generateOtp(): string`
  - Implementation: `randomInt(0, 1_000_000).toString().padStart(6, '0')`
  - Import: `import { randomInt } from 'crypto'`
  - No other exports — all OTP validation logic stays in `auth.service.ts`
  - Use `.js` extension on all imports (NodeNext module resolution)
  - Verify: `pnpm --filter api build` passes with the new file

---

### ✅ Phase 2 Checkpoint

```bash
pnpm --filter api build   # 0 type errors — otp.ts must resolve
pnpm --filter api lint    # 0 errors, 0 warnings
```

---

## Phase 3 — Service Functions

> Both functions depend on T02 (`generateOtp`). They are independent of each other and can be written in parallel once T02 is done.

- [x] **T03** Add `forgotPassword` to `apps/api/src/services/auth.service.ts`

  **Signature:** `export async function forgotPassword(email: string): Promise<void>`

  **Implementation steps:**
  1. `const normalizedEmail = email.toLowerCase().trim()`
  2. `const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })`
  3. If `!user` → `return` (silent no-op, never throws — AUTH-REQ-32)
  4. `const otp = generateOtp()`
  5. `const expiresAt = new Date(Date.now() + Number(process.env.OTP_EXPIRES_MINUTES ?? 15) * 60 * 1000)`
  6. `await prisma.$transaction(async (tx) => { ... })` containing:
     - `await tx.passwordResetOTP.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } })`
     - `await tx.passwordResetOTP.create({ data: { userId: user.id, code: otp, expiresAt } })`
  7. `console.log(`[OTP] ${normalizedEmail}: ${otp}`)` — AFTER transaction (never inside)

  **Add import:** `import { generateOtp } from './otp.js'` — wait, `generateOtp` is in `lib/otp.ts`, and `auth.service.ts` is in `services/`. Path: `import { generateOtp } from '../lib/otp.js'`

- [x] **T04** Add `resetPassword` to `apps/api/src/services/auth.service.ts`

  **Signature:** `export async function resetPassword(email: string, otp: string, newPassword: string): Promise<void>`

  **Implementation steps:**
  1. `const normalizedEmail = email.toLowerCase().trim()`
  2. `const now = new Date()`
  3. `const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })`
  4. If `!user` → `throw new AppError('OTP_INVALID', 'Invalid reset code.', 400)` (AUTH-REQ-37)
  5. `const otpRecord = await prisma.passwordResetOTP.findFirst({ where: { userId: user.id, code: otp }, orderBy: { createdAt: 'desc' } })`
  6. If `!otpRecord` → `throw new AppError('OTP_INVALID', 'Invalid reset code.', 400)`
  7. If `otpRecord.expiresAt <= now` → `throw new AppError('OTP_EXPIRED', 'This reset code has expired. Please request a new one.', 400)` — **check expiry BEFORE used**
  8. If `otpRecord.usedAt !== null` → `throw new AppError('OTP_USED', 'This reset code has already been used.', 400)`
  9. `const passwordHash = await hashPassword(newPassword)` — **outside transaction** (bcrypt is CPU-bound, not DB-bound)
  10. `await prisma.$transaction(async (tx) => { ... })` containing:
      - `await tx.passwordResetOTP.update({ where: { id: otpRecord.id }, data: { usedAt: now } })`
      - `await tx.user.update({ where: { id: user.id }, data: { passwordHash } })`
      - `await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } })`

  **No new imports needed** — `hashPassword` is already imported in `auth.service.ts`.

---

### ✅ Phase 3 Checkpoint

```bash
pnpm --filter api build   # 0 type errors — new functions must compile clean
pnpm --filter api lint    # 0 errors, 0 warnings
```

---

## Phase 4 — Route Additions

> Depends on T03 + T04. `ForgotPasswordSchema`, `ResetPasswordSchema`, and `forgotPasswordLimiter` are already available.

- [x] **T05** Add routes to `apps/api/src/routes/auth.routes.ts`

  **New imports (append to existing import block):**
  ```typescript
  import { ForgotPasswordSchema, ResetPasswordSchema } from 'shared';
  import { forgotPasswordLimiter } from '../middleware/rateLimit.middleware.js';
  ```
  Note: `RegisterSchema` and `LoginSchema` are already imported — update that import line to also include the new schemas.

  **Add after `POST /logout`:**

  `POST /forgot-password`:
  - Middleware chain: `forgotPasswordLimiter`, `validate(ForgotPasswordSchema)`
  - Handler: destructure `{ email }` from body; call `await authService.forgotPassword(email)`; respond `200 { message: 'If registered, an OTP has been sent.' }`
  - Use try/catch → `next(err)` pattern (consistent with existing routes)

  `POST /reset-password`:
  - Middleware chain: `validate(ResetPasswordSchema)` (no rate limiter — reset is not enumerable, OTP is the throttle)
  - Handler: destructure `{ email, otp, newPassword }` from body; call `await authService.resetPassword(email, otp, newPassword)`; respond `200 { message: 'Password updated.' }`
  - Use try/catch → `next(err)` pattern

  **Verify:** `pnpm --filter api build` passes; `pnpm --filter api lint` is clean.

---

### ✅ Phase 4 Checkpoint

```bash
pnpm --filter api build   # 0 type errors
pnpm --filter api lint    # 0 errors, 0 warnings
```

---

## Phase 5 — Unit Tests

> T06 (otp.test.ts) and T07 (auth.service additions) are independent; run in parallel.

- [P] **T06** Create `apps/api/src/lib/__tests__/otp.test.ts`

  ```
  describe('generateOtp')
  ```

  - `AUTH-UT-34`: call `generateOtp()` 100 times; assert every result matches `/^\d{6}$/`
  - `AUTH-UT-35`: `result.length === 6` — explicit length check
  - `AUTH-UT-36`: Mock `randomInt` to return `42`; assert `generateOtp()` returns `'000042'`
  - `AUTH-UT-37`: Mock `randomInt` to return `999999`; assert `generateOtp()` returns `'999999'`

  For mocking `randomInt`, use:
  ```typescript
  vi.mock('crypto', async (importOriginal) => {
    const actual = await importOriginal<typeof import('crypto')>();
    return { ...actual, randomInt: vi.fn() };
  });
  ```
  Or use `vi.spyOn` on the imported `randomInt` — whichever avoids breaking other crypto usage.

- [P] **T07** Extend `apps/api/src/services/__tests__/auth.service.test.ts`

  **Extend existing mock setup:**

  Add `otp.ts` mock:
  ```typescript
  vi.mock('../../lib/otp.js', () => ({ generateOtp: vi.fn().mockReturnValue('123456') }))
  ```

  Extend `prisma` mock to add `passwordResetOTP`:
  ```typescript
  passwordResetOTP: {
    updateMany: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  }
  ```

  Extend `$transaction` mock callback to also expose:
  ```typescript
  {
    passwordResetOTP: { updateMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { update: vi.fn() },
    refreshToken: { update: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  }
  ```

  **`forgotPassword` test block:**
  - `AUTH-UT-25`: Mock `prisma.user.findUnique` returns `null` → call `forgotPassword('nobody@test.com')` → resolves; `prisma.$transaction` was NOT called
  - `AUTH-UT-26`: Mock `findUnique` returns `{ id: 'uid', email: 'a@b.com' }`; spy on `console.log` with `vi.spyOn(console, 'log')` → call `forgotPassword` → `$transaction` called once; `console.log` called with string containing `'123456'`
  - `AUTH-UT-27`: In the `$transaction` callback, assert `tx.passwordResetOTP.updateMany` is called before `tx.passwordResetOTP.create` (check `.mock.invocationCallOrder`)
  - `AUTH-UT-28`: Assert `tx.passwordResetOTP.create` received `data.code === '123456'`
  - `AUTH-UT-29`: Assert `tx.passwordResetOTP.create` received `data.expiresAt` that is a `Date` at approximately `now() + 15 minutes` (within ±5000ms tolerance using `expect.closeTo` or manual comparison)

  **`resetPassword` test block:**
  - `AUTH-UT-30`: `prisma.user.findUnique` returns `null` → throws `AppError('OTP_INVALID', ..., 400)`
  - `AUTH-UT-31`: `findUnique` returns user; `prisma.passwordResetOTP.findFirst` returns `null` → throws `AppError('OTP_INVALID', ..., 400)`
  - `AUTH-UT-32`: `findFirst` returns `{ usedAt: null, expiresAt: new Date(Date.now() - 1000), ... }` (expired) → throws `AppError('OTP_EXPIRED', ..., 400)`
  - `AUTH-UT-33`: `findFirst` returns `{ usedAt: new Date(), expiresAt: new Date(Date.now() + 9999999), ... }` (used, not expired) → throws `AppError('OTP_USED', ..., 400)`
  - `AUTH-UT-34b`: `findFirst` returns `{ usedAt: new Date(), expiresAt: new Date(Date.now() - 1000) }` (expired AND used) → throws `OTP_EXPIRED` (NOT `OTP_USED`) — expiry check precedes used check
  - `AUTH-UT-35b`: `findFirst` returns valid `{ usedAt: null, expiresAt: new Date(Date.now() + 9999999), id: 'otp-1' }` → resolves; `$transaction` called; assert all three operations present in callback
  - `AUTH-UT-36b`: All three — `tx.passwordResetOTP.update`, `tx.user.update`, `tx.refreshToken.updateMany` — invoked within the same `$transaction` call

---

### ✅ Phase 5 Checkpoint

```bash
pnpm --filter api build           # 0 type errors
pnpm --filter api lint            # 0 errors, 0 warnings
pnpm --filter api test            # all *.test.ts pass; *.integration.ts skipped if DB absent
pnpm --filter api test:coverage   # ≥80% for auth.service.ts, lib/otp.ts
```

---

## Phase 6 — Integration Tests

> Requires `nta_test` DB with migration applied.

**Pre-conditions:**
```bash
# Apply migration to test DB (one-time if not already done):
DATABASE_URL_TEST="postgresql://..." pnpm --filter api prisma migrate deploy
```

- [x] **T08** Extend `apps/api/src/routes/__tests__/auth.routes.integration.ts`

  **Add helper function** (after the existing `registerAndGetTokens` helper):
  ```typescript
  async function triggerForgotPassword(email: string): Promise<string> {
    await request(app).post(`${BASE}/forgot-password`).send({ email });
    const record = await getTestPrisma().passwordResetOTP.findFirst({
      where: { user: { email: email.toLowerCase() }, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw new Error('OTP record not found in DB after forgot-password');
    return record.code;
  }
  ```

  **POST /auth/forgot-password — 4 tests:**
  - `AUTH-IT-21`: Send `{ email: 'nobody@example.com' }` (not registered) → `200`; body has `message` property; no OTP record in DB for that email
  - `AUTH-IT-22`: Register user, then POST forgot-password with their email → `200`; `getTestPrisma().passwordResetOTP.findFirst(...)` returns a record with `code` matching `/^\d{6}$/` and `usedAt === null`
  - `AUTH-IT-23`: Send `{ email: 'not-an-email' }` → `400 VALIDATION_ERROR` with `fields.email`
  - `AUTH-IT-24`: Register user, POST forgot-password twice → second call leaves exactly one OTP record with `usedAt === null` and the first record with `usedAt !== null`; use `testPrisma.passwordResetOTP.findMany({ where: { userId: user.id } })` to verify

  **POST /auth/reset-password — 8 tests:**
  - `AUTH-IT-25`: Register user → forgot-password → get OTP via `triggerForgotPassword` → reset-password with new password → `200 { message: 'Password updated.' }`
  - `AUTH-IT-26`: After AUTH-IT-25, `POST /auth/login` with new password → `200` (login works with new password)
  - `AUTH-IT-27`: Register → forgot → `{ cookie } = await registerAndGetTokens(...)` (get a refresh cookie before reset) → reset-password → `POST /auth/refresh` with that cookie → `401 REFRESH_TOKEN_INVALID`
  - `AUTH-IT-28`: Register → forgot → submit wrong OTP code (e.g., `'000000'` if real OTP is non-zero) → `400 OTP_INVALID`
  - `AUTH-IT-29`: Submit `{ email: 'nobody@example.com', otp: '123456', newPassword: 'newpass123' }` → `400 OTP_INVALID` (MUST NOT be 404)
  - `AUTH-IT-30`: Insert OTP directly via `testPrisma.passwordResetOTP.create(...)` with `expiresAt = new Date(Date.now() - 1000)` → submit it → `400 OTP_EXPIRED`
  - `AUTH-IT-31`: Register → forgot → get OTP → reset-password (success) → submit same OTP again → `400 OTP_USED`
  - `AUTH-IT-32`: Submit `{ email, otp: 'abcdef', newPassword: '...' }` (non-digit OTP) → `400 VALIDATION_ERROR` with `fields.otp`

---

### ✅ Phase 6 Checkpoint (Final Quality Gate)

```bash
pnpm --filter api build           # 0 type errors
pnpm --filter api lint            # 0 errors, 0 warnings
pnpm --filter api test            # all tests pass (unit + integration, 28 new tests)
pnpm --filter api test:coverage   # ≥80% line + branch for all non-excluded source files
```

Confirm the coverage report shows:
- `src/lib/otp.ts` — ≥80%
- `src/services/auth.service.ts` — ≥80% (new functions covered)

---

## Commit Sequence

| Commit | After | Message |
|---|---|---|
| 1 | Phase 1 checkpoint | `chore(db): create initial prisma migration covering all schema models` |
| 2 | Phase 2 checkpoint | `feat(api): add otp.ts generateOtp helper` |
| 3 | Phase 3 checkpoint | `feat(api): add forgotPassword and resetPassword to auth.service` |
| 4 | Phase 4 checkpoint | `feat(api): add forgot-password and reset-password routes` |
| 5 | Phase 5 checkpoint | `test(api): add otp and auth.service unit tests for OTP flows` |
| 6 | Phase 6 checkpoint | `test(api): add integration tests for forgot-password and reset-password` |

---

## Out of Scope

| Item | Ticket |
|---|---|
| Raw SQL FTS migration (tsvector + GIN index) | AB-1004 |
| Notes, tags, search, share, versions routes/services | AB-1004 through AB-1009 |
| `ForgotPasswordPage`, `ResetPasswordPage` frontend pages | AB-1010 |
| `useAuth` hook mutations for forgot/reset | AB-1010 |
| Playwright E2E auth journey | AB-1016 |
