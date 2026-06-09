# Spec — auth-guard

## ADDED Requirements

### Requirement: Silent token refresh on app load

On application load, the system SHALL attempt to restore the user's session by calling `POST /auth/refresh` (the HttpOnly cookie is sent automatically). If the refresh succeeds, the `accessToken` SHALL be stored in `authStore` and the app SHALL render normally. If the refresh fails, the user SHALL be redirected to `/login`. This logic SHALL live in `useTokenRefresh`, called once from `App.tsx`.

#### Scenario: Valid cookie restores session on load
- **WHEN** the app mounts and a valid refresh-token cookie exists
- **THEN** `POST /auth/refresh` succeeds, `authStore.accessToken` is set, and the user sees the requested page without a login prompt

#### Scenario: No or expired cookie redirects to /login
- **WHEN** the app mounts and the refresh request returns 401
- **THEN** `authStore` remains unauthenticated and the browser navigates to `/login`

#### Scenario: Refresh is attempted only once per mount
- **WHEN** the app mounts
- **THEN** `POST /auth/refresh` is called exactly once, regardless of how many protected routes are rendered

---

### Requirement: Protected routes require authentication

All routes except `/login`, `/register`, `/forgot-password`, `/reset-password`, and `/public/:token` SHALL be protected by a `RequireAuth` wrapper. `RequireAuth` SHALL check `authStore` for an `accessToken`. While the initial refresh attempt is pending, `RequireAuth` SHALL render a loading state rather than immediately redirecting.

#### Scenario: Authenticated user accesses protected route
- **WHEN** `authStore.accessToken` is set and the user navigates to `/notes`
- **THEN** the protected page renders normally

#### Scenario: Unauthenticated user redirected from protected route
- **WHEN** `authStore.accessToken` is null and the refresh attempt has completed with failure
- **THEN** the user is redirected to `/login`; the originally requested path is NOT preserved (simple redirect)

#### Scenario: Public routes accessible without auth
- **WHEN** an unauthenticated user navigates to `/login`, `/register`, `/forgot-password`, `/reset-password`, or `/public/:token`
- **THEN** the page renders without triggering a redirect

#### Scenario: Already-authenticated user visiting /login redirects to /notes
- **WHEN** `authStore.accessToken` is set and the user navigates to `/login` or `/register`
- **THEN** the user is redirected to `/notes` (no double-login)

---

### Requirement: Logout clears auth state

The `useAuth.logout()` mutation SHALL call `POST /auth/logout` (if the endpoint exists) or fall back to a client-side clear. It SHALL call `authStore.clearAuth()`, invalidate all TanStack Query cache, and navigate to `/login`.

#### Scenario: Logout clears token and cache
- **WHEN** `useAuth().logout()` is called
- **THEN** `authStore.accessToken` becomes `null`, all query cache is cleared, and the user is redirected to `/login`
