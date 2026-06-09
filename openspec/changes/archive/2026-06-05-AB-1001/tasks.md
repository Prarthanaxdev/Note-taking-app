# Task Checklist — AB-1001: Monorepo Scaffold

| Field | Value |
|---|---|
| Ticket | AB-1001 |
| Status | **Awaiting Approval** |
| Plan ref | `openspec/changes/AB-1001/plan.md` |
| Total tasks | 42 |

Legend: `[ ]` = todo · `[x]` = done · `[~]` = in progress · `[P]` = can run in parallel with sibling `[P]` tasks

---

## Phase 1 — Root & Shared Foundation

> Everything downstream depends on this phase. Must complete fully before Phase 2.

### 1.1 Workspace Root

- [ ] **T01** Create `pnpm-workspace.yaml`
  ```yaml
  packages:
    - 'apps/*'
    - 'packages/*'
  ```

- [ ] **T02** Create root `package.json`
  - Workspace scripts: `build`, `lint`, `test` (all using `-r`)
  - devDependencies: `husky@^9`, `@commitlint/cli@^19`, `@commitlint/config-conventional@^19`, `typescript@^5.4`
  - `"prepare": "husky"` script

- [ ] **T03** Create `.npmrc`
  ```
  auto-install-peers=true
  ```

- [ ] **T04** Create `tsconfig.base.json`
  - `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`
  - `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`
  - `skipLibCheck: true`, `forceConsistentCasingInFileNames: true`
  - `moduleResolution: bundler` (overridden per-package as needed)

- [ ] **T05** Create `.gitignore`
  - Entries: `node_modules/`, `dist/`, `.env`, `*.env.local`, `coverage/`, `.DS_Store`, `*.tsbuildinfo`

- [ ] **T06** Create `playwright.config.ts` (stub)
  - `use.baseURL = 'http://localhost:5173'`
  - `projects: [{ name: 'chromium' }]`
  - `testDir: './e2e'`

- [ ] **T07** Create `e2e/.gitkeep`

- [ ] **T08** Run `pnpm install`
  - Verify: `node_modules/.pnpm` exists, no errors

---

### 1.2 packages/shared — Types First

> Types must exist before schemas reference them, and before apps import anything.

- [ ] **T09** Create `packages/shared/package.json`
  - `"name": "shared"`, `"version": "0.0.1"`
  - `"exports": { ".": "./src/index.ts" }`
  - dependencies: `zod@^3.23`
  - devDependencies: `typescript@^5.4`, `vitest@^2`, `@vitest/coverage-v8@^2`

- [ ] **T10** Create `packages/shared/tsconfig.json`
  - Extends `../../tsconfig.base.json`
  - `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`
  - `"rootDir": "src"`, `"outDir": "dist"`

- [ ] **T11** Create `packages/shared/src/types/errors.types.ts`
  - Export `AppErrorCode` union with all 14 codes from plan §3
  - This file must exist first — API service code will import it

- [ ] **T12** Create `packages/shared/src/types/auth.types.ts`
  - Export `AuthResponse`, `UserProfile`

- [ ] **T13** Create `packages/shared/src/types/api.types.ts`
  - Export `TagSummary`, `PaginationMeta`, `NoteListItem`, `NoteDetail`, `SearchResult`, `ShareLink`
  - Exact shapes from plan §3

---

### 1.3 packages/shared — Schemas

- [ ] **T14** Create `packages/shared/src/schemas/auth.schemas.ts`
  - `RegisterSchema`, `LoginSchema`, `ForgotPasswordSchema`, `ResetPasswordSchema`
  - OTP regex: `/^\d{6}$/`, length: 6

- [ ] **T15** Create `packages/shared/src/schemas/notes.schemas.ts`
  - `CreateNoteSchema`, `UpdateNoteSchema` (`.partial()`), `NoteListQuerySchema`
  - `tagIds: z.string().cuid().array().max(5).optional()`
  - Query: coerce page/limit, enum sortBy/sortOrder with defaults

- [ ] **T16** Create `packages/shared/src/schemas/tags.schemas.ts`
  - `CreateTagSchema`, `UpdateTagSchema`
  - Color regex: `/^#[0-9A-Fa-f]{6}$/`

- [ ] **T17** Create `packages/shared/src/schemas/search.schemas.ts`
  - `SearchQuerySchema` — `q: z.string().min(1)`, coerced page/limit

- [ ] **T18** Create `packages/shared/src/schemas/shares.schemas.ts`
  - `CreateShareSchema` — `expiresAt: z.string().datetime().optional()`

- [ ] **T19** Create `packages/shared/src/index.ts`
  - Re-export everything from all schemas/ and types/ files
  - Verify: every exported name from all 8 source files appears here

- [ ] **T20** Create `packages/shared/vitest.config.ts`
  - `environment: 'node'`
  - `coverage: { provider: 'v8', thresholds: { lines: 90, branches: 90 } }`

---

### ✅ Phase 1 Checkpoint

```bash
pnpm --filter shared build          # 0 type errors
pnpm --filter shared lint           # 0 warnings
pnpm --filter shared test           # all pass (stubs pass — real tests added in Phase 4)
```

---

## Phase 2 — API & Web Skeletons

> T21–T24 are independent and can be done in parallel. T25+ within each app are sequential.

### 2.1 apps/api — Config

- [P] **T21** Create `apps/api/package.json`
  - All dependencies from plan §8 (api section)
  - `"shared": "workspace:*"` in dependencies
  - Scripts: `dev` (tsx watch), `build` (tsc), `test` (vitest), `lint` (eslint), `test:coverage`
  - `prisma` scripts: `migrate:dev`, `migrate:deploy`, `generate`, `studio`

- [P] **T22** Create `apps/api/tsconfig.json`
  - Extends `../../tsconfig.base.json`
  - `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"outDir": "dist"`, `"rootDir": "src"`
  - paths: `"shared": ["../../packages/shared/src/index.ts"]`

- [P] **T23** Create `apps/api/vitest.config.ts`
  - Two Vitest projects:
    - `unit`: glob `**/*.test.ts`, environment `node`
    - `integration`: glob `**/*.integration.ts`, environment `node`, `setupFiles: src/test/integration-setup.ts`
  - coverage threshold: lines 80, branches 80

- [P] **T24** Create `apps/api/.env.example` (all vars from plan §7, placeholder values only)

### 2.2 apps/api — Library & Middleware

> Run after T21–T24, in order within this section.

- [ ] **T25** Create `apps/api/src/lib/errors.ts`
  - `AppError extends Error` with `code: AppErrorCode`, `statusCode: number`, `fields?: Record<string, string>`
  - Import `AppErrorCode` from `'shared'`

- [ ] **T26** Create `apps/api/src/lib/prisma.ts`
  - Singleton via `globalThis.__prisma ??= new PrismaClient()`
  - Export named `prisma`

- [ ] **T27** Create `apps/api/src/middleware/error.middleware.ts`
  - Express 5 error handler: `(err, req, res, next)`
  - Maps `AppError` → `{ error: { code, message, fields? } }` with correct status
  - Maps unknown errors → `500 { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }`

- [ ] **T28** Create `apps/api/src/middleware/validate.middleware.ts`
  - Factory: `validate(schema: ZodSchema, target?: 'body' | 'query')` → Express RequestHandler
  - On success: calls `next()`
  - On failure: throws `AppError('VALIDATION_ERROR', 'Invalid input.', 400, fieldErrors)`

- [ ] **T29** Create `apps/api/src/middleware/auth.middleware.ts`
  - `declare global { namespace Express { interface Request { user: UserProfile } } }` at top
  - `authenticate` function: reads `Authorization: Bearer <token>`, verifies JWT stub (throws `UNAUTHORIZED` — actual JWT logic in AB-1002)
  - For now: stub that reads the header and sets `req.user = { id: '', email: '' }` (real impl in AB-1002)

- [ ] **T30** Create `apps/api/src/middleware/rateLimit.middleware.ts`
  - `authLimiter`: 10 req / 15 min per IP (for `/auth/register` and `/auth/login`)
  - `forgotPasswordLimiter`: 5 req / 15 min per IP
  - Uses `express-rate-limit`

- [ ] **T31** Create route stub files (all 5)
  - `apps/api/src/routes/auth.routes.ts` — `export const authRouter = Router()`
  - `apps/api/src/routes/notes.routes.ts` — `export const notesRouter = Router()`
  - `apps/api/src/routes/tags.routes.ts` — `export const tagsRouter = Router()`
  - `apps/api/src/routes/shares.routes.ts` — `export const sharesRouter = Router()`
  - `apps/api/src/routes/versions.routes.ts` — `export const versionsRouter = Router()`

- [ ] **T32** Create `apps/api/src/index.ts`
  - Register middleware in order: cors → helmet → express.json → errorMiddleware
  - Mount routers: `/api/v1/auth`, `/api/v1/notes`, `/api/v1/tags`, `/api/v1/shares`, `/api/v1/public`
  - `app.listen(PORT)` with startup log
  - Export `app` for Supertest use in tests

### 2.3 apps/web — Config & Libraries

- [P] **T33** Create `apps/web/package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `vitest.config.ts`, `tailwind.config.ts`, `postcss.config.js`
  - `vite.config.ts`: React plugin, `@/` path alias → `./src`, server proxy `/api` → `http://localhost:3001`
  - `vitest.config.ts`: `environment: 'jsdom'`, `setupFiles: ['src/test/setup.ts']`, coverage ≥80%
  - `apps/web/.env.example`

- [ ] **T34** Create `apps/web/src/test/setup.ts`
  - Import `@testing-library/jest-dom`
  - MSW server start/reset/stop lifecycle hooks

- [ ] **T35** Create `apps/web/src/lib/utils.ts`, `apps/web/src/lib/queryClient.ts`, `apps/web/src/lib/apiClient.ts`
  - `utils.ts`: `cn()` via `clsx` + `tailwind-merge`
  - `queryClient.ts`: `new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, gcTime: 300_000, retry: 1, refetchOnWindowFocus: true } } })`
  - `apiClient.ts`: Axios instance, request interceptor (attach Bearer token from Zustand), response interceptor (silent refresh queue pattern from SDS §6.3)

- [ ] **T36** Create `apps/web/src/store/authStore.ts` and `apps/web/src/store/uiStore.ts`
  - `authStore`: `accessToken: string | null`, `user: UserProfile | null`, `setAccessToken(token)`, `setUser(user)`, `clearAuth()`
  - `uiStore`: `shareModalNoteId: string | null`, `versionDrawerNoteId: string | null`, open/close actions

- [ ] **T37** Create `apps/web/src/main.tsx` and `apps/web/src/App.tsx`
  - `main.tsx`: `ReactDOM.createRoot` wrapping `<QueryClientProvider>` → `<BrowserRouter>` → `<App />`
  - `App.tsx`: stub routes using `<Routes>`/`<Route>` — all routes render `<div>TODO: {name}</div>` — auth guard hook placeholder comment

- [ ] **T38** Run `npx shadcn@latest init` inside `apps/web`
  - Accept defaults; verify `components.json` generated and `src/lib/utils.ts` aligns with `cn()` util

---

### ✅ Phase 2 Checkpoint

```bash
pnpm install                        # no new install errors after package.json changes
pnpm --filter api build             # 0 type errors (Prisma client not yet generated — see Phase 3)
pnpm --filter web build             # 0 type errors
pnpm -r lint                        # 0 warnings across all packages
```

---

## Phase 3 — Database & Developer Tooling

### 3.1 Prisma

- [ ] **T39** Create `apps/api/prisma/schema.prisma`
  - All 7 models from plan §5 verbatim
  - Verify: `generator client { provider = "prisma-client-js" }`, datasource uses `env("DATABASE_URL")`
  - Sub-task: run `pnpm --filter api prisma generate` — verify `node_modules/.prisma/client` created

- [ ] **T40** Run initial DB migration
  - Pre-condition: `DATABASE_URL` env var set to `nta_dev` database (must exist)
  - Run: `pnpm --filter api prisma migrate dev --name init`
  - Sub-task: verify `apps/api/prisma/migrations/TIMESTAMP_init/migration.sql` exists and contains `CREATE TABLE "User"`, `CREATE TABLE "Note"`, all 7 tables
  - Sub-task: run `pnpm --filter api build` again — now includes Prisma-generated types (0 errors)

### 3.2 Developer Tooling

- [ ] **T41** Configure Husky and commitlint
  - Run `pnpm exec husky init`
  - Write `.husky/pre-commit`:
    ```sh
    pnpm -r lint
    pnpm -r build
    ```
  - Write `.husky/commit-msg`:
    ```sh
    npx --no -- commitlint --edit $1
    ```
  - Create `commitlint.config.ts`:
    ```ts
    export default {
      extends: ['@commitlint/config-conventional'],
      rules: {
        'scope-enum': [2, 'always', ['api', 'web', 'shared', 'db', 'infra']],
        'header-max-length': [2, 'always', 72],
      },
    };
    ```
  - Sub-task: verify hook fires — run `git commit --allow-empty -m "test"` and confirm commitlint rejects bad message

---

### ✅ Phase 3 Checkpoint

```bash
pnpm -r build                       # 0 errors (Prisma types now included)
pnpm -r lint                        # 0 warnings
pnpm --filter api prisma generate   # exits 0
```

---

## Phase 4 — Tests

> One test per spec scenario. Coverage gate: ≥90% for shared, ≥80% for api/web.

### 4.1 packages/shared — Schema Tests

Create `packages/shared/src/schemas/__tests__/auth.schemas.test.ts`:

- [ ] **T42-a** `RegisterSchema` — valid email + password ≥8 chars → parses without error
- [ ] **T42-b** `RegisterSchema` — invalid email format → `ZodError` on `email` field
- [ ] **T42-c** `RegisterSchema` — password < 8 chars → `ZodError` on `password` field
- [ ] **T42-d** `LoginSchema` — valid → parses
- [ ] **T42-e** `LoginSchema` — empty password string → `ZodError` (min 1)
- [ ] **T42-f** `ForgotPasswordSchema` — valid email → parses; non-email → `ZodError`
- [ ] **T42-g** `ResetPasswordSchema` — valid (email + 6 digits + password ≥8) → parses
- [ ] **T42-h** `ResetPasswordSchema` — OTP with 5 digits → `ZodError` on `otp`
- [ ] **T42-i** `ResetPasswordSchema` — OTP with letters → `ZodError` on `otp` (regex)
- [ ] **T42-j** `ResetPasswordSchema` — newPassword < 8 chars → `ZodError`

Create `packages/shared/src/schemas/__tests__/notes.schemas.test.ts`:

- [ ] **T43-a** `CreateNoteSchema` — valid `{ title, content, tagIds: [cuid] }` → parses
- [ ] **T43-b** `CreateNoteSchema` — title empty string → `ZodError`
- [ ] **T43-c** `CreateNoteSchema` — title > 255 chars → `ZodError`
- [ ] **T43-d** `CreateNoteSchema` — 6 tagIds → `ZodError` (max 5)
- [ ] **T43-e** `CreateNoteSchema` — no content/tagIds → parses (both optional)
- [ ] **T43-f** `UpdateNoteSchema` — empty object → parses (all fields optional)
- [ ] **T43-g** `NoteListQuerySchema` — defaults applied when no input given
- [ ] **T43-h** `NoteListQuerySchema` — `limit=101` → `ZodError` (max 100)
- [ ] **T43-i** `NoteListQuerySchema` — `sortBy='invalid'` → `ZodError`

Create `packages/shared/src/schemas/__tests__/tags.schemas.test.ts`:

- [ ] **T44-a** `CreateTagSchema` — valid name + valid color → parses
- [ ] **T44-b** `CreateTagSchema` — name > 50 chars → `ZodError`
- [ ] **T44-c** `CreateTagSchema` — color without `#` prefix → `ZodError`
- [ ] **T44-d** `CreateTagSchema` — no color → parses (optional)
- [ ] **T44-e** `UpdateTagSchema` — empty object → parses

Create `packages/shared/src/schemas/__tests__/search.schemas.test.ts`:

- [ ] **T45-a** `SearchQuerySchema` — valid `q` → parses
- [ ] **T45-b** `SearchQuerySchema` — empty `q` (`""`) → `ZodError` (min 1)

Create `packages/shared/src/schemas/__tests__/shares.schemas.test.ts`:

- [ ] **T46-a** `CreateShareSchema` — valid ISO datetime → parses
- [ ] **T46-b** `CreateShareSchema` — no `expiresAt` → parses (optional)
- [ ] **T46-c** `CreateShareSchema` — non-datetime string → `ZodError`

### 4.2 apps/api — Unit Tests

Create `apps/api/src/lib/__tests__/errors.test.ts`:

- [ ] **T47-a** `AppError` instance has correct `code`, `message`, `statusCode`, `fields`
- [ ] **T47-b** `AppError` without `fields` → `fields` is `undefined`
- [ ] **T47-c** `AppError` is an instance of `Error` (stack trace available)

Create `apps/api/src/middleware/__tests__/validate.middleware.test.ts`:

- [ ] **T48-a** Valid body matching schema → `next()` called with no error
- [ ] **T48-b** Invalid body → `next(AppError)` called with `code: 'VALIDATION_ERROR'`, status 400, `fields` populated
- [ ] **T48-c** `validate(schema, 'query')` → validates `req.query` not `req.body`

Create `apps/api/src/middleware/__tests__/error.middleware.test.ts`:

- [ ] **T49-a** `AppError` input → response shape `{ error: { code, message } }`, correct HTTP status
- [ ] **T49-b** `AppError` with `fields` → response includes `fields`
- [ ] **T49-c** Unknown error (plain `new Error()`) → 500 response, no stack trace exposed

### 4.3 apps/web — Unit Tests

Create `apps/web/src/store/__tests__/authStore.test.ts`:

- [ ] **T50-a** Initial state: `accessToken: null`, `user: null`
- [ ] **T50-b** `setAccessToken('tok')` → `accessToken` becomes `'tok'`
- [ ] **T50-c** `clearAuth()` → `accessToken` and `user` reset to `null`

Create `apps/web/src/lib/__tests__/queryClient.test.ts`:

- [ ] **T51-a** `staleTime` is `60_000`
- [ ] **T51-b** `retry` is `1`

---

### ✅ Phase 4 Checkpoint (Final Quality Gate)

```bash
pnpm -r lint                                    # 0 warnings
pnpm -r build                                   # 0 errors
pnpm --filter shared test --coverage            # all pass, ≥90% line + branch
pnpm --filter api test --coverage               # all pass, ≥80% line + branch
pnpm --filter web test --coverage               # all pass, ≥80% line + branch
```

---

## Commit Sequence

Each commit is made only after its phase checkpoint passes:

| Commit | After | Message |
|---|---|---|
| 1 | Phase 1 checkpoint | `chore(infra): scaffold pnpm monorepo workspace and tsconfig` |
| 2 | Phase 1 checkpoint | `chore(shared): add all Zod schemas and TypeScript types` |
| 3 | Phase 2 checkpoint | `chore(api): bootstrap Express app with middleware stubs` |
| 4 | Phase 2 checkpoint | `chore(web): bootstrap Vite + React + Zustand + TanStack skeleton` |
| 5 | Phase 3 checkpoint | `chore(db): add Prisma schema with all models and run init migration` |
| 6 | Phase 3 checkpoint | `chore(infra): configure Husky pre-commit and commitlint` |
| 7 | Phase 4 checkpoint | `test(shared): add Zod schema unit tests (≥90% coverage)` |
| 8 | Phase 4 checkpoint | `test(api): add AppError and middleware unit tests` |
| 9 | Phase 4 checkpoint | `test(web): add authStore and queryClient unit tests` |

---

## Out of Scope

All of the following are explicitly **not** in these tasks:

| Item | Ticket |
|---|---|
| `lib/jwt.ts` (sign/verify) | AB-1002 |
| `lib/hash.ts` (bcrypt) | AB-1002 |
| `lib/otp.ts` | AB-1003 |
| FTS raw SQL migration (`001_fts`) | AB-1004 |
| Any route handler body | AB-1002+ |
| Any React page implementation | AB-1010+ |
| Playwright E2E test content | AB-1016 |
