# AGENTS.md — Note Taking Application

Single source of truth for all AI tools on this project.

---

## 1. Project Overview

The Note Taking Application (NTA) is a full-stack web app for authenticated users to create, edit, tag, search, and share rich-text notes with version history. It supports two actor types: registered users (full CRUD, search, share, version) and anonymous visitors (read-only access to a single public share link). The system is a monorepo with a Node.js REST API, a React SPA, and a shared types/schemas package.

---

## 2. Repository Structure

```
apps/api/          Express 5 REST API — auth, business logic, DB via Prisma
  src/
    routes/        Route definitions per feature (auth, notes, tags, shares, versions)
    middleware/    auth, error, validate, rateLimit
    services/      Business logic (one file per feature)
    lib/           prisma.ts, jwt.ts, otp.ts, hash.ts, errors.ts
  prisma/          schema.prisma + migrations/ (includes raw SQL FTS migration)

apps/web/          React 19 SPA — all UI, state, data fetching
  src/
    pages/         auth/, notes/, search/, public/
    components/    editor/, notes/, tags/, share/, versions/, layout/
    hooks/         TanStack Query hooks (useNotes, useTags, useSearch, etc.)
    store/         authStore.ts (Zustand), uiStore.ts (Zustand)
    lib/           apiClient.ts (Axios), queryClient.ts

packages/shared/   Shared TypeScript types + Zod schemas — imported by both apps
  src/
    schemas/       auth, notes, tags, search, shares
    types/         api.types.ts, auth.types.ts, errors.types.ts

docs/              FRS-NoteTakingApp.docx, SDS-NoteTakingApp.docx
```

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22 |
| Backend framework | Express 5 |
| Frontend framework | React 19 |
| Language | TypeScript (both apps + shared) |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| Validation | Zod (in packages/shared, used by both apps) |
| Frontend state | Zustand (auth + UI state) |
| Data fetching | TanStack Query v5 |
| Rich text editor | TipTap |
| UI components | shadcn/ui |
| HTTP client | Axios |
| Routing | React Router v6 |
| Build tool | Vite (web), tsc (api) |
| Package manager | pnpm (workspace monorepo) |
| Unit/integration tests | Vitest + Supertest |
| Component tests | Vitest + React Testing Library + MSW |
| E2E tests | Playwright |

---

## 4. Key Commands

```bash
pnpm install                        # Install all workspace dependencies
pnpm --filter api dev               # API dev server on :3001
pnpm --filter web dev               # Web dev server on :5173
pnpm -r build                       # Build all packages
pnpm -r test                        # Run all tests
pnpm -r lint                        # Lint all packages
pnpm --filter api test:coverage     # API coverage report
pnpm --filter web test:coverage     # Web coverage report
pnpm --filter api prisma migrate dev   # Run DB migrations (dev)
pnpm --filter api prisma migrate deploy # Run DB migrations (prod/CI)
pnpm --filter api prisma studio     # Open Prisma Studio
npx playwright test                 # Run E2E tests (full stack must be running)
```

---

## 5. Architecture Patterns

**Backend (apps/api):** Strict layered architecture.
- Request → Route → `validateMiddleware` (Zod) → `authMiddleware` (JWT) → Service → Prisma
- Middleware registration order: cors → helmet → express.json → rateLimit → authMiddleware → validateMiddleware → errorMiddleware
- Services own all business logic. Routes are thin.
- Authorization is enforced in the **service layer** by scoping every DB query with `userId`.
- Errors are thrown as `AppError` instances and caught by the global `errorMiddleware`.

**Frontend (apps/web):** Feature-based component structure.
- TanStack Query hooks in `hooks/` own all server state.
- Zustand stores in `store/` own client-only state (access token, modal open/closed).
- Axios interceptor in `lib/apiClient.ts` handles silent refresh on 401.
- TipTap editor autosaves via 2-second debounce (`setTimeout` cleared on re-render).

**Shared (packages/shared):** Zero runtime code except Zod. Re-exports everything from `index.ts`.

---

## 6. Coding Standards

**Naming:**
- TypeScript: `camelCase` for variables/functions, `PascalCase` for types/components, `UPPER_SNAKE_CASE` for error codes
- Files: `feature.service.ts`, `feature.routes.ts`, `FeatureComponent.tsx`
- DB columns: Prisma camelCase maps to PostgreSQL snake_case automatically

**Error handling:**
- All service errors are thrown as `AppError(code, message, statusCode, fields?)`
- `errorMiddleware` maps them to `{ error: { code, message, fields? } }`
- Frontend keys on `error.code` (a string constant) for error handling

**Response shapes — never deviate:**
```ts
// Success list:  { data: T[], meta: PaginationMeta }
// Success item:  T (the object directly)
// Error:         { error: { code: string, message: string, fields?: Record<string, string> } }
```

**Transactions:** Any operation that mutates multiple tables must use `prisma.$transaction()`.

---

## 7. Auth Approach

- **Access token:** JWT (HS256), 15-min expiry, `sub=userId`. Stored **in Zustand memory only** — never localStorage.
- **Refresh token:** Cryptographically random bytes. Raw value stored in **HttpOnly, Secure, SameSite=Strict cookie**. SHA-256 hash stored in DB.
- **Rotation:** Every `/auth/refresh` call atomically revokes the old token and inserts a new one.
- **On app load:** Attempt silent refresh via cookie. If it fails, redirect to `/login`.
- **On logout / password reset:** All refresh tokens for the user are revoked immediately.
- `req.user` is populated by `authMiddleware` from the JWT. **Never trust `userId` from request body.**

---

## 8. API Design Conventions

- **Base path:** `/api/v1`
- **Auth:** `Authorization: Bearer <accessToken>` on all protected routes
- **Public route:** `GET /public/notes/:token` — no auth middleware
- **Status codes:** 201 (create), 200 (read/update), 204 (delete), 400 (validation), 401 (auth), 404 (not found or cross-user), 409 (conflict)
- **404 over 403:** Cross-user resource access always returns 404 — never 403 — to prevent enumeration
- **Pagination:** `{ data: T[], meta: { total, page, limit, totalPages } }` — default page=1, limit=20, max=100
- **Soft delete:** `deletedAt` timestamp. Deleted resources return 404 on all endpoints.
- **Rate limits:** 10 req/15min/IP on `/auth/register` and `/auth/login`; 5 req/15min/IP on `/auth/forgot-password`

---

## 9. DB Schema Summary

| Table | Key Columns |
|---|---|
| `User` | id (cuid), email (unique, lowercase), passwordHash, createdAt, updatedAt |
| `RefreshToken` | id, token (SHA-256 hash, unique), userId, expiresAt, revokedAt |
| `Note` | id, userId, title (varchar 255), content (JSONB TipTap), contentText, ts (tsvector generated), deletedAt, createdAt, updatedAt |
| `Tag` | id, userId, name (varchar 50), color (varchar 7, nullable), unique(userId+name) |
| `NoteTag` | noteId + tagId (composite PK), cascade deletes |
| `NoteVersion` | id, noteId, title, content (JSONB), savedAt |
| `ShareLink` | id, noteId, userId, token (UUID, unique), expiresAt, revokedAt, viewCount |
| `PasswordResetOTP` | id, userId, code (6 digits), expiresAt, usedAt |

**FTS:** The `ts` column on `Note` is a PostgreSQL `GENERATED ALWAYS AS` tsvector from `title + contentText`. Added via raw SQL migration (Prisma does not support generated columns natively). GIN index on `ts`. FTS queries use `plainto_tsquery()` and `ts_headline()`.

---

## 10. Testing Approach

| Layer | Tool | Database | Location |
|---|---|---|---|
| Unit (services) | Vitest | Prisma mocks | `apps/api/src/**/*.test.ts` |
| Integration (API) | Vitest + Supertest | Real PostgreSQL (`nta_test`) | `apps/api/src/**/*.integration.ts` |
| Component (UI) | Vitest + RTL + MSW | None | `apps/web/src/**/*.test.tsx` |
| E2E | Playwright | Full stack running | `e2e/` |

**Integration DB isolation:** Each test file runs `TRUNCATE ... CASCADE` in `beforeEach`. `DATABASE_URL_TEST` env var points to the test DB. Run `prisma migrate deploy` before the suite.

**Coverage gate:** ≥80% line + branch for all service and hook code; ≥90% for `packages/shared` schemas.

```bash
pnpm --filter api test              # Unit + integration
pnpm --filter web test              # Component tests
npx playwright test                 # E2E (requires running api + db)
```

---

## 11. Do NOT Do

- **Never** store the access token in `localStorage` or `sessionStorage` — XSS risk
- **Never** use `req.body.userId` to scope DB queries — always use `req.user.id` from JWT
- **Never** do read-modify-write on `viewCount` — use `{ increment: 1 }` (atomic UPDATE)
- **Never** use string interpolation in `prisma.$queryRaw` — use tagged template literals only
- **Never** use `to_tsquery()` for user input — use `plainto_tsquery()` to sanitize operators
- **Never** return 403 for cross-user resource access — return 404 to prevent enumeration
- **Never** enforce authorization at the route layer only — it must be in the service layer
- **Never** put shared types or Zod schemas in `apps/api` or `apps/web` — they go in `packages/shared`
- **Never** import from `apps/api` or `apps/web` inside `packages/shared`
- **Never** add runtime dependencies to `packages/shared` other than `zod`
- **Never** commit `.env` files — use `.env.example` with placeholders
- **Never** skip the version snapshot when updating a note — it must be in the same transaction
- **Never** physically delete a note within 30 days — use soft delete (`deletedAt`)

---

## 12. Shared Packages (`packages/shared`)

**schemas/** — Zod schemas (the validation source of truth for both API and frontend forms):
- `auth.schemas.ts` — `RegisterSchema`, `LoginSchema`, `ForgotPasswordSchema`, `ResetPasswordSchema`
- `notes.schemas.ts` — `CreateNoteSchema`, `UpdateNoteSchema`, `NoteListQuerySchema`
- `tags.schemas.ts` — `CreateTagSchema`, `UpdateTagSchema`
- `search.schemas.ts` — `SearchQuerySchema`
- `shares.schemas.ts` — `CreateShareSchema`

**types/** — TypeScript types for API response shapes:
- `api.types.ts` — `NoteDetail`, `NoteListItem`, `SearchResult`, `TagSummary`, `PaginationMeta`, `ShareLink`
- `auth.types.ts` — `AuthResponse`, `UserProfile`
- `errors.types.ts` — `AppErrorCode` (union of all error code strings)

**Rule:** Adding a field to any API response requires updating the shared type here **first** before touching either app. Both apps import as `'shared'` via pnpm workspace protocol (`"shared": "workspace:*"`).
