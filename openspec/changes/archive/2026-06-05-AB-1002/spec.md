# Spec Delta — AB-1002: Core Authentication

| Field | Value |
|---|---|
| Ticket | AB-1002 |
| Spec type | Delta — behavioral requirements and test scenarios |
| FRS source | §3 Authentication Feature (UC-AUTH-01 through UC-AUTH-04) |
| SDS source | §4.3 Auth Service Design, §5.1 Auth Endpoints, §8.1–8.5 Security Design |

> **Delta scope:** This spec covers only the four auth flows implemented in AB-1002.
> OTP/forgot-password/reset-password (UC-AUTH-05, UC-AUTH-06) are in AB-1003.

---

## 1. Behavioral Requirements

All requirements use SHALL/MUST.

### 1.1 Register (`POST /auth/register`)

| ID | Requirement |
|---|---|
| AUTH-REQ-01 | The endpoint SHALL accept `{ email, password }` validated by `RegisterSchema` (email RFC 5322 format, password ≥ 8 chars). |
| AUTH-REQ-02 | The system SHALL store `email` as `email.toLowerCase().trim()` regardless of case in the request. |
| AUTH-REQ-03 | The system SHALL hash the password with bcrypt at ≥ 10 rounds before storing. The raw password MUST NOT appear in the database. |
| AUTH-REQ-04 | On success, the system SHALL return `201` with body `{ accessToken: string }` and set an HttpOnly cookie named `refreshToken`. |
| AUTH-REQ-05 | The refresh token cookie MUST be `HttpOnly: true`, `SameSite: strict`, `Path: /`, `MaxAge: 604800` (7 days). `Secure` MUST be `true` when `NODE_ENV=production`. |
| AUTH-REQ-06 | If the email is already registered (case-insensitive), the system SHALL return `409` with `{ error: { code: 'EMAIL_TAKEN', message: '...' } }`. |
| AUTH-REQ-07 | If validation fails, the system SHALL return `400` with `{ error: { code: 'VALIDATION_ERROR', fields: {...} } }`. |
| AUTH-REQ-08 | The access token SHALL be a signed JWT (HS256) with payload `{ sub: userId, email, iat, exp }` and expiry of 15 minutes. |

### 1.2 Login (`POST /auth/login`)

| ID | Requirement |
|---|---|
| AUTH-REQ-09 | The endpoint SHALL accept `{ email, password }` validated by `LoginSchema`. |
| AUTH-REQ-10 | User lookup SHALL be case-insensitive on email. |
| AUTH-REQ-11 | If the email is not found OR the password does not match, the system SHALL return `401 INVALID_CREDENTIALS` with no field-level hint. Both cases MUST use the identical response body (prevents email enumeration). |
| AUTH-REQ-12 | On successful login, the system SHALL revoke ALL existing refresh tokens for that `userId` (set `revokedAt = now()`) before issuing new tokens. |
| AUTH-REQ-13 | On success, the system SHALL return `200` with `{ accessToken }` and set the `refreshToken` HttpOnly cookie (same cookie options as register). |

### 1.3 Silent Token Refresh (`POST /auth/refresh`)

| ID | Requirement |
|---|---|
| AUTH-REQ-14 | The endpoint SHALL read the `refreshToken` from the incoming HttpOnly cookie. No request body is required. |
| AUTH-REQ-15 | The system SHALL hash the raw cookie value with SHA-256 and look up the hash in the `RefreshToken` table. |
| AUTH-REQ-16 | The system SHALL reject the token (return `401 REFRESH_TOKEN_INVALID`) if: (a) the hash is not found, (b) `revokedAt IS NOT NULL`, or (c) `expiresAt ≤ now()`. |
| AUTH-REQ-17 | On a valid token, the system SHALL atomically within a single transaction: revoke the old `RefreshToken` record AND create a new one. |
| AUTH-REQ-18 | On success, the system SHALL return `200` with `{ accessToken }` (new JWT) and set a new `refreshToken` cookie with a fresh 7-day expiry. |
| AUTH-REQ-19 | The old refresh token MUST be unusable immediately after rotation — a second request with the old token MUST return `401 REFRESH_TOKEN_INVALID`. |

### 1.4 Logout (`POST /auth/logout`)

| ID | Requirement |
|---|---|
| AUTH-REQ-20 | If a valid, unrevoked refresh token cookie is present, the system SHALL set `revokedAt = now()` on the matching `RefreshToken` record. |
| AUTH-REQ-21 | If the cookie is missing, the token is already revoked, or the token is expired, the system SHALL still return `200` (idempotent). |
| AUTH-REQ-22 | The system SHALL always clear the `refreshToken` cookie (`Max-Age: 0` or `clearCookie`) on logout, regardless of token validity. |
| AUTH-REQ-23 | The response body SHALL be `{ message: 'Logged out' }`. |

### 1.5 JWT Middleware (`authenticate`)

| ID | Requirement |
|---|---|
| AUTH-REQ-24 | The `authenticate` middleware SHALL extract the token from `Authorization: Bearer <token>`. |
| AUTH-REQ-25 | If the header is missing or does not start with `Bearer `, the middleware SHALL throw `AppError('UNAUTHORIZED', ..., 401)`. |
| AUTH-REQ-26 | If the token is expired or has an invalid signature, the middleware SHALL throw `AppError('UNAUTHORIZED', ..., 401)`. |
| AUTH-REQ-27 | On success, the middleware SHALL set `req.user = { id: payload.sub, email: payload.email }`. |
| AUTH-REQ-28 | `authenticate` MUST NOT be applied to `/auth/register`, `/auth/login`, `/auth/refresh`, or `/auth/logout`. |

---

## 2. Test Scenarios

Each scenario maps to a named Vitest test. Test IDs are referenced in the acceptance criteria of FRS §11.

### 2.1 Unit Tests — `auth.service.test.ts`

> Uses mocked Prisma (`vi.mock('@prisma/client')`) — no real DB required.

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-UT-01` | `register()` — valid email + password | Creates user, returns `accessToken` (JWT) and `rawRefreshToken` (64-char hex) |
| `AUTH-UT-02` | `register()` — email already exists | Throws `AppError` with code `EMAIL_TAKEN`, status `409` |
| `AUTH-UT-03` | `register()` — password hash check | `user.passwordHash !== rawPassword` (bcrypt hash, never plaintext) |
| `AUTH-UT-04` | `register()` — email stored lowercase | `prisma.user.create` called with `email.toLowerCase()` |
| `AUTH-UT-05` | `login()` — valid credentials | Returns `accessToken` + `rawRefreshToken`; prior tokens revoked |
| `AUTH-UT-06` | `login()` — unknown email | Throws `AppError('INVALID_CREDENTIALS', ..., 401)` |
| `AUTH-UT-07` | `login()` — wrong password | Throws `AppError('INVALID_CREDENTIALS', ..., 401)` — identical to unknown email response |
| `AUTH-UT-08` | `login()` — revokes all prior tokens | `prisma.refreshToken.updateMany` called with `{ userId, revokedAt: null }` before issuing new token |
| `AUTH-UT-09` | `refreshTokens()` — valid token | Returns new `accessToken` + `rawRefreshToken`; old record revoked in same transaction |
| `AUTH-UT-10` | `refreshTokens()` — token not in DB | Throws `AppError('REFRESH_TOKEN_INVALID', ..., 401)` |
| `AUTH-UT-11` | `refreshTokens()` — token revoked | Throws `AppError('REFRESH_TOKEN_INVALID', ..., 401)` |
| `AUTH-UT-12` | `refreshTokens()` — token expired | Throws `AppError('REFRESH_TOKEN_INVALID', ..., 401)` |
| `AUTH-UT-13` | `logout()` — valid cookie | Sets `revokedAt` on matching `RefreshToken` record |
| `AUTH-UT-14` | `logout()` — no cookie / undefined | Completes without throwing; no Prisma call made |
| `AUTH-UT-15` | `issueTokens()` — output format | `rawRefreshToken` is 64-char hex string; `accessToken` is valid JWT with `sub` = userId |

### 2.2 Unit Tests — `jwt.test.ts`

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-UT-16` | `signAccessToken` then `verifyAccessToken` — round trip | Returned `{ id, email }` matches original args |
| `AUTH-UT-17` | `verifyAccessToken` — tampered signature | Throws `AppError('UNAUTHORIZED', ..., 401)` |
| `AUTH-UT-18` | `verifyAccessToken` — expired token | Throws `AppError('UNAUTHORIZED', ..., 401)` |

### 2.3 Unit Tests — `hash.test.ts`

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-UT-19` | `hashPassword` then `comparePassword` — round trip | `comparePassword(plain, hash)` resolves `true` |
| `AUTH-UT-20` | `comparePassword` — wrong password | Resolves `false` |

### 2.4 Unit Tests — `auth.middleware.test.ts`

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-UT-21` | Valid Bearer token | `req.user` populated with `{ id, email }`; `next()` called |
| `AUTH-UT-22` | Missing `Authorization` header | `next(AppError('UNAUTHORIZED'))` called |
| `AUTH-UT-23` | Header not starting with `Bearer ` | `next(AppError('UNAUTHORIZED'))` called |
| `AUTH-UT-24` | Expired JWT | `next(AppError('UNAUTHORIZED'))` called |

### 2.5 Integration Tests — `auth.routes.integration.ts`

> Uses real `nta_test` PostgreSQL DB via `integration-setup.ts`. Each test starts from a clean slate (TRUNCATE in `beforeEach`).

**Register:**

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-IT-01` | `POST /api/v1/auth/register` valid body | `201`, `{ accessToken }` in body, `Set-Cookie: refreshToken=...` header with `HttpOnly`, `SameSite=Strict` |
| `AUTH-IT-02` | Register same email twice | Second request → `409 EMAIL_TAKEN` |
| `AUTH-IT-03` | Register — email case insensitivity | `user@Example.COM` and `user@example.com` treated as same → `409 EMAIL_TAKEN` on second attempt |
| `AUTH-IT-04` | Register — password `<` 8 chars | `400 VALIDATION_ERROR` with `fields.password` present |
| `AUTH-IT-05` | Register — invalid email format | `400 VALIDATION_ERROR` with `fields.email` present |
| `AUTH-IT-06` | Registered user's DB record | `passwordHash` is not equal to raw password; `email` stored lowercase |

**Login:**

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-IT-07` | `POST /api/v1/auth/login` valid credentials | `200`, `{ accessToken }`, `Set-Cookie: refreshToken=...` |
| `AUTH-IT-08` | Login — wrong password | `401 INVALID_CREDENTIALS` — no `fields` key in error |
| `AUTH-IT-09` | Login — unknown email | `401 INVALID_CREDENTIALS` — identical body to wrong-password case |
| `AUTH-IT-10` | Login — revokes prior tokens | After login, the previously issued refresh token cookie returns `401` on `POST /refresh` |

**Refresh:**

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-IT-11` | `POST /api/v1/auth/refresh` with valid cookie | `200`, `{ accessToken }`, new `Set-Cookie: refreshToken=...` |
| `AUTH-IT-12` | Refresh — old cookie unusable after rotation | Second request with original cookie → `401 REFRESH_TOKEN_INVALID` |
| `AUTH-IT-13` | Refresh — no cookie | `401 REFRESH_TOKEN_INVALID` |
| `AUTH-IT-14` | Refresh — manually revoked token | `401 REFRESH_TOKEN_INVALID` |

**Logout:**

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-IT-15` | `POST /api/v1/auth/logout` with valid cookie | `200`, `{ message: 'Logged out' }`, `Set-Cookie` clears `refreshToken` |
| `AUTH-IT-16` | Logout — token unusable after logout | `POST /refresh` after logout → `401 REFRESH_TOKEN_INVALID` |
| `AUTH-IT-17` | Logout — no cookie | `200`, `{ message: 'Logged out' }` (idempotent) |

**Protected route access:**

| Test ID | Scenario | Expected |
|---|---|---|
| `AUTH-IT-18` | Request with valid access token | `req.user` populated; `GET /api/v1/notes` returns `200` (not `401`) |
| `AUTH-IT-19` | Request with expired/invalid access token | `401 UNAUTHORIZED` |
| `AUTH-IT-20` | Request with no `Authorization` header | `401 UNAUTHORIZED` |

---

## 3. Acceptance Criteria (FRS §11 mapping)

| FRS / UC ID | Acceptance Criterion | Test IDs |
|---|---|---|
| UC-AUTH-01 | `POST /auth/register` valid body → 201 + access token + refresh cookie | AUTH-IT-01 |
| UC-AUTH-01 | Duplicate email → `409 EMAIL_TAKEN` | AUTH-IT-02, AUTH-IT-03 |
| UC-AUTH-01 | Password not stored as plaintext | AUTH-UT-03, AUTH-IT-06 |
| UC-AUTH-02 | Valid login → 200 + access token + refresh cookie | AUTH-IT-07 |
| UC-AUTH-02 | Wrong password → `401 INVALID_CREDENTIALS` (no field hint) | AUTH-IT-08, AUTH-IT-09 |
| UC-AUTH-03 | Valid refresh → new access token issued + old token rotated | AUTH-IT-11, AUTH-IT-12 |
| UC-AUTH-03 | Revoked/missing refresh token → `401 REFRESH_TOKEN_INVALID` | AUTH-IT-13, AUTH-IT-14 |
| UC-AUTH-04 | Logout → `revokedAt` set + cookie cleared | AUTH-IT-15, AUTH-IT-16 |
| UC-AUTH-04 | Logout with missing/expired token → 200 | AUTH-IT-17 |

---

## 4. Error Code Reference

All codes below MUST already exist in `packages/shared/src/types/errors.types.ts` (they do, from AB-1001):

| Code | Status | Trigger |
|---|---|---|
| `EMAIL_TAKEN` | 409 | Register with already-used email |
| `INVALID_CREDENTIALS` | 401 | Login with wrong email or password (no field hint, ever) |
| `REFRESH_TOKEN_INVALID` | 401 | Missing, revoked, or expired refresh token on `/refresh` |
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer JWT on any protected route |
| `VALIDATION_ERROR` | 400 | Zod schema parse failure on request body |
