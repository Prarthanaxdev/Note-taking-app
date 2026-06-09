# Proposal — AB-1010: Auth Pages (Frontend)

## Why

The backend auth API (register, login, refresh, forgot-password, reset-password) is fully implemented, but the React frontend has only TODO placeholders for every auth route. Users cannot log in or register. This ticket delivers the complete auth UI layer.

## What Changes

- Create `apps/web/src/hooks/useAuth.ts` — TanStack Query mutations for all 5 auth operations: `register`, `login`, `logout`, `forgotPassword`, `resetPassword`. Maps API error codes (`EMAIL_TAKEN`, `INVALID_CREDENTIALS`, etc.) to `form.setError()` calls so errors render inline via `FormMessage`.
- Create `apps/web/src/hooks/useTokenRefresh.ts` — hook that fires once on mount; calls `POST /auth/refresh` via cookie, sets `accessToken` in `authStore` on success, redirects to `/login` on failure.
- Create `apps/web/src/components/layout/AuthLayout.tsx` — centered card wrapper shared by all four auth pages.
- Create `apps/web/src/pages/auth/LoginPage.tsx` — Email + Password fields; "Forgot password?" link; redirects to `/notes` on success.
- Create `apps/web/src/pages/auth/RegisterPage.tsx` — Email + Password + Confirm Password; client-side password-match validation.
- Create `apps/web/src/pages/auth/ForgotPasswordPage.tsx` — Email only; shows generic success message regardless of API outcome.
- Create `apps/web/src/pages/auth/ResetPasswordPage.tsx` — Email + 6-digit OTP + New Password + Confirm Password.
- Update `apps/web/src/App.tsx` — wire `RequireAuth` wrapper for protected routes; call `useTokenRefresh` on mount; replace all TODO placeholders with real page components.
- All forms use `react-hook-form` + `zodResolver` with schemas imported from `packages/shared`.
- Submit buttons are disabled and show a loading spinner while the API request is in-flight (FRS-FE-06).

## Capabilities

### New Capabilities

- `auth-pages`: Four auth form pages (login, register, forgot-password, reset-password) with inline validation, API error mapping, and redirect-on-success
- `auth-guard`: `RequireAuth` wrapper and `useTokenRefresh` hook that silently restores session on app load and redirects unauthenticated users away from protected routes

### Modified Capabilities

_(none — no existing spec-level behavior changes; backend auth is unchanged)_

## Impact

| File | Action |
|---|---|
| `apps/web/src/hooks/useAuth.ts` | New |
| `apps/web/src/hooks/useTokenRefresh.ts` | New |
| `apps/web/src/components/layout/AuthLayout.tsx` | New |
| `apps/web/src/pages/auth/LoginPage.tsx` | New |
| `apps/web/src/pages/auth/RegisterPage.tsx` | New |
| `apps/web/src/pages/auth/ForgotPasswordPage.tsx` | New |
| `apps/web/src/pages/auth/ResetPasswordPage.tsx` | New |
| `apps/web/src/App.tsx` | Modified — wire real components, add RequireAuth, call useTokenRefresh |

**No API changes.** All schemas (`RegisterSchema`, `LoginSchema`, `ForgotPasswordSchema`, `ResetPasswordSchema`) already exist in `packages/shared`. `authStore` and `apiClient` are already implemented and unchanged.
