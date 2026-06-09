# Spec — app-shell

## ADDED Requirements

### Requirement: AppShell provides persistent sidebar navigation for protected pages

All protected routes (`/notes`, `/notes/:id`, `/search`) SHALL be rendered inside `AppShell`. `AppShell` SHALL render a fixed-width sidebar on the left and a scrollable main content area on the right. The sidebar SHALL contain: the application logo/name, a "New Note" button, navigation links (Notes list → `/notes`, Search → `/search`), and a user menu at the bottom with a "Logout" button. The currently active route link SHALL be visually highlighted.

#### Scenario: Sidebar is visible on all protected pages
- **WHEN** an authenticated user navigates to `/notes`, `/notes/:id`, or `/search`
- **THEN** the sidebar is rendered with all navigation elements visible

#### Scenario: Active route link is highlighted
- **GIVEN** the user is on `/notes`
- **WHEN** they view the sidebar
- **THEN** the "Notes" link is visually marked as active; "Search" is not

#### Scenario: AppShell does NOT appear on auth pages
- **WHEN** an unauthenticated user visits `/login`, `/register`, `/forgot-password`, or `/reset-password`
- **THEN** no sidebar is rendered — the `AuthLayout` centered card is shown instead

---

### Requirement: Logout clears session and redirects to login

The user menu in the sidebar SHALL contain a "Logout" button. Clicking it SHALL call `useAuth().logout()`, which clears `authStore.accessToken`, clears the TanStack Query cache, and navigates to `/login`. The logout action SHALL be client-side only (no server endpoint exists yet).

#### Scenario: Logout clears token and redirects
- **WHEN** the user clicks "Logout" in the sidebar
- **THEN** `authStore.accessToken` becomes null, query cache is cleared, and the browser navigates to `/login`
