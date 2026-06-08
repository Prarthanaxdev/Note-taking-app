# Implementation Plan — AB-1001: Monorepo Scaffold

| Field | Value |
|---|---|
| Ticket | AB-1001 |
| Status | **Awaiting Approval** |
| Scope | Infrastructure only — no business logic |
| Depends on | Nothing (first ticket) |
| Unblocks | All other tickets (AB-1002 through AB-1016) |

---

## 1. Goal

Stand up the complete monorepo skeleton: pnpm workspaces, TypeScript configs, Prisma schema + initial migration, Express entry point, Vite entry point, shared types/schemas package, Husky hooks, and Vitest configs. No feature logic is implemented in this ticket.

---

## 2. Files to Create

### 2.1 Root Level

| File | Purpose |
|---|---|
| `package.json` | Workspace root — scripts, husky, commitlint, shared devDependencies |
| `pnpm-workspace.yaml` | Declares workspace packages |
| `.npmrc` | pnpm settings (`auto-install-peers=true`) |
| `tsconfig.base.json` | Shared strict TypeScript config extended by all packages |
| `commitlint.config.ts` | Conventional commit rules with project scopes (api/web/shared/db/infra) |
| `.husky/pre-commit` | Runs `pnpm -r lint && pnpm -r build` before every commit |
| `.husky/commit-msg` | Runs `npx --no -- commitlint --edit $1` |
| `.gitignore` | node_modules, dist, .env, .DS_Store, coverage |
| `playwright.config.ts` | Playwright stub: baseURL=http://localhost:5173, chromium only for now |
| `e2e/.gitkeep` | Placeholder so e2e/ is tracked by git |

### 2.2 packages/shared

| File | Purpose |
|---|---|
| `packages/shared/package.json` | `name: "shared"`, `exports: "./src/index.ts"`, dep: zod only |
| `packages/shared/tsconfig.json` | Extends `../../tsconfig.base.json`, `module: NodeNext` |
| `packages/shared/vitest.config.ts` | Node environment, coverage gate ≥90% |
| `packages/shared/src/index.ts` | Re-exports everything from schemas/ and types/ |
| `packages/shared/src/schemas/auth.schemas.ts` | RegisterSchema, LoginSchema, ForgotPasswordSchema, ResetPasswordSchema |
| `packages/shared/src/schemas/notes.schemas.ts` | CreateNoteSchema, UpdateNoteSchema, NoteListQuerySchema |
| `packages/shared/src/schemas/tags.schemas.ts` | CreateTagSchema, UpdateTagSchema |
| `packages/shared/src/schemas/search.schemas.ts` | SearchQuerySchema |
| `packages/shared/src/schemas/shares.schemas.ts` | CreateShareSchema |
| `packages/shared/src/types/api.types.ts` | NoteDetail, NoteListItem, SearchResult, TagSummary, PaginationMeta, ShareLink |
| `packages/shared/src/types/auth.types.ts` | AuthResponse, UserProfile |
| `packages/shared/src/types/errors.types.ts` | AppErrorCode union of all 14 error codes |

### 2.3 apps/api

| File | Purpose |
|---|---|
| `apps/api/package.json` | All backend dependencies (see §4) |
| `apps/api/tsconfig.json` | Extends base, `outDir: dist`, `rootDir: src` |
| `apps/api/vitest.config.ts` | Two projects: unit (node env) + integration (node env, separate setup file) |
| `apps/api/.env.example` | All required vars with placeholder values (see §6) |
| `apps/api/src/index.ts` | Express bootstrap: middleware chain stub, router mounting stubs, listen |
| `apps/api/src/lib/prisma.ts` | Singleton PrismaClient (global pattern for dev hot-reload safety) |
| `apps/api/src/lib/errors.ts` | AppError class |
| `apps/api/src/middleware/error.middleware.ts` | Global Express 5 error handler — formats AppError → response envelope |
| `apps/api/src/middleware/auth.middleware.ts` | JWT verify stub — `req.user` type augmentation declared here |
| `apps/api/src/middleware/validate.middleware.ts` | Factory: `validate(schema)` → Express middleware |
| `apps/api/src/middleware/rateLimit.middleware.ts` | Auth rate limiter configs |
| `apps/api/src/routes/auth.routes.ts` | Empty router stub |
| `apps/api/src/routes/notes.routes.ts` | Empty router stub |
| `apps/api/src/routes/tags.routes.ts` | Empty router stub |
| `apps/api/src/routes/shares.routes.ts` | Empty router stub |
| `apps/api/src/routes/versions.routes.ts` | Empty router stub |
| `apps/api/prisma/schema.prisma` | Full schema — all 7 models (see §5) |

> **Migration:** Run `pnpm --filter api prisma migrate dev --name init` after schema is written. This auto-generates `apps/api/prisma/migrations/TIMESTAMP_init/migration.sql`. The FTS raw SQL migration (`001_fts`) is deferred to **AB-1004**.

### 2.4 apps/web

| File | Purpose |
|---|---|
| `apps/web/package.json` | All frontend dependencies (see §4) |
| `apps/web/tsconfig.json` | Extends base, `jsx: react-jsx`, path alias `@/*` → `./src/*` |
| `apps/web/tsconfig.node.json` | For Vite config file itself |
| `apps/web/vite.config.ts` | React plugin, path alias `@/`, proxy `/api` → `http://localhost:3001` |
| `apps/web/index.html` | Vite entry HTML |
| `apps/web/vitest.config.ts` | jsdom env, `setupFiles: src/test/setup.ts`, RTL + MSW |
| `apps/web/src/test/setup.ts` | `@testing-library/jest-dom` import, MSW server lifecycle |
| `apps/web/.env.example` | `VITE_API_BASE_URL=http://localhost:3001/api/v1` |
| `apps/web/tailwind.config.ts` | shadcn/ui preset, content paths |
| `apps/web/postcss.config.js` | Tailwind + autoprefixer |
| `apps/web/components.json` | shadcn/ui config (generated by `npx shadcn@latest init`) |
| `apps/web/src/main.tsx` | Vite entry: `ReactDOM.createRoot`, `<QueryClientProvider>`, `<BrowserRouter>`, `<App>` |
| `apps/web/src/App.tsx` | Route definitions stub — auth guard placeholder, all routes stubbed to `<div>TODO</div>` |
| `apps/web/src/lib/apiClient.ts` | Axios instance + request interceptor (auth header) + response interceptor (silent refresh) |
| `apps/web/src/lib/queryClient.ts` | TanStack QueryClient: staleTime 60s, gcTime 300s, retry 1, refetchOnWindowFocus true |
| `apps/web/src/lib/utils.ts` | shadcn `cn()` util (`clsx` + `tailwind-merge`) |
| `apps/web/src/store/authStore.ts` | Zustand: `accessToken`, `user: UserProfile \| null`, `setAccessToken`, `clearAuth` |
| `apps/web/src/store/uiStore.ts` | Zustand: `shareModalNoteId`, `versionDrawerNoteId`, open/close actions |

---

## 3. TypeScript Interfaces (final shapes — SDS §5.3)

These exact shapes go into `packages/shared/src/types/`:

```typescript
// api.types.ts
export type TagSummary = {
  id: string;
  name: string;
  color: string | null;
};

export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type NoteListItem = {
  id: string;
  title: string;
  contentPreview: string;   // first 150 chars of contentText
  tags: TagSummary[];
  updatedAt: string;        // ISO 8601
};

export type NoteDetail = {
  id: string;
  title: string;
  content: object | null;   // TipTap JSON
  tags: TagSummary[];
  shareLinksCount: number;
  createdAt: string;
  updatedAt: string;
};

export type SearchResult = {
  id: string;
  title: string;
  headline: string;         // HTML with <mark> tags
  updatedAt: string;
};

export type ShareLink = {
  id: string;
  noteId: string;
  userId: string;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
};

// auth.types.ts
export type AuthResponse = { accessToken: string };
export type UserProfile = { id: string; email: string };

// errors.types.ts
export type AppErrorCode =
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'REFRESH_TOKEN_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_USED'
  | 'OTP_INVALID'
  | 'TITLE_REQUIRED'
  | 'TOO_MANY_TAGS'
  | 'INVALID_TAG'
  | 'TAG_NAME_TAKEN'
  | 'QUERY_REQUIRED'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED';
```

---

## 4. Zod Schemas (final shapes — SDS §5.1–5.4)

```typescript
// auth.schemas.ts
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});
export const ResetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d{6}$/),
  newPassword: z.string().min(8),
});

// notes.schemas.ts
export const CreateNoteSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.unknown().optional(),
  tagIds: z.string().cuid().array().max(5).optional(),
});
export const UpdateNoteSchema = CreateNoteSchema.partial();
export const NoteListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'title']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  tags: z.string().optional(),  // CSV of tag IDs
});

// tags.schemas.ts
export const CreateTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});
export const UpdateTagSchema = CreateTagSchema.partial();

// search.schemas.ts
export const SearchQuerySchema = z.object({
  q: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// shares.schemas.ts
export const CreateShareSchema = z.object({
  expiresAt: z.string().datetime().optional(),
});
```

---

## 5. Prisma Schema (full — SDS §3)

All 7 models go into `apps/api/prisma/schema.prisma` in this ticket. The `ts` tsvector generated column is **NOT** in the Prisma schema (Prisma doesn't support it natively) — it is added via raw SQL migration in AB-1004.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String             @id @default(cuid())
  email         String             @unique
  passwordHash  String
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt
  notes         Note[]
  tags          Tag[]
  refreshTokens RefreshToken[]
  shareLinks    ShareLink[]
  otps          PasswordResetOTP[]
}

model RefreshToken {
  id        String    @id @default(cuid())
  token     String    @unique
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}

model Note {
  id          String        @id @default(cuid())
  userId      String
  user        User          @relation(fields: [userId], references: [id])
  title       String        @db.VarChar(255)
  content     Json?
  contentText String?
  deletedAt   DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  tags        NoteTag[]
  versions    NoteVersion[]
  shareLinks  ShareLink[]

  @@index([userId, deletedAt])
  @@index([userId, updatedAt(sort: Desc)])
}

model Tag {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  name      String    @db.VarChar(50)
  color     String?   @db.VarChar(7)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  notes     NoteTag[]

  @@unique([userId, name])
  @@index([userId])
}

model NoteTag {
  noteId String
  tagId  String
  note   Note   @relation(fields: [noteId], references: [id], onDelete: Cascade)
  tag    Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([noteId, tagId])
}

model NoteVersion {
  id      String   @id @default(cuid())
  noteId  String
  note    Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  title   String   @db.VarChar(255)
  content Json?
  savedAt DateTime @default(now())

  @@index([noteId, savedAt(sort: Desc)])
}

model ShareLink {
  id        String    @id @default(cuid())
  noteId    String
  note      Note      @relation(fields: [noteId], references: [id], onDelete: Cascade)
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  token     String    @unique @default(uuid())
  expiresAt DateTime?
  revokedAt DateTime?
  viewCount Int       @default(0)
  createdAt DateTime  @default(now())

  @@index([token])
  @@index([noteId])
}

model PasswordResetOTP {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  code      String    @db.VarChar(6)
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

---

## 6. Key Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| `tsconfig.base.json` at root | Strict: `noImplicitAny`, `strictNullChecks`, `exactOptionalPropertyTypes` | Catch bugs at compile time, prevent type drift across packages |
| `packages/shared` name alias | `"shared": "workspace:*"` in both apps' `package.json` + `tsconfig paths` | Enables `import { ... } from 'shared'` without relative paths |
| Prisma singleton via `globalThis` | `globalThis.__prisma ??= new PrismaClient()` | Prevents connection pool exhaustion during Vitest hot-reload |
| `req.user` type augmentation | Declared in `auth.middleware.ts` via `declare global { namespace Express { interface Request { user: UserProfile } } }` | TypeScript knows `req.user` exists on all routes using `authenticate` |
| Axios proxy in `vite.config.ts` | `/api` → `http://localhost:3001` | Avoids CORS complexity in dev; production uses real CORS headers |
| shadcn/ui `init` at scaffold time | Run CLI now, add components per-ticket | Generates `components.json`, `tailwind.config.ts`, `globals.css` once — prevents divergent setups |
| Vitest two-project config in API | `unit` project (mocked Prisma) + `integration` project (real DB) | Lets `pnpm test` run both; integration tests skip if `DATABASE_URL_TEST` not set |

---

## 7. Environment Variables

### apps/api/.env.example

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nta_dev"
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5432/nta_test"
JWT_SECRET="change-me-at-least-32-chars-long"
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_DAYS=7
BCRYPT_ROUNDS=10
PORT=3001
CLIENT_ORIGIN="http://localhost:5173"
NODE_ENV=development
OTP_EXPIRES_MINUTES=15
```

### apps/web/.env.example

```
VITE_API_BASE_URL=http://localhost:3001/api/v1
VITE_APP_ENV=development
```

---

## 8. Dependencies

### Root devDependencies
```
husky@^9
@commitlint/cli@^19
@commitlint/config-conventional@^19
typescript@^5.4
```

### packages/shared
```
# dependencies
zod@^3.23

# devDependencies
typescript@^5.4
vitest@^2
@vitest/coverage-v8@^2
```

### apps/api
```
# dependencies
express@^5
@prisma/client@^5
jsonwebtoken@^9
bcryptjs@^2
cors@^2
helmet@^7
express-rate-limit@^7
shared@workspace:*

# devDependencies
prisma@^5
typescript@^5.4
tsx@^4
nodemon@^3
@types/express@^5
@types/jsonwebtoken@^9
@types/bcryptjs@^2
@types/cors@^2
@types/node@^22
vitest@^2
@vitest/coverage-v8@^2
supertest@^7
@types/supertest@^6
eslint@^9
```

### apps/web
```
# dependencies
react@^19
react-dom@^19
react-router-dom@^6
@tanstack/react-query@^5
zustand@^5
axios@^1
@tiptap/react@^2
@tiptap/starter-kit@^2
@tiptap/extension-underline@^2
@tiptap/extension-code-block@^2
react-hook-form@^7
@hookform/resolvers@^3
clsx@^2
tailwind-merge@^2
lucide-react@^0.400
shared@workspace:*

# devDependencies
vite@^5
@vitejs/plugin-react@^4
typescript@^5.4
@types/react@^19
@types/react-dom@^19
tailwindcss@^3
autoprefixer@^10
postcss@^8
vitest@^2
@vitest/coverage-v8@^2
@testing-library/react@^16
@testing-library/jest-dom@^6
@testing-library/user-event@^14
msw@^2
jsdom@^24
eslint@^9
```

---

## 9. Implementation Order

Tasks must be done in this order to avoid broken intermediary states:

1. **Root config** — `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `tsconfig.base.json`, `.gitignore`
2. **Run `pnpm install`** — installs all workspace deps
3. **packages/shared** — types first, then schemas, then `index.ts`, then vitest config
4. **apps/api skeleton** — `package.json`, tsconfig, `lib/errors.ts`, `lib/prisma.ts`, middleware stubs, route stubs, `src/index.ts`
5. **Prisma schema** — write `schema.prisma`, run `prisma generate`, run `prisma migrate dev --name init`
6. **apps/web skeleton** — `package.json`, tsconfig, vite config, `lib/`, `store/`, `main.tsx`, `App.tsx`
7. **shadcn/ui init** — run `npx shadcn@latest init` in `apps/web`
8. **Husky** — `pnpm exec husky init`, write hook files
9. **commitlint** — `commitlint.config.ts`

---

## 10. Quality Gate Checkpoints

Run in this order after implementation:

```bash
# 1. Shared package builds cleanly
pnpm --filter shared build

# 2. API type-checks with Prisma client generated
pnpm --filter api prisma generate
pnpm --filter api build

# 3. Web type-checks
pnpm --filter web build

# 4. Lint everything
pnpm -r lint

# 5. Shared schema tests (≥90% coverage gate)
pnpm --filter shared test --coverage

# 6. API vitest (unit pass; integration skipped if DB not running)
pnpm --filter api test

# 7. Web vitest
pnpm --filter web test
```

All must pass before this ticket is closed.

---

## 11. Out of Scope (explicitly deferred)

- JWT signing/verification (`lib/jwt.ts`) → **AB-1002**
- bcrypt/hash helpers (`lib/hash.ts`) → **AB-1002**
- OTP logic (`lib/otp.ts`) → **AB-1003**
- FTS tsvector raw SQL migration (`001_fts`) → **AB-1004**
- Any implemented route handler or service function → AB-1002+
- Any implemented React page/component → AB-1010+
- Playwright E2E test content → **AB-1016**
- `docker-compose.yml` for test DB — optional, add if needed for CI

---

## 12. Commit Plan

```
chore(infra): scaffold pnpm monorepo workspace structure
chore(shared): add all Zod schemas and TypeScript types
chore(api): bootstrap Express app with middleware chain and Prisma singleton
chore(db): add Prisma schema with all models and initial migration
chore(web): bootstrap Vite + React + TanStack Query + Zustand skeleton
chore(infra): configure Husky hooks and commitlint
```

Each commit passes all three quality gates (lint → build → test) before the next one starts.
