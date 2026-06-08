# Implementation Proposal — AB-1003: OTP / Forgot-Password / Reset-Password

| Field | Value |
|---|---|
| Ticket | AB-1003 |
| Status | **Awaiting Approval** |
| Scope | Backend only — `apps/api` |
| Depends on | AB-1002 (auth service, middleware, and route foundations are complete) |
| Unblocks | AB-1010 (frontend auth pages — ForgotPasswordPage, ResetPasswordPage) |

---

## 1. Goal

Extend the auth system with two new public endpoints — **forgot-password** and **reset-password** — backed by a 6-digit, time-limited, single-use OTP stored in the `PasswordResetOTP` table. This ticket also creates the **initial Prisma migration** covering all tables, since no `migrations/` directory currently exists in `apps/api/prisma/`.

Core auth flows (register, login, logout, refresh) are **not** in scope — those are complete as of AB-1002.

---

## 2. Clarifying Decisions (recorded)

| Question | Decision |
|---|---|
| Prisma migration | **Create initial migration** (`prisma migrate dev --name init`) covering all models. This is the first ticket that requires a real DB migration to exist. |
| `resetPassword` — user not found | Return **400 OTP_INVALID** (same as a wrong OTP code) to prevent email enumeration. |
| `forgotPassword` atomicity | **Use `prisma.$transaction()`** to atomically invalidate old OTPs and insert the new one, preventing any window where zero or two valid OTPs coexist. |
| `otp.ts` scope | **`generateOtp()` only** — one pure function using `crypto.randomInt`. All DB-backed validation stays in `auth.service.ts`. |
| `forgotPasswordLimiter` | Already exported from `apps/api/src/middleware/rateLimit.middleware.ts` (5 req/15min). No change needed. |
| `ForgotPasswordSchema` / `ResetPasswordSchema` | Already defined in `packages/shared/src/schemas/auth.schemas.ts`. No change needed. |
| OTP error codes | `OTP_EXPIRED`, `OTP_USED`, `OTP_INVALID` already in `AppErrorCode` union. No change needed. |

---

## 3. Files to Create or Modify

### 3.1 New Files

| File | Purpose |
|---|---|
| `apps/api/src/lib/otp.ts` | `generateOtp(): string` — `crypto.randomInt(0, 1_000_000)` padded to 6 digits |
| `apps/api/src/lib/__tests__/otp.test.ts` | Unit tests for `generateOtp` — format + padding assertions |
| `apps/api/prisma/migrations/` | Initial migration created by `prisma migrate dev --name init` (covers all schema models) |

### 3.2 Modified Files

| File | Change |
|---|---|
| `apps/api/src/services/auth.service.ts` | Add `forgotPassword(email)` and `resetPassword(email, otp, newPassword)` |
| `apps/api/src/routes/auth.routes.ts` | Add `POST /forgot-password` and `POST /reset-password` routes; add imports for `ForgotPasswordSchema`, `ResetPasswordSchema`, `forgotPasswordLimiter` |
| `apps/api/src/services/__tests__/auth.service.test.ts` | Extend Prisma mock with `passwordResetOTP` + `otp.ts` mock; add unit tests for both new functions |
| `apps/api/src/routes/__tests__/auth.routes.integration.ts` | Add integration tests for both new endpoints |

### 3.3 Already Correct (no changes needed)

| File | Why |
|---|---|
| `packages/shared/src/schemas/auth.schemas.ts` | `ForgotPasswordSchema`, `ResetPasswordSchema` already defined |
| `packages/shared/src/types/errors.types.ts` | `OTP_EXPIRED`, `OTP_USED`, `OTP_INVALID` already in union |
| `apps/api/src/middleware/rateLimit.middleware.ts` | `forgotPasswordLimiter` (5/15min) already exported |
| `apps/api/prisma/schema.prisma` | `PasswordResetOTP` model already in schema |

---

## 4. Detailed Design

### 4.1 `lib/otp.ts`

```typescript
import { randomInt } from 'crypto';

export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}
```

`crypto.randomInt` is cryptographically secure (Node.js 14.10+; Node 22 is the project runtime). The upper bound is exclusive, so the range is [0, 999999], padded to 6 characters.

### 4.2 `forgotPassword` in `auth.service.ts`

```typescript
export async function forgotPassword(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return; // silent no-op — BR-AUTH-08 (always 200 regardless of email existence)

  const otp = generateOtp();
  const expiresAt = new Date(
    Date.now() + Number(process.env.OTP_EXPIRES_MINUTES ?? 15) * 60 * 1000
  );

  await prisma.$transaction(async (tx) => {
    // Invalidate all prior unused OTPs for this user — UC-AUTH-05 Alt Flow A
    await tx.passwordResetOTP.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetOTP.create({
      data: { userId: user.id, code: otp, expiresAt },
    });
  });

  console.log(`[OTP] ${normalizedEmail}: ${otp}`); // BR-AUTH-10: stdout only, never email
}
```

**Key invariants:**
- Returns `void` — the route always responds `200` regardless of this function's internal path.
- `console.log` is called **after** the transaction commits, so it only fires on success.
- Prior OTPs are invalidated by setting `usedAt`, making them fail the "not used" check on `resetPassword`.

### 4.3 `resetPassword` in `auth.service.ts`

```typescript
export async function resetPassword(
  email: string,
  otp: string,
  newPassword: string,
): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  const now = new Date();

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    // OTP_INVALID (not NOT_FOUND) — prevents email enumeration — decision recorded in §2
    throw new AppError('OTP_INVALID', 'Invalid reset code.', 400);
  }

  const otpRecord = await prisma.passwordResetOTP.findFirst({
    where: { userId: user.id, code: otp },
    orderBy: { createdAt: 'desc' }, // most recent OTP first if duplicates exist
  });

  if (!otpRecord) {
    throw new AppError('OTP_INVALID', 'Invalid reset code.', 400);
  }
  if (otpRecord.expiresAt <= now) {
    throw new AppError('OTP_EXPIRED', 'This reset code has expired. Please request a new one.', 400);
  }
  if (otpRecord.usedAt !== null) {
    throw new AppError('OTP_USED', 'This reset code has already been used.', 400);
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetOTP.update({
      where: { id: otpRecord.id },
      data: { usedAt: now },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    // BR-AUTH-09: revoke all active refresh tokens after password reset
    await tx.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    });
  });
}
```

**Check order:** `expiresAt` is checked before `usedAt` (FRS Alt Flow A before Alt Flow B).

### 4.4 Route Additions in `auth.routes.ts`

New imports to add:
```typescript
import { ForgotPasswordSchema, ResetPasswordSchema } from 'shared';
import { forgotPasswordLimiter } from '../middleware/rateLimit.middleware.js';
```

```typescript
authRouter.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate(ForgotPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body as { email: string };
      await authService.forgotPassword(email);
      res.status(200).json({ message: 'If registered, an OTP has been sent.' });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/reset-password',
  validate(ResetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, otp, newPassword } = req.body as {
        email: string;
        otp: string;
        newPassword: string;
      };
      await authService.resetPassword(email, otp, newPassword);
      res.status(200).json({ message: 'Password updated.' });
    } catch (err) {
      next(err);
    }
  },
);
```

### 4.5 Migration

No new schema changes are needed — `PasswordResetOTP` is already in `schema.prisma`. AB-1003 creates the **initial migration** that materialises the entire schema:

```bash
pnpm --filter api prisma migrate dev --name init
```

This generates `apps/api/prisma/migrations/YYYYMMDD_HHMMSS_init/migration.sql`.

> **Note:** The raw SQL for the FTS `tsvector` generated column and GIN index (SDS §3.4) is **not** in scope for AB-1003. That raw migration is in AB-1004 (notes feature). The initial migration created here covers only Prisma-model-managed tables.

---

## 5. Security Invariants

| Invariant | Implementation |
|---|---|
| Forgot-password always returns 200 | `forgotPassword` returns `void`. Route always sends `200` — no conditional. |
| No email enumeration in `resetPassword` | Non-existent email throws `OTP_INVALID` (same code as wrong OTP). |
| OTP logged to stdout only | `console.log` in service, never in a mailer or outbound HTTP call. |
| OTP is single-use | `usedAt` set atomically in same transaction as password update. |
| Prior OTPs invalidated on new forgot-password | `updateMany({ usedAt: null })` in same transaction as new OTP insert. |
| Refresh tokens revoked on reset | `updateMany({ revokedAt: now })` in same transaction as password update. |

---

## 6. Implementation Order

| Step | Task | Depends on |
|---|---|---|
| 1 | Create initial migration (`prisma migrate dev --name init`) | schema.prisma already correct |
| 2 | Create `lib/otp.ts` | nothing |
| 3 | Add `forgotPassword` + `resetPassword` to `auth.service.ts` | Step 2 (`generateOtp`) |
| 4 | Add routes to `auth.routes.ts` | Step 3 |
| 5 | Write `otp.test.ts` unit tests | Step 2 |
| 6 | Extend `auth.service.test.ts` with new tests | Step 3 |
| 7 | Extend `auth.routes.integration.ts` with new tests | Steps 1 + 4 |

---

## 7. Quality Gate Checkpoints

```bash
# 1. Type check — 0 errors required
pnpm --filter api build

# 2. Lint — 0 warnings required
pnpm --filter api lint

# 3. Unit tests (no DB)
pnpm --filter api test --reporter=verbose

# 4. Integration tests (requires DATABASE_URL_TEST pointing to nta_test with migration applied)
DATABASE_URL_TEST="postgresql://..." pnpm --filter api prisma migrate deploy
pnpm --filter api test --reporter=verbose

# 5. Coverage gate — ≥80% line + branch
pnpm --filter api test:coverage
```

---

## 8. Out of Scope

| Item | Ticket |
|---|---|
| Raw SQL FTS migration (tsvector + GIN index) | AB-1004 |
| Notes, tags, search, share, versions routes/services | AB-1004 through AB-1009 |
| Frontend auth pages (ForgotPasswordPage, ResetPasswordPage) | AB-1010 |
| Playwright E2E auth journey (including reset flow) | AB-1016 |

---

## 9. Commit Plan

| Commit | After | Message |
|---|---|---|
| 1 | Migration created + verified | `chore(db): create initial prisma migration covering all schema models` |
| 2 | `otp.ts` written + passing build | `feat(api): add otp.ts generateOtp helper` |
| 3 | Service functions written + passing build | `feat(api): add forgotPassword and resetPassword to auth.service` |
| 4 | Routes wired + passing build | `feat(api): add forgot-password and reset-password routes` |
| 5 | All unit tests passing | `test(api): add otp and auth.service unit tests for OTP flows` |
| 6 | All integration tests passing | `test(api): add integration tests for forgot-password and reset-password` |
