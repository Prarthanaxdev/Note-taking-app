# System Design Specification
## Note Taking Application

| Field | Value |
|---|---|
| Document ID | SDS-NTA-001 |
| Version | 1.0 — DRAFT |
| Date | June 4, 2026 |
| Status | Under Review |
| Project Ref | AB-1001 – AB-1016 |

---

## Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | 2026-06-04 | Engineering Team | Initial draft — derived from SRS-NTA-001 and FRS-NTA-001 |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Overview](#2-system-overview)
3. [Database Design](#3-database-design)
4. [Backend Architecture](#4-backend-architecture-appsapi)
5. [API Endpoint Specifications](#5-api-endpoint-specifications)
6. [Frontend Architecture](#6-frontend-architecture-appsweb)
7. [packages/shared — Types and Schemas](#7-packagesshared--types-and-schemas)
8. [Security Design](#8-security-design)
9. [Testing Design](#9-testing-design)
10. [Environment Configuration](#10-environment-configuration)
11. [Per-Ticket Implementation Checklist](#11-per-ticket-implementation-checklist)

---

## 1. Introduction

### 1.1 Purpose

This System Design Specification (SDS) defines the internal architecture, data models, API contracts, module responsibilities, design patterns, and implementation decisions for the Note Taking Application (NTA). It is the authoritative technical reference for developers during implementation and for reviewers during the `/review` gate.

### 1.2 Document Hierarchy

> `SRS-NTA-001 → FRS-NTA-001 → SDS-NTA-001 (this document)`
>
> - The **SRS** defines WHAT the system must do.
> - The **FRS** defines HOW each feature behaves from a user perspective.
> - The **SDS** defines HOW the system is built internally — architecture, data models, API design, patterns.

### 1.3 Scope

This document covers the full monorepo: `apps/api` (Node.js/Express backend), `apps/web` (React frontend), `packages/shared` (shared types/schemas), and the PostgreSQL 16 database. It specifies every database table, every API endpoint request/response shape, every significant design pattern, and the folder structure each package must follow.

---

## 2. System Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (React 19)                       │
│  TanStack Query  ·  Zustand  ·  TipTap  ·  shadcn/ui            │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTPS REST (JSON)
┌───────────────────────────▼─────────────────────────────────────┐
│                   Express 5 API (Node.js 22)                    │
│  Routes  ·  Middleware  ·  Services  ·  Prisma Client           │
└───────────────────────────┬─────────────────────────────────────┘
                            │ TCP (Prisma connection pool)
┌───────────────────────────▼─────────────────────────────────────┐
│               PostgreSQL 16 (Prisma-managed schema)             │
│  FTS (tsvector/GIN)  ·  Transactions  ·  JSONB content          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Monorepo Package Responsibilities

| Package | Path | Responsibility |
|---|---|---|
| `apps/api` | `apps/api/src/` | Express 5 REST API. Authentication, business logic, DB access via Prisma. No UI rendering. |
| `apps/web` | `apps/web/src/` | React 19 SPA. All UI, client-side state, TanStack Query data fetching, TipTap editor. |
| `packages/shared` | `packages/shared/src/` | Single source of truth for TypeScript types and Zod validation schemas. Imported by both `apps/api` and `apps/web`. No runtime code other than Zod. |

### 2.3 Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Auth storage | Access token in memory (React state/Zustand); refresh token in HttpOnly cookie | Prevents XSS token theft; cookie is inaccessible to JS |
| Refresh strategy | Token rotation on every use; revoke-then-insert atomically | Detects token theft (reuse of revoked token invalidates session) |
| Soft delete | `deletedAt` timestamp; never physical deletion within 30 days | Enables future recovery; audit trail |
| Search | PostgreSQL FTS (`tsvector` + GIN index) | No external service; sufficient for single-tenant search; `ts_headline` for highlighting |
| Validation | Zod schemas in `packages/shared`; used by both Express and React | Single source of truth; no drift between FE and BE validation rules |
| Version snapshots | Created in same transaction as note update | Guarantees no orphaned versions or missing snapshots |
| Share token | UUID v4 (random) | Unpredictable; cannot be guessed or iterated |
| View count | Single atomic `UPDATE ... SET view_count = view_count + 1` | No read-modify-write race condition |
| API error shape | `{ error: { code, message, fields? } }` | Consistent; FE can key on `code` for i18n; `fields` for inline form errors |

---

## 3. Database Design

### 3.1 Prisma Schema

The canonical schema is in `apps/api/prisma/schema.prisma`. The following subsections describe each model in detail.

### 3.2 Users Table

```prisma
model User {
  id           String         @id @default(cuid())
  email        String         @unique
  passwordHash String
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt
  notes        Note[]
  tags         Tag[]
  refreshTokens RefreshToken[]
  shareLinks   ShareLink[]
  otps         PasswordResetOTP[]
}
```

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | String (cuid) | PK | CUID2 preferred for URL-safety and monotonicity |
| `email` | String | UNIQUE, NOT NULL | Stored lowercase. Case-insensitive lookup via `lower()`. |
| `passwordHash` | String | NOT NULL | bcrypt hash, ≥10 rounds. Never plaintext. |
| `createdAt` | DateTime | DEFAULT now() | Auto-set by Prisma |
| `updatedAt` | DateTime | @updatedAt | Auto-updated by Prisma on every write |

### 3.3 RefreshTokens Table

```prisma
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
```

| Column | Type | Notes |
|---|---|---|
| `token` | String (UNIQUE) | SHA-256 hash of the raw refresh token stored in cookie. Raw value never stored. |
| `expiresAt` | DateTime | Set to `now() + 7 days` on creation |
| `revokedAt` | DateTime? | `NULL` = active. Set to `now()` on logout, rotation, or password reset. |

### 3.4 Notes Table

```prisma
model Note {
  id          String        @id @default(cuid())
  userId      String
  user        User          @relation(fields: [userId], references: [id])
  title       String        @db.VarChar(255)
  content     Json?         // TipTap JSON
  contentText String?       // Plain text strip for ts_headline
  // tsvector is a PostgreSQL-generated column — managed via raw migration
  deletedAt   DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  tags        NoteTag[]
  versions    NoteVersion[]
  shareLinks  ShareLink[]

  @@index([userId, deletedAt])
  @@index([userId, updatedAt(sort: Desc)])
}
```

> **⚠️ tsvector Column — Raw Migration Required**
>
> Prisma does not natively support PostgreSQL generated columns. The `tsvector` column and its GIN index must be added via a raw SQL migration file:
>
> ```sql
> ALTER TABLE "Note" ADD COLUMN ts tsvector
>   GENERATED ALWAYS AS (
>     to_tsvector('english', coalesce(title,'') || ' ' || coalesce("contentText",''))
>   ) STORED;
>
> CREATE INDEX note_ts_gin ON "Note" USING GIN(ts);
> ```
>
> This migration must be idempotent and included in the `prisma/migrations/` directory.

### 3.5 Tags Table

```prisma
model Tag {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  name      String    @db.VarChar(50)
  color     String?   @db.VarChar(7)  // e.g. "#FF5733"
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  notes     NoteTag[]

  @@unique([userId, name])  // case-insensitive enforced at service layer
  @@index([userId])
}
```

### 3.6 NoteTags Join Table

```prisma
model NoteTag {
  noteId String
  tagId  String
  note   Note   @relation(fields: [noteId], references: [id], onDelete: Cascade)
  tag    Tag    @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([noteId, tagId])
}
```

### 3.7 NoteVersions Table

```prisma
model NoteVersion {
  id        String   @id @default(cuid())
  noteId    String
  note      Note     @relation(fields: [noteId], references: [id], onDelete: Cascade)
  title     String   @db.VarChar(255)
  content   Json?
  savedAt   DateTime @default(now())

  @@index([noteId, savedAt(sort: Desc)])
}
```

### 3.8 ShareLinks Table

```prisma
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
```

### 3.9 PasswordResetOTPs Table

```prisma
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

## 4. Backend Architecture (apps/api)

### 4.1 Folder Structure

```
apps/api/
  src/
    index.ts              — Express app bootstrap, middleware registration
    routes/
      auth.routes.ts      — /auth/* route definitions
      notes.routes.ts     — /notes/* route definitions
      tags.routes.ts      — /tags/* route definitions
      shares.routes.ts    — /shares/* + /public/notes/* route definitions
      versions.routes.ts  — /notes/:id/versions/* route definitions
    middleware/
      auth.middleware.ts        — JWT verification, req.user population
      error.middleware.ts       — Global error handler (Express 5 style)
      validate.middleware.ts    — Zod request body/query validation factory
      rateLimit.middleware.ts   — express-rate-limit configuration
    services/
      auth.service.ts     — Business logic for auth flows
      notes.service.ts    — Business logic for note CRUD
      tags.service.ts     — Business logic for tag management
      search.service.ts   — FTS query execution, ts_headline generation
      shares.service.ts   — Share link generation, revocation, public access
      versions.service.ts — Version snapshot, list, restore, auto-purge
    lib/
      prisma.ts           — Singleton Prisma client instance
      jwt.ts              — Token sign/verify helpers
      otp.ts              — OTP generation and validation helpers
      hash.ts             — bcrypt wrappers
  prisma/
    schema.prisma
    migrations/
      000_init/           — Base schema
      001_fts/            — tsvector column + GIN index (raw SQL)
```

### 4.2 Middleware Stack (Registration Order)

| Order | Middleware | Purpose |
|---|---|---|
| 1 | `cors` | CORS policy — allow frontend origin only |
| 2 | `helmet` | Security headers (CSP, HSTS, X-Frame-Options, etc.) |
| 3 | `express.json()` | Body parsing — max 1MB |
| 4 | `rateLimitMiddleware` (auth routes only) | Rate limit: 10 req/15min per IP on `/auth/register`, `/auth/login`, `/auth/forgot-password` |
| 5 | `authMiddleware` (protected routes) | Verifies Bearer JWT; attaches `{ id, email }` to `req.user` |
| 6 | `validateMiddleware` (per-route) | Validates request body/query against Zod schema from `packages/shared` |
| 7 (last) | `errorMiddleware` | Catches all thrown errors; maps to `{ error: { code, message, fields? } }` response |

### 4.3 Auth Service Design

| Function | Signature | Key Logic |
|---|---|---|
| `register` | `(email, password) → { accessToken, refreshToken }` | 1. Hash password (bcrypt, 10 rounds)<br>2. Create User<br>3. `issueTokens()` |
| `login` | `(email, password) → { accessToken, refreshToken }` | 1. Find user by `lower(email)`<br>2. `bcrypt.compare()`<br>3. Revoke all prior refresh tokens for user<br>4. `issueTokens()` |
| `refreshTokens` | `(rawRefreshToken) → { accessToken, newRefreshToken }` | 1. Hash incoming token<br>2. Look up by hash in DB<br>3. Validate: exists, not revoked, not expired<br>4. Atomic: revoke old, create new<br>5. Sign new access token |
| `logout` | `(rawRefreshToken) → void` | 1. Hash token<br>2. Set `revokedAt = now()` (ignore if not found) |
| `issueTokens` | `(userId) → { accessToken, refreshToken }` | 1. Sign JWT (`sub=userId`, `exp=15min`)<br>2. Generate crypto random refresh token<br>3. Hash refresh token<br>4. Store hash in RefreshToken table (`exp=7d`) |
| `forgotPassword` | `(email) → void` | 1. Find user (silently ignore if not found)<br>2. Generate 6-digit OTP<br>3. Invalidate prior OTPs for user<br>4. Store OTP with 15-min expiry<br>5. `console.log(OTP)` |
| `resetPassword` | `(email, otp, newPassword) → void` | 1. Find user by email<br>2. Find latest valid OTP for user<br>3. Validate: not expired, not used<br>4. Mark OTP used<br>5. Hash new password<br>6. Update `User.passwordHash`<br>7. Revoke all refresh tokens for user |

### 4.4 Notes Service — Key Transaction Patterns

**Update + Version Snapshot Transaction:**

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Snapshot current state BEFORE update
  await tx.noteVersion.create({
    data: { noteId, title: note.title, content: note.content }
  });

  // 2. Apply update
  const updated = await tx.note.update({
    where: { id: noteId },
    data: { title, content, contentText }
  });

  // 3. Auto-purge: delete oldest versions if count exceeds 50
  const versions = await tx.noteVersion.findMany({
    where: { noteId },
    orderBy: { savedAt: 'asc' }
  });
  if (versions.length > 50) {
    const toDelete = versions.slice(0, versions.length - 50).map(v => v.id);
    await tx.noteVersion.deleteMany({ where: { id: { in: toDelete } } });
  }

  return updated;
});
```

### 4.5 Search Service — FTS Query

```typescript
// Uses Prisma $queryRaw for FTS operations not supported by Prisma query builder
const results = await prisma.$queryRaw`
  SELECT
    n.id, n.title, n."updatedAt",
    ts_headline('english', n."contentText", plainto_tsquery('english', ${query}),
      'StartSel=<mark>, StopSel=</mark>, MaxWords=40, MinWords=20'
    ) AS headline,
    ts_rank(n.ts, plainto_tsquery('english', ${query})) AS rank
  FROM "Note" n
  WHERE
    n."userId" = ${userId}
    AND n."deletedAt" IS NULL
    AND n.ts @@ plainto_tsquery('english', ${query})
  ORDER BY rank DESC
  LIMIT ${limit} OFFSET ${offset}
`;

// plainto_tsquery() is used (not to_tsquery()) to auto-sanitize user input
```

### 4.6 Share Link — Atomic View Count

```typescript
// Do NOT do: const link = await findLink(); link.viewCount++; update(link)
// DO use a single atomic UPDATE:
await prisma.shareLink.update({
  where: { token },
  data: { viewCount: { increment: 1 } }
  // Prisma maps this to: SET view_count = view_count + 1
});
```

### 4.7 Error Handling

All service-layer errors are thrown as typed `AppError` instances. The global `errorMiddleware` catches them and maps to the standard error response shape.

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number,
    public fields?: Record<string, string>
  ) { super(message); }
}

// Example usage in services:
throw new AppError('EMAIL_TAKEN', 'An account with this email already exists.', 409);
throw new AppError('VALIDATION_ERROR', 'Invalid input.', 400, { title: 'Title is required.' });
```

| AppError Code | `statusCode` | Thrown By |
|---|---|---|
| `EMAIL_TAKEN` | 409 | `auth.service` — `register()` |
| `INVALID_CREDENTIALS` | 401 | `auth.service` — `login()` |
| `REFRESH_TOKEN_INVALID` | 401 | `auth.service` — `refreshTokens()` |
| `OTP_EXPIRED` / `OTP_USED` / `OTP_INVALID` | 400 | `auth.service` — `resetPassword()` |
| `TITLE_REQUIRED` | 400 | `notes.service` — create/update |
| `TOO_MANY_TAGS` | 400 | `notes.service` — create/update |
| `INVALID_TAG` | 400 | `notes.service` — create/update (tag ownership check) |
| `TAG_NAME_TAKEN` | 409 | `tags.service` — create/update |
| `QUERY_REQUIRED` | 400 | `search.service` — `search()` |
| `NOT_FOUND` | 404 | Any service when resource missing or cross-user access |
| `UNAUTHORIZED` | 401 | `auth.middleware` — missing/invalid JWT |

---

## 5. API Endpoint Specifications

Base path: `/api/v1`. All protected routes require `Authorization: Bearer <accessToken>`.

### 5.1 Authentication Endpoints

| Endpoint | Method | Request Body (Zod schema) | Success Response | Error Codes |
|---|---|---|---|---|
| `POST /auth/register` | POST | `RegisterSchema: { email: z.string().email(), password: z.string().min(8) }` | `201: { accessToken }` + `Set-Cookie: refreshToken` | `400`, `409 EMAIL_TAKEN` |
| `POST /auth/login` | POST | `LoginSchema: { email: z.string().email(), password: z.string() }` | `200: { accessToken }` + `Set-Cookie: refreshToken` | `400`, `401 INVALID_CREDENTIALS` |
| `POST /auth/refresh` | POST | — (reads HttpOnly cookie) | `200: { accessToken }` + new `Set-Cookie` | `401 REFRESH_TOKEN_INVALID` |
| `POST /auth/logout` | POST | — (reads HttpOnly cookie) | `200: { message: 'Logged out' }` | — |
| `POST /auth/forgot-password` | POST | `ForgotPasswordSchema: { email: z.string().email() }` | `200: { message: 'If registered, OTP sent' }` | `400` |
| `POST /auth/reset-password` | POST | `ResetPasswordSchema: { email, otp: z.string().length(6), newPassword: z.string().min(8) }` | `200: { message: 'Password updated' }` | `400 OTP_EXPIRED/OTP_USED/OTP_INVALID` |

### 5.2 Notes Endpoints

| Endpoint | Method | Request | Success Response | Error Codes |
|---|---|---|---|---|
| `GET /notes` | GET | Query: `page?`, `limit?`, `sortBy?`, `sortOrder?`, `tags?` (CSV) | `200: { data: NoteListItem[], meta: PaginationMeta }` | `400`, `401` |
| `POST /notes` | POST | `CreateNoteSchema: { title: z.string().min(1).max(255), content?: Json, tagIds?: z.string().cuid().array().max(5) }` | `201: NoteDetail` | `400`, `401` |
| `GET /notes/search` | GET | Query: `q` (required), `page?`, `limit?` | `200: { data: SearchResult[], meta: PaginationMeta }` | `400 QUERY_REQUIRED`, `401` |
| `GET /notes/:id` | GET | — | `200: NoteDetail` | `401`, `404` |
| `PATCH /notes/:id` | PATCH | `UpdateNoteSchema: { title?, content?, tagIds? }` — all optional | `200: NoteDetail` | `400`, `401`, `404` |
| `DELETE /notes/:id` | DELETE | — | `204 No Content` | `401`, `404` |

### 5.3 Response Shapes

```typescript
// NoteListItem (returned in GET /notes)
type NoteListItem = {
  id: string;
  title: string;
  contentPreview: string;   // First 150 chars of contentText
  tags: TagSummary[];
  updatedAt: string;        // ISO 8601
};

// NoteDetail (returned in GET /notes/:id, POST /notes, PATCH /notes/:id)
type NoteDetail = {
  id: string;
  title: string;
  content: object | null;   // TipTap JSON
  tags: TagSummary[];
  shareLinksCount: number;
  createdAt: string;
  updatedAt: string;
};

// SearchResult (returned in GET /notes/search)
type SearchResult = {
  id: string;
  title: string;
  headline: string;         // HTML string with <mark> tags
  updatedAt: string;
};

// TagSummary
type TagSummary = { id: string; name: string; color: string | null; };

// PaginationMeta
type PaginationMeta = { total: number; page: number; limit: number; totalPages: number; };
```

### 5.4 Tags, Shares, and Versions Endpoints

| Endpoint | Method | Request | Success Response | Error Codes |
|---|---|---|---|---|
| `GET /tags` | GET | — | `200: (Tag & { noteCount: number })[]` | `401` |
| `POST /tags` | POST | `CreateTagSchema: { name: z.string().min(1).max(50), color?: z.string().regex(/#[0-9A-Fa-f]{6}/) }` | `201: Tag` | `400`, `401`, `409` |
| `PATCH /tags/:id` | PATCH | `UpdateTagSchema: { name?, color? }` | `200: Tag` | `400`, `401`, `404`, `409` |
| `DELETE /tags/:id` | DELETE | — | `204` | `401`, `404` |
| `POST /notes/:id/share` | POST | `CreateShareSchema: { expiresAt?: z.string().datetime() }` | `201: ShareLink` | `400`, `401`, `404` |
| `GET /notes/:id/shares` | GET | — | `200: ShareLink[]` | `401`, `404` |
| `DELETE /shares/:shareId` | DELETE | — | `204` | `401`, `404` |
| `GET /public/notes/:token` | GET | — | `200: { title: string, content: object \| null }` | `404` |
| `GET /notes/:id/versions` | GET | — | `200: { id: string, savedAt: string }[]` | `401`, `404` |
| `GET /notes/:id/versions/:vid` | GET | — | `200: { id, title, content, savedAt }` | `401`, `404` |
| `POST /notes/:id/versions/:vid/restore` | POST | — | `200: NoteDetail` | `401`, `404` |

---

## 6. Frontend Architecture (apps/web)

### 6.1 Folder Structure

```
apps/web/src/
  main.tsx                  — Vite entry point, React root
  App.tsx                   — Router setup (React Router v6), auth guard
  pages/
    auth/
      LoginPage.tsx
      RegisterPage.tsx
      ForgotPasswordPage.tsx
      ResetPasswordPage.tsx
    notes/
      NotesListPage.tsx
      NoteEditorPage.tsx
    search/
      SearchPage.tsx
    public/
      PublicNotePage.tsx    — Unauthenticated public share view
  components/
    editor/
      NoteEditor.tsx        — TipTap integration, autosave logic
      EditorToolbar.tsx     — Bold/italic/heading/list controls
      SaveStatusIndicator.tsx
    notes/
      NoteCard.tsx
      NoteList.tsx
      TagFilter.tsx
      SortControl.tsx
    tags/
      TagBadge.tsx
      TagCombobox.tsx       — Multi-select with inline create
    share/
      ShareModal.tsx
      ShareLinkRow.tsx
    versions/
      VersionDrawer.tsx
      VersionPreview.tsx
    layout/
      AppShell.tsx          — Nav, sidebar, main content area
      AuthLayout.tsx        — Centered card layout for auth pages
  hooks/
    useNotes.ts             — TanStack Query hooks for notes CRUD
    useTags.ts              — TanStack Query hooks for tags
    useSearch.ts            — TanStack Query hook for search
    useShares.ts            — TanStack Query hooks for share links
    useVersions.ts          — TanStack Query hooks for version history
    useAuth.ts              — Login/logout/register mutations
    useTokenRefresh.ts      — Axios interceptor setup for silent refresh
  store/
    authStore.ts            — Zustand: accessToken, user profile, isAuthenticated
    uiStore.ts              — Zustand: modals open state, drawer open state
  lib/
    apiClient.ts            — Axios instance with base URL + auth interceptor
    queryClient.ts          — TanStack QueryClient configuration
```

### 6.2 Authentication State Management

> **Token Storage Strategy**
>
> - **Access Token:** stored in Zustand (in-memory only). Never in `localStorage` or `sessionStorage`.
> - **Refresh Token:** stored in HttpOnly cookie (set by server). Never accessible from JS.
>
> **On app load (`App.tsx`):**
> 1. Check if `accessToken` exists in Zustand store.
> 2. If not, attempt `POST /auth/refresh` (cookie is sent automatically).
> 3. If refresh succeeds → populate Zustand store with new `accessToken`.
> 4. If refresh fails → redirect to `/login`.

### 6.3 API Client — Silent Refresh Interceptor

```typescript
// lib/apiClient.ts
import axios from 'axios';
import { useAuthStore } from '../store/authStore';

export const apiClient = axios.create({ baseURL: '/api/v1', withCredentials: true });

// Request interceptor: attach current access token
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor: silent refresh on 401
let isRefreshing = false;
let refreshQueue: ((token: string) => void)[] = [];

apiClient.interceptors.response.use(null, async (error) => {
  const originalRequest = error.config;
  if (error.response?.status === 401 && !originalRequest._retry) {
    originalRequest._retry = true;
    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const { data } = await axios.post('/api/v1/auth/refresh', {}, { withCredentials: true });
        useAuthStore.getState().setAccessToken(data.accessToken);
        refreshQueue.forEach(cb => cb(data.accessToken));
        refreshQueue = [];
      } catch {
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
        return Promise.reject(error);
      } finally { isRefreshing = false; }
    }
    return new Promise(resolve => {
      refreshQueue.push(token => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        resolve(apiClient(originalRequest));
      });
    });
  }
  return Promise.reject(error);
});
```

### 6.4 TipTap Editor — Autosave Design

```typescript
const { mutate: saveNote } = useUpdateNote();

useEffect(() => {
  if (!isDirty) return;
  const timer = setTimeout(() => {
    setStatus('saving');
    saveNote(
      { id, title, content },
      {
        onSuccess: () => setStatus('saved'),
        onError: () => setStatus('error')
      }
    );
  }, 2000); // 2-second debounce
  return () => clearTimeout(timer);
}, [title, content]); // isDirty = title or content changed from last saved state
```

### 6.5 TanStack Query Configuration

| Configuration | Value | Reason |
|---|---|---|
| `staleTime` | 1 minute for notes list | Avoids refetch on every navigation |
| `gcTime` | 5 minutes | Keep unused queries in cache for back-navigation |
| `retry` | 1 | Retry once on network error; don't hammer a failing API |
| `refetchOnWindowFocus` | `true` | Refresh data when user returns to tab |
| Mutations — `onSuccess` | Invalidate relevant query keys | Ensures list/detail views reflect updates immediately |

---

## 7. packages/shared — Types and Schemas

### 7.1 Structure

```
packages/shared/src/
  schemas/
    auth.schemas.ts       — RegisterSchema, LoginSchema, ForgotPasswordSchema, ResetPasswordSchema
    notes.schemas.ts      — CreateNoteSchema, UpdateNoteSchema, NoteListQuerySchema
    tags.schemas.ts       — CreateTagSchema, UpdateTagSchema
    search.schemas.ts     — SearchQuerySchema
    shares.schemas.ts     — CreateShareSchema
  types/
    api.types.ts          — NoteDetail, NoteListItem, SearchResult, TagSummary, PaginationMeta, ShareLink
    auth.types.ts         — AuthResponse, UserProfile
    errors.types.ts       — AppErrorCode (union type of all error code strings)
  index.ts                — Re-exports everything
```

### 7.2 Usage Contract

> **⚠️ Non-Negotiable Rules for `packages/shared`**
>
> 1. All TypeScript types used by BOTH frontend and backend **MUST** live here — no exceptions.
> 2. All Zod schemas used for validation on either side **MUST** live here.
> 3. `packages/shared` has **ZERO** runtime dependencies other than Zod.
> 4. `packages/shared` **NEVER** imports from `apps/api` or `apps/web`.
> 5. Both `apps/api` and `apps/web` import from `'shared'` (pnpm workspace protocol: `'shared': 'workspace:*'`).
> 6. Adding a field to an API response requires updating the shared type **FIRST** before touching either app.

---

## 8. Security Design

### 8.1 Password Security

- bcrypt with `saltRounds = 10` (adjustable via env var `BCRYPT_ROUNDS`, default 10).
- Password comparison always uses `bcrypt.compare()` — never equality check on hash.
- Minimum password length: 8 characters. Enforced by Zod schema in `packages/shared`.

### 8.2 JWT Design

| Token | Algorithm | Payload | Expiry | Storage |
|---|---|---|---|---|
| Access Token | HS256 | `{ sub: userId, email, iat, exp }` | 15 minutes | Zustand (memory only) |
| Refresh Token (raw) | N/A — random bytes | Not a JWT | 7 days | HttpOnly, Secure, SameSite=Strict cookie |
| Refresh Token (stored) | SHA-256 hash of raw | Stored in DB | 7 days | PostgreSQL `RefreshToken` table |

### 8.3 Authorization Model

Authorization is enforced at the **SERVICE LAYER**, not the route layer.

```typescript
// In notes.service.ts — getById()
const note = await prisma.note.findFirst({
  where: { id, userId: req.user.id, deletedAt: null }
});
if (!note) throw new AppError('NOT_FOUND', 'Not found.', 404);
```

**This pattern means:**
- A note owned by a different user returns `404` (not `403`) — prevents resource enumeration.
- Soft-deleted notes return `404` — not a separate `410 Gone`.
- The same pattern applies to tags, share links, and version history.

### 8.4 Input Validation

- All request bodies are validated by Zod schemas (from `packages/shared`) via `validateMiddleware` before reaching service layer.
- Query parameters are also validated for type correctness (`page` as `z.coerce.number().int().positive()`, etc.).
- FTS user input is passed through `plainto_tsquery()` which sanitizes operators and prevents syntax injection.
- All DB queries use Prisma parameterized queries. No string interpolation in `$queryRaw` — only tagged template literals with `${}` substitution.

### 8.5 Rate Limiting

| Route Pattern | Limit | Window | Strategy |
|---|---|---|---|
| `POST /auth/register` | 10 requests | 15 minutes per IP | `express-rate-limit` |
| `POST /auth/login` | 10 requests | 15 minutes per IP | `express-rate-limit` |
| `POST /auth/forgot-password` | 5 requests | 15 minutes per IP | `express-rate-limit` |
| All other routes | No limit (MVP) | — | — |

---

## 9. Testing Design

### 9.1 Test Infrastructure

| Layer | Tool | Database | Config |
|---|---|---|---|
| Unit (services) | Vitest | Prisma mock (prisma-mock or manual `jest.fn()` mocks) | `vitest.config.ts` in `apps/api` |
| Integration (API) | Vitest + Supertest | Test PostgreSQL instance (`docker-compose.test.yml`) | `beforeAll`: migrate + seed; `afterAll`: teardown |
| Component (UI) | Vitest + React Testing Library | N/A — MSW for API mocking | `vitest.config.ts` in `apps/web` |
| E2E | Playwright | Full stack running (api + db) | `playwright.config.ts` — baseURL, browser matrix |

### 9.2 Test Database Strategy

> - Use a separate PostgreSQL database: `nta_test` (configured via `DATABASE_URL_TEST` env var).
> - Run `prisma migrate deploy` before the test suite.
> - Each test **file** uses a `beforeEach` that truncates all tables (`TRUNCATE ... CASCADE`) and re-seeds minimal fixtures.
> - Tests do **NOT** share state between files — each file is independently reproducible.
> - Prisma client in tests uses `DATABASE_URL_TEST`, not the application database.

### 9.3 Coverage Requirements

| Package | Minimum Coverage | Enforced By |
|---|---|---|
| `apps/api` — services | ≥80% line + branch | Vitest `--coverage` + CI gate |
| `apps/api` — routes | ≥80% line + branch | Vitest `--coverage` + CI gate |
| `apps/web` — hooks | ≥80% line + branch | Vitest `--coverage` + CI gate |
| `apps/web` — components | ≥80% line + branch | Vitest `--coverage` + CI gate |
| `packages/shared` | ≥90% (schemas are pure functions) | Vitest `--coverage` + CI gate |

---

## 10. Environment Configuration

### 10.1 Environment Variables — apps/api

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | PostgreSQL connection string (Prisma format) |
| `DATABASE_URL_TEST` | Yes (test only) | — | Test database connection string |
| `JWT_SECRET` | Yes | — | HMAC-SHA256 secret for signing access tokens. Min 32 chars. |
| `JWT_EXPIRES_IN` | No | `15m` | Access token expiry (ms/zeit format) |
| `REFRESH_TOKEN_EXPIRES_DAYS` | No | `7` | Refresh token expiry in days |
| `BCRYPT_ROUNDS` | No | `10` | bcrypt salt rounds |
| `PORT` | No | `3001` | API server port |
| `CLIENT_ORIGIN` | Yes | — | Frontend URL for CORS policy (e.g. `http://localhost:5173`) |
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test` |
| `OTP_EXPIRES_MINUTES` | No | `15` | OTP expiry in minutes |

### 10.2 Environment Variables — apps/web

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_BASE_URL` | Yes | — | API base URL (e.g. `http://localhost:3001/api/v1`) |
| `VITE_APP_ENV` | No | `development` | Used for feature flags and error reporting |

> **⚠️ Security Note**
>
> `JWT_SECRET` must be at least 32 characters of cryptographic randomness in production.
> Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
> Never commit `.env` files. Use `.env.example` with placeholder values only.

---

## 11. Per-Ticket Implementation Checklist

| Ticket | Files to Create / Modify | Key Implementation Notes |
|---|---|---|
| AB-1001 | `prisma/schema.prisma`, `pnpm-workspace.yaml`, `packages/shared/index.ts`, `apps/api/src/index.ts`, `apps/web/src/main.tsx`, `.husky/*`, `commitlint.config.ts`, vitest configs, `CLAUDE.md` files | Scaffold monorepo structure. Configure Prisma. Set up Husky pre-commit hooks. Create `CLAUDE.md` for root, api, and web. Install all pinned dependencies. |
| AB-1002 | `auth.routes.ts`, `auth.service.ts`, `auth.middleware.ts`, `auth.schemas.ts` (shared), `auth.types.ts` (shared), `jwt.ts`, `hash.ts`, `RefreshToken` migration | Implement register/login/logout/refresh. Refresh token rotation. HttpOnly cookie. All error codes. |
| AB-1003 | `auth.service.ts` (forgotPassword/resetPassword), `otp.ts`, `PasswordResetOTP` migration | 6-digit OTP, 15-min expiry, single-use, `console.log` only. Revoke tokens on reset. |
| AB-1004 | `notes.routes.ts`, `notes.service.ts`, `notes.schemas.ts` (shared), `Note` + `NoteVersion` + `NoteTag` migrations, raw FTS migration | Full CRUD. Soft delete. Version snapshot in transaction. `tsvector` column + GIN index via raw migration. |
| AB-1005 | `notes.service.ts` (list), `NoteListQuerySchema` (shared) | Pagination, sorting, AND-logic tag filtering. Computed `contentPreview` field. |
| AB-1006 | `tags.routes.ts`, `tags.service.ts`, `tags.schemas.ts` (shared) | Tag CRUD. `noteCount` computed field. Case-insensitive uniqueness at service layer. Cascade on delete. |
| AB-1007 | `search.service.ts`, `search.schemas.ts` (shared) | `$queryRaw` with `plainto_tsquery`. `ts_headline` with `<mark>` tags. Pagination. Input sanitization. |
| AB-1008 | `shares.routes.ts`, `shares.service.ts`, `shares.schemas.ts` (shared) | UUID token generation. Active link check (not revoked, not expired). Atomic `viewCount` increment. Public endpoint (no auth middleware). |
| AB-1009 | `versions.routes.ts`, `versions.service.ts` | Snapshot already created in AB-1004. List (`id`+`savedAt` only). Detail (full content). Restore creates new PATCH. Auto-purge > 50. |
| AB-1010 | `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `AuthLayout`, `authStore`, `useAuth` hook | `shadcn/ui` Form + `react-hook-form` + Zod. Inline error messages. Loading states. Redirect on success. |
| AB-1011 | `NotesListPage`, `NoteCard`, `NoteList`, `TagFilter`, `SortControl`, `AppShell`, `useTags`, `useNotes` | Paginated list. Sort/filter controls. Delete with confirm dialog. Empty state. |
| AB-1012 | `NoteEditorPage`, `NoteEditor`, `EditorToolbar`, `SaveStatusIndicator`, `TagCombobox`, `ShareModal` (stub), `VersionDrawer` (stub) | TipTap with full toolbar. Autosave with 2s debounce. Saving/Saved/Error indicator. Tag assignment combobox. |
| AB-1013 | `SearchPage`, `useSearch` hook | Render headline HTML with `dangerouslySetInnerHTML` (sanitized — HTML comes from own server). Paginated results. |
| AB-1014 | `ShareModal` (full), `ShareLinkRow`, `useShares` hook | Generate link, optional expiry picker, copy URL to clipboard, revoke with confirm. |
| AB-1015 | `VersionDrawer` (full), `VersionPreview`, `useVersions` hook | List versions. Preview in read-only TipTap. Restore with confirm. Current version label. |
| AB-1016 | `e2e/` directory with Playwright tests | 7 user journey tests (see FRS §11). Each journey starts from unauthenticated state. Uses page objects pattern. |
