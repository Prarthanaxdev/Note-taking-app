# Spec Delta — AB-1003: OTP / Forgot-Password / Reset-Password

| Field | Value |
|---|---|
| Ticket | AB-1003 |
| Spec type | Delta — behavioral requirements and test scenarios |
| FRS source | §3 Authentication Feature (UC-AUTH-05, UC-AUTH-06, BR-AUTH-06 through BR-AUTH-10) |
| SDS source | §4.3 Auth Service Design (`forgotPassword`, `resetPassword`), §5.1 Auth Endpoints, §8.5 Rate Limiting |

> **Delta scope:** This spec covers only the two OTP flows added in AB-1003.
> The four core auth flows (register/login/logout/refresh) are covered in the AB-1002 spec delta.

---

## 1. Behavioral Requirements

All requirements use SHALL/MUST.

### 1.1 `POST /auth/forgot-password`

| ID | Requirement |
|---|---|
| AUTH-REQ-29 | The endpoint SHALL accept `{ email }` validated by `ForgotPasswordSchema` (email RFC 5322 format). |
| AUTH-REQ-30 | The endpoint SHALL apply `forgotPasswordLimiter` (5 requests per 15 minutes per IP) before any other middleware. |
| AUTH-REQ-31 | The system SHALL always return `200` with `{ message: 'If registered, an OTP has been sent.' }` regardless of whether the email exists in the database. |
| AUTH-REQ-32 | If the email is not registered, the system MUST take no action (no OTP created, no DB write). |
| AUTH-REQ-33 | If the email is registered, the system SHALL atomically (within `prisma.$transaction`): mark all prior `PasswordResetOTP` records for that user as used (`usedAt = now()`), then insert a new `PasswordResetOTP` record with `code` (6-digit string) and `expiresAt = now() + OTP_EXPIRES_MINUTES * 60s` (default 15 minutes). |
| AUTH-REQ-34 | After the transaction commits, the system SHALL call `console.log` with the OTP value (BR-AUTH-10). The OTP MUST NOT be returned in the HTTP response or stored anywhere other than the `PasswordResetOTP` table. |
| AUTH-REQ-35 | The OTP `code` SHALL be a 6-character decimal string, zero-padded (e.g. `'000042'`), generated via `crypto.randomInt(0, 1_000_000)`. |

### 1.2 `POST /auth/reset-password`

| ID | Requirement |
|---|---|
| AUTH-REQ-36 | The endpoint SHALL accept `{ email, otp, newPassword }` validated by `ResetPasswordSchema` (`otp: z.string().length(6).regex(/^\d{6}$/)`, `newPassword: z.string().min(8)`). |
| AUTH-REQ-37 | If the email does not exist in the database, the system SHALL return `400 OTP_INVALID`. MUST NOT return `404` or any other code that reveals whether the email is registered. |
| AUTH-REQ-38 | If no `PasswordResetOTP` record exists for the user matching the submitted `code`, the system SHALL return `400 OTP_INVALID`. |
| AUTH-REQ-39 | If a matching OTP record exists but `expiresAt <= now()`, the system SHALL return `400 OTP_EXPIRED`. This check MUST be evaluated before the `usedAt` check. |
| AUTH-REQ-40 | If a matching OTP record exists, is not expired, but `usedAt IS NOT NULL`, the system SHALL return `400 OTP_USED`. |
| AUTH-REQ-41 | On a valid OTP, the system SHALL atomically (within `prisma.$transaction`): set `otpRecord.usedAt = now()`, update `user.passwordHash` with `bcrypt.hash(newPassword, saltRounds)`, and set `revokedAt = now()` on ALL active `RefreshToken` records for that user. |
| AUTH-REQ-42 | On success, the system SHALL return `200` with `{ message: 'Password updated.' }`. |
| AUTH-REQ-43 | After a successful reset, the user MUST be able to log in with the new password and MUST NOT be able to use any prior refresh token cookie. |

### 1.3 `lib/otp.ts`

| ID | Requirement |
|---|---|
| AUTH-REQ-44 | `generateOtp()` SHALL return a `string` of exactly 6 characters. |
| AUTH-REQ-45 | All 6 characters SHALL be decimal digits (`/^\d{6}$/`). |
| AUTH-REQ-46 | The function SHALL use `crypto.randomInt(0, 1_000_000)` (cryptographically secure source). |
| AUTH-REQ-47 | Results below 100000 SHALL be zero-padded to 6 characters (e.g. `randomInt` returns `42` → `'000042'`). |

### 1.4 Initial Prisma Migration

| ID | Requirement |
|---|---|
| AUTH-REQ-48 | A migration directory SHALL exist at `apps/api/prisma/migrations/` after this ticket. |
| AUTH-REQ-49 | The migration SHALL create all tables defined in `schema.prisma` including `PasswordResetOTP`. |
| AUTH-REQ-50 | The migration file SHALL be generated via `prisma migrate dev --name init` and committed to the repository. |

---

## 2. Test Scenarios

### 2.1 Unit Tests — `otp.test.ts`

> Pure function tests — no mocks needed.

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-UT-34` | `generateOtp()` — return format | Returns a string matching `/^\d{6}$/` |
| `AUTH-UT-35` | `generateOtp()` — length | `result.length === 6` always |
| `AUTH-UT-36` | `generateOtp()` — padding | When mocking `randomInt` to return `42`, result is `'000042'` |
| `AUTH-UT-37` | `generateOtp()` — upper bound | When mocking `randomInt` to return `999999`, result is `'999999'` |

### 2.2 Unit Tests — `auth.service.test.ts` (additions)

> Uses mocked Prisma + mocked `otp.ts` (mock `generateOtp` returns `'123456'`). Add to the existing mock block:
> ```typescript
> vi.mock('../../lib/otp.js', () => ({ generateOtp: vi.fn().mockReturnValue('123456') }))
> ```
> Extend the `prisma` mock with:
> ```typescript
> passwordResetOTP: { updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() }
> ```
> Extend the `$transaction` mock callback to also receive:
> ```typescript
> { passwordResetOTP: { updateMany: vi.fn(), create: vi.fn(), update: vi.fn() }, user: { update: vi.fn() }, refreshToken: { updateMany: vi.fn() } }
> ```

**`forgotPassword` tests:**

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-UT-25` | User not found (`findUnique` returns null) | Resolves without throwing; `$transaction` MUST NOT be called |
| `AUTH-UT-26` | User found — happy path | `$transaction` called once; `console.log` spy called with a string containing `'123456'` |
| `AUTH-UT-27` | Prior OTPs exist — invalidation order | `tx.passwordResetOTP.updateMany` (with `{ usedAt: null }` in where) called BEFORE `tx.passwordResetOTP.create` |
| `AUTH-UT-28` | OTP value | `tx.passwordResetOTP.create` called with `data.code === '123456'` (the mocked OTP) |
| `AUTH-UT-29` | OTP expiry | `tx.passwordResetOTP.create` called with `data.expiresAt` approximately `now() + 15min` (within ±1 second tolerance) |

**`resetPassword` tests:**

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-UT-30` | User not found (`findUnique` returns null) | Throws `AppError` with `code: 'OTP_INVALID'`, `statusCode: 400` |
| `AUTH-UT-31` | OTP record not found (`findFirst` returns null) | Throws `AppError` with `code: 'OTP_INVALID'`, `statusCode: 400` |
| `AUTH-UT-32` | OTP expired (`expiresAt` in the past, `usedAt: null`) | Throws `AppError` with `code: 'OTP_EXPIRED'`, `statusCode: 400` |
| `AUTH-UT-33` | OTP used (`usedAt !== null`, `expiresAt` in future) | Throws `AppError` with `code: 'OTP_USED'`, `statusCode: 400` |
| `AUTH-UT-34b` | OTP expired AND used — expiry checked first | Throws `OTP_EXPIRED` (not `OTP_USED`) — verifies expiry check precedes used check |
| `AUTH-UT-35b` | Valid OTP | `$transaction` called; contains calls to update OTP (`usedAt`), update user (`passwordHash`), and `updateMany` refresh tokens (`revokedAt`) |
| `AUTH-UT-36b` | All three operations in transaction | All three Prisma calls (`passwordResetOTP.update`, `user.update`, `refreshToken.updateMany`) are made within the same `$transaction` callback |

### 2.3 Integration Tests — `auth.routes.integration.ts` (additions)

> Requires `nta_test` DB with migration applied. Uses `testPrisma` from `integration-setup.ts` to inspect DB state.

**`POST /auth/forgot-password`:**

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-IT-21` | Non-existent email | `200` with `{ message: '...' }` — response body is identical to registered-email case |
| `AUTH-IT-22` | Registered email | `200`; `testPrisma.passwordResetOTP.findFirst({ where: { userId } })` returns a record with `code` matching `/^\d{6}$/` and `usedAt === null` |
| `AUTH-IT-23` | Invalid email format | `400 VALIDATION_ERROR` with `fields.email` defined |
| `AUTH-IT-24` | Second forgot-password for same user | First OTP record's `usedAt` is set (not null); new OTP record with `usedAt: null` created for same userId |

**`POST /auth/reset-password`:**

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-IT-25` | Valid OTP + new password | `200 { message: 'Password updated.' }` |
| `AUTH-IT-26` | Valid reset → can login with new password | After step AUTH-IT-25, `POST /auth/login` with the new password returns `200` |
| `AUTH-IT-27` | Valid reset → prior refresh tokens revoked | After step AUTH-IT-25, prior `refreshToken` cookie returns `401 REFRESH_TOKEN_INVALID` on `POST /auth/refresh` |
| `AUTH-IT-28` | Wrong OTP code | `400 OTP_INVALID` |
| `AUTH-IT-29` | Non-existent email | `400 OTP_INVALID` — MUST NOT be `404` |
| `AUTH-IT-30` | Expired OTP | Insert OTP with `expiresAt` in the past; submit it → `400 OTP_EXPIRED` |
| `AUTH-IT-31` | Used OTP (replay attack) | Submit valid OTP once (success); submit same OTP again → `400 OTP_USED` |
| `AUTH-IT-32` | Invalid `otp` format (not 6 digits) | `400 VALIDATION_ERROR` with `fields.otp` defined |

**Helper needed for integration tests:**

```typescript
async function triggerForgotPassword(email: string): Promise<string> {
  await request(app).post(`${BASE}/forgot-password`).send({ email });
  const otp = await getTestPrisma().passwordResetOTP.findFirst({
    where: { user: { email: email.toLowerCase() }, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  return otp!.code;
}
```

---

## 3. Acceptance Criteria (FRS §11 mapping)

| FRS / UC ID | Acceptance Criterion | Test IDs |
|---|---|---|
| UC-AUTH-05 | Forgot-password → 200 regardless of email existence | AUTH-IT-21 |
| UC-AUTH-05 | OTP logged to stdout only (not in response) | AUTH-UT-26 (console.log spy) |
| UC-AUTH-05 | OTP stored in DB with 15-min expiry | AUTH-IT-22 |
| UC-AUTH-05 | Previous OTP invalidated when new one requested | AUTH-IT-24 |
| UC-AUTH-06 | Valid OTP → password updated + all tokens revoked | AUTH-IT-25, AUTH-IT-27 |
| UC-AUTH-06 | Expired OTP → `400 OTP_EXPIRED` | AUTH-IT-30, AUTH-UT-32 |
| UC-AUTH-06 | Used OTP → `400 OTP_USED` | AUTH-IT-31, AUTH-UT-33 |
| UC-AUTH-06 | Wrong OTP → `400 OTP_INVALID` | AUTH-IT-28, AUTH-UT-31 |
| BR-AUTH-08 | Forgot-password response identical for existing vs non-existing email | AUTH-IT-21 (non-existent mirrors AUTH-IT-22 response shape) |
| BR-AUTH-10 | OTP logged to stdout only | AUTH-UT-26 |

---

## 4. Error Code Reference

All codes below already exist in `packages/shared/src/types/errors.types.ts`:

| Code | Status | Trigger |
|---|---|---|
| `OTP_EXPIRED` | 400 | Reset submitted after the 15-minute window |
| `OTP_USED` | 400 | Same OTP submitted a second time |
| `OTP_INVALID` | 400 | Wrong OTP code, or email does not exist in DB |
| `VALIDATION_ERROR` | 400 | Zod schema parse failure (e.g., `otp` not 6 digits, invalid email) |
