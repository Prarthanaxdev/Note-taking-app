# Note Taking App — Developer Onboarding

Full-stack monorepo for a rich-text note-taking application. Authenticated users can create, edit, tag, search, and share notes with version history. Anonymous visitors can view shared notes via a public link.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 22, Express 5, Prisma ORM |
| Frontend | React 19, Vite, TanStack Query v5, Zustand, TipTap |
| Database | PostgreSQL 16 |
| Language | TypeScript (strict) across all packages |
| Validation | Zod (shared between API and frontend) |
| UI components | shadcn/ui + Tailwind CSS |
| Testing | Vitest + Supertest (API), Vitest + RTL + MSW (web), Playwright (E2E) |
| Package manager | pnpm workspaces |

---

## Repo Structure

```
apps/
  api/          Express REST API — auth, notes, tags, search, shares, versions
    prisma/     Prisma schema + migrations
    src/
      lib/      jwt.ts, hash.ts, prisma.ts, otp.ts, errors.ts
      middleware/
      routes/
      services/
      test/     integration-setup.ts
  web/          React SPA
    src/
      components/
      hooks/    TanStack Query hooks
      pages/
      store/    authStore.ts (Zustand), uiStore.ts
      lib/      apiClient.ts (Axios), queryClient.ts

packages/
  shared/       Zod schemas + TypeScript types — imported by both apps

docs/           FRS and SDS reference documents
e2e/            Playwright journey tests
openspec/       Change specs and implementation plans
```

---

## Prerequisites

- **Node.js** 22+
- **pnpm** 9+ — `npm install -g pnpm`
- **PostgreSQL** 16 — running locally with two databases:
  - `nta_dev` (development)
  - `nta_test` (integration tests)

Create the databases:
```bash
psql -U postgres -c "CREATE DATABASE nta_dev;"
psql -U postgres -c "CREATE DATABASE nta_test;"
```

---

## Local Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit `apps/api/.env` and fill in your PostgreSQL credentials:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nta_dev"
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5432/nta_test"
JWT_SECRET="<random string, minimum 32 characters>"
```

The web `.env` only needs updating for production deploys — Vite proxies `/api` to `localhost:3001` in dev automatically.

### 3. Run database migrations

```bash
# Development DB
pnpm --filter api prisma migrate dev

# Test DB (required before running integration tests)
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5432/nta_test" \
  pnpm --filter api prisma migrate deploy
```

### 4. Generate Prisma client

```bash
pnpm --filter api prisma generate
```

### 5. Start dev servers

Run both in separate terminals:

```bash
pnpm --filter api dev     # API on http://localhost:3001
pnpm --filter web dev     # Web on http://localhost:5173
```

The web dev server proxies all `/api` requests to the API — no CORS setup needed locally.

---

## Key Commands

```bash
# Development
pnpm --filter api dev           # API dev server (tsx watch)
pnpm --filter web dev           # Vite dev server

# Build
pnpm -r build                   # Build all packages

# Tests
pnpm -r test                    # All unit + integration tests
pnpm --filter api test          # API tests only
pnpm --filter web test          # Web component tests only
npx playwright test             # E2E tests (requires both servers running)

# Coverage
pnpm --filter api test:coverage
pnpm --filter web test:coverage

# Lint
pnpm -r lint

# Database
pnpm --filter api prisma migrate dev     # Apply new migrations (dev)
pnpm --filter api prisma migrate deploy  # Apply migrations (prod/CI)
pnpm --filter api prisma studio          # Open Prisma Studio GUI
pnpm --filter api prisma generate        # Regenerate Prisma client after schema changes
```

---

## Architecture in 60 Seconds

**API request flow:**

```
Request → CORS → Helmet → express.json → rateLimit → authenticate → validate → Route handler → Service → Prisma → DB
```

- **Routes** are thin — no business logic.
- **Services** own all business logic and enforce authorization by scoping every DB query with `userId` from `req.user` (populated by `authenticate` from the JWT).
- **Error handling** uses `AppError` instances thrown from services, caught by the global `errorMiddleware`, formatted as `{ error: { code, message, fields? } }`.
- **Access token** — JWT (HS256), 15-min expiry, stored in Zustand memory only (never `localStorage`).
- **Refresh token** — random 64-char hex, SHA-256 hash stored in DB, raw value in an `HttpOnly; SameSite=Strict` cookie. Every use rotates the token atomically.

**Frontend data flow:**

```
Component → TanStack Query hook (hooks/) → Axios (lib/apiClient.ts) → API
```

- All server state lives in TanStack Query hooks.
- Client-only state (access token, modal flags) lives in Zustand stores.
- The Axios response interceptor handles silent token refresh on `401` transparently.

---

## Quality Gates

All three must pass before every commit (enforced by Husky pre-commit hook):

```bash
pnpm -r lint    # 1. No lint errors
pnpm -r build   # 2. No type errors
pnpm -r test    # 3. No test regressions
```

Coverage minimums: ≥ 80% line + branch for API services and web hooks; ≥ 90% for `packages/shared` schemas.

---

## Branch and Commit Conventions

**Branch naming:**
```
<type>/<ticket-id>-<short-slug>

Examples:
  feat/AB-1012-note-editor
  fix/AB-1007-fts-sanitize-input
```

**Commit format** (enforced by commitlint):
```
<type>(<scope>): <imperative summary, max 72 chars>

Types:  feat | fix | refactor | test | chore | docs
Scopes: api  | web | shared   | db   | infra
```

---

## OTP / Password Reset

There is no email integration. OTP codes for password reset are printed to the **API server stdout** only. When testing the forgot-password flow locally, watch the terminal running `pnpm --filter api dev`.

---

## Running E2E Tests

Both servers must be running and the dev DB must have migrations applied:

```bash
# Terminal 1
pnpm --filter api dev

# Terminal 2
pnpm --filter web dev

# Terminal 3
npx playwright test
npx playwright test --ui    # interactive mode
```
