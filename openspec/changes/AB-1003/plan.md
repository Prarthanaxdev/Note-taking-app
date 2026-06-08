# Implementation Plan — AB-1003: OTP / Forgot-Password / Reset-Password

| Field | Value |
|---|---|
| Ticket | AB-1003 |
| Branch | `feature/backend/AB-1003-authentication` |
| Depends on | AB-1002 complete (auth service, middleware, routes, tests all committed) |

---

## Summary

Add OTP-based password recovery to the existing auth system. Two public endpoints:
- `POST /auth/forgot-password` — generates and logs a 6-digit OTP (always returns 200)
- `POST /auth/reset-password` — validates OTP, updates password, revokes all sessions

Also creates the initial Prisma migration since no `migrations/` directory exists yet.

---

## Phases

| Phase | What | Key constraint |
|---|---|---|
| 1 | Initial Prisma migration | Must come first — integration tests need a real schema |
| 2 | `lib/otp.ts` | Pure helper, no deps — can be done immediately |
| 3 | Service functions | Depends on otp.ts; `forgotPassword` and `resetPassword` are independent of each other |
| 4 | Route additions | Depends on both service functions |
| 5 | Unit tests | Depends on service + otp.ts; otp.test.ts and service tests are parallel |
| 6 | Integration tests | Depends on migration + routes |

---

## Critical Decisions

| Decision | Rationale |
|---|---|
| `OTP_INVALID` for non-existent email on reset | Prevents email enumeration — user cannot tell if an email is registered by probing `/reset-password` |
| `$transaction` for both forgotPassword and resetPassword | Prevents partial states (zero valid OTPs, or password updated without tokens revoked) |
| Expiry checked before used | Matches FRS Alt Flow A (expired) before Alt Flow B (used) |
| `console.log` outside transaction | Fires only on successful commit — no log if transaction rolls back |
| `generateOtp` uses `crypto.randomInt` | Cryptographically secure; appropriate for a security-sensitive 6-digit code |

---

## What Already Exists (no changes needed)

- `ForgotPasswordSchema`, `ResetPasswordSchema` — `packages/shared/src/schemas/auth.schemas.ts`
- `OTP_EXPIRED`, `OTP_USED`, `OTP_INVALID` — `packages/shared/src/types/errors.types.ts`
- `forgotPasswordLimiter` (5 req/15min) — `apps/api/src/middleware/rateLimit.middleware.ts`
- `PasswordResetOTP` model — `apps/api/prisma/schema.prisma`
- `integration-setup.ts` with `resetDatabase()` + `getTestPrisma()` — `apps/api/src/test/`
