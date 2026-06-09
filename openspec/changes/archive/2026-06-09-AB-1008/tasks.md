# Tasks — AB-1008: Note Sharing

| Field | Value |
|---|---|
| Ticket | AB-1008 |
| Total tasks | 26 |
| Status | Not started |

---

## Phase 1 — Foundation (Shared Schema)

> Checkpoint: `pnpm -r build` → 0 errors

- [x] **T-01 — Add `.refine()` to `CreateShareSchema.expiresAt`**
  - File: `packages/shared/src/schemas/shares.schemas.ts`
  - Change `expiresAt: z.string().datetime().optional()` to:
    ```typescript
    expiresAt: z
      .string()
      .datetime()
      .refine(d => new Date(d) > new Date(), {
        message: 'Expiry date must be in the future',
      })
      .optional(),
    ```
  - Why: prevents creating share links that are immediately inaccessible; missing field still passes (`.optional()` wraps the whole chain)
  - Verify: `pnpm -r build` passes; `pnpm --filter shared test` passes (existing `shares.schemas` test covers format; add future-date case in Phase 4)

---

## Phase 2 — Core Implementation

> Tasks T-02 through T-04 are sequential (routes depend on service; service imports schema).
> Checkpoint: `pnpm -r lint` → 0 errors, `pnpm -r build` → 0 type errors

- [x] **T-02 — Create `shares.service.ts`**
  - File: `apps/api/src/services/shares.service.ts` (new file)
  - Imports: `prisma` from `'../lib/prisma.js'`, `AppError` from `'../lib/errors.js'`, `ShareLink` type and `CreateShareSchema` from `'shared'`, `z` from `'zod'`
  - Implement private helper `toShareLink(link)` — maps all `Date` fields to `.toISOString()` with `?? null` for nullable dates
  - Implement `export async function createShareLink(userId, noteId, dto)`:
    - `prisma.note.findFirst({ where: { id: noteId, userId, deletedAt: null } })` → NOT_FOUND if null
    - `prisma.shareLink.create({ data: { noteId, userId, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } })`
    - Return `toShareLink(link)`
  - Implement `export async function listShareLinks(userId, noteId)`:
    - Same note ownership check as above
    - `prisma.shareLink.findMany({ where: { noteId }, orderBy: { createdAt: 'desc' } })`
    - Return `links.map(toShareLink)`
  - Implement `export async function revokeShareLink(userId, shareId)`:
    - `prisma.shareLink.findFirst({ where: { id: shareId, userId } })` → NOT_FOUND if null
    - `prisma.shareLink.update({ where: { id: shareId }, data: { revokedAt: new Date() } })`
    - Return `void`
  - Implement `export async function getPublicNote(token)`:
    - `prisma.shareLink.findUnique({ where: { token }, include: { note: true } })`
    - Validate: `link !== null && link.revokedAt === null && (link.expiresAt === null || link.expiresAt > now)` AND `link.note.deletedAt === null` → NOT_FOUND if any fails
    - `prisma.shareLink.update({ where: { token }, data: { viewCount: { increment: 1 } } })` — atomic, never read-modify-write
    - Return `{ title: link.note.title, content: link.note.content as object | null }`

- [x] **T-03 — Add `POST /:id/share` and `GET /:id/shares` to `notes.routes.ts`**
  - File: `apps/api/src/routes/notes.routes.ts`
  - Sub-tasks:
    - Extend existing `import { ..., SearchQuerySchema } from 'shared'` to include `CreateShareSchema`
    - Add `import * as sharesService from '../services/shares.service.js'` after the `searchService` import
    - Add `POST /:id/share` handler (authenticate + validate(CreateShareSchema) + 201 response) **before** `GET /:id`
    - Add `GET /:id/shares` handler (authenticate + 200 response) **before** `GET /:id`
  - Route order note: `/:id/share` and `/:id/shares` are two-segment paths — no conflict with `/:id` (one segment); placement before `/:id` is for readability only

- [x] **T-04 — Implement `shares.routes.ts`**
  - File: `apps/api/src/routes/shares.routes.ts`
  - Replace the empty router scaffold with full implementation:
    - Add imports: `authenticate` from `'../middleware/auth.middleware.js'`, `sharesService` from `'../services/shares.service.js'`
    - Register `DELETE /:shareId` with `authenticate` → `revokeShareLink` → `204`
    - Register `GET /notes/:token` **without** `authenticate` → `getPublicNote` → `200`
  - Dual-mount reminder: `index.ts` mounts this router at both `/api/v1/shares` (for revoke) and `/api/v1/public` (for public read). Auth is per-route so the public handler remains unauthenticated regardless of mount.

---

## Phase 3 — Integration Checkpoint

> Checkpoint: `pnpm -r lint` → 0 errors, `pnpm -r build` → 0 type errors

- [x] **T-05 — Lint + build gate**
  - `pnpm -r lint` → 0 errors across all three packages
  - `pnpm -r build` → 0 TypeScript errors across all three packages
  - Fix any issues before proceeding to tests

---

## Phase 4 — Unit Tests

> File: `apps/api/src/services/__tests__/shares.service.test.ts` (new file)
>
> Setup:
> ```typescript
> vi.mock('../../lib/prisma.js', () => ({
>   prisma: {
>     note: { findFirst: vi.fn() },
>     shareLink: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
>   },
> }));
> ```
> Import service under test **after** mock declaration (matches `notes.service.test.ts` pattern).
> Private helper `mockLink(overrides?)` builds a minimal ShareLink-shaped object with `Date` fields.

- [x] **T-06 — SHARE-UT-01: `createShareLink` happy path returns ShareLink**
  - Mock: `note.findFirst` → valid note; `shareLink.create` → link object
  - Input: valid `userId`, `noteId`, `dto = {}`
  - Assert: returns object matching `ShareLink` shape; `shareLink.create` called once with `{ noteId, userId, expiresAt: null }`

- [x] **T-07 — SHARE-UT-02: `createShareLink` note not found → NOT_FOUND**
  - Mock: `note.findFirst` → `null`
  - Assert: throws `AppError('NOT_FOUND', ..., 404)`; `shareLink.create` NOT called

- [x] **T-08 — SHARE-UT-03: `createShareLink` with `expiresAt` → Date passed to create**
  - Mock: `note.findFirst` → valid note; `shareLink.create` → link with `expiresAt`
  - Input: `dto = { expiresAt: '2099-01-01T00:00:00.000Z' }`
  - Assert: `shareLink.create` called with `expiresAt: new Date('2099-01-01T00:00:00.000Z')`

- [x] **T-09 — SHARE-UT-04: `createShareLink` no `expiresAt` → null in create call**
  - Mock: `note.findFirst` → valid note; `shareLink.create` → link
  - Input: `dto = {}`
  - Assert: `shareLink.create` called with `expiresAt: null`

- [x] **T-10 — SHARE-UT-05: `listShareLinks` returns all links as ShareLink[]**
  - Mock: `note.findFirst` → valid; `shareLink.findMany` → 2 links (one revoked)
  - Assert: returns array of 2; `updatedAt` fields are ISO strings (Date converted); revoked link included

- [x] **T-11 — SHARE-UT-06: `listShareLinks` note not found → NOT_FOUND**
  - Mock: `note.findFirst` → `null`
  - Assert: throws `AppError('NOT_FOUND', ..., 404)`; `shareLink.findMany` NOT called

- [x] **T-12 — SHARE-UT-07: `listShareLinks` no share links → empty array**
  - Mock: `note.findFirst` → valid; `shareLink.findMany` → `[]`
  - Assert: returns `[]`

- [x] **T-13 — SHARE-UT-08: `revokeShareLink` sets `revokedAt`**
  - Mock: `shareLink.findFirst` → existing link; `shareLink.update` → updated link
  - Assert: `shareLink.update` called with `{ where: { id: shareId }, data: { revokedAt: expect.any(Date) } }`; resolves void

- [x] **T-14 — SHARE-UT-09: `revokeShareLink` not found → NOT_FOUND**
  - Mock: `shareLink.findFirst` → `null`
  - Assert: throws `AppError('NOT_FOUND', ..., 404)`; `shareLink.update` NOT called

- [x] **T-15 — SHARE-UT-10: `getPublicNote` valid active link → returns title+content, increments viewCount**
  - Mock: `shareLink.findUnique` → link with `revokedAt: null`, `expiresAt: null`, `note: { title: 'T', content: null, deletedAt: null }`; `shareLink.update` → updated link
  - Assert: returns `{ title: 'T', content: null }`; `shareLink.update` called with `{ data: { viewCount: { increment: 1 } } }`

- [x] **T-16 — SHARE-UT-11: `getPublicNote` token not found → NOT_FOUND, no update**
  - Mock: `shareLink.findUnique` → `null`
  - Assert: throws `AppError('NOT_FOUND', ..., 404)`; `shareLink.update` NOT called

- [x] **T-17 — SHARE-UT-12: `getPublicNote` `revokedAt` set → NOT_FOUND**
  - Mock: `shareLink.findUnique` → link with `revokedAt: new Date()`
  - Assert: throws NOT_FOUND; `shareLink.update` NOT called

- [x] **T-18 — SHARE-UT-13: `getPublicNote` `expiresAt` in past → NOT_FOUND**
  - Mock: `shareLink.findUnique` → link with `expiresAt: new Date('2000-01-01')`
  - Assert: throws NOT_FOUND; `shareLink.update` NOT called

- [x] **T-19 — SHARE-UT-14: `getPublicNote` note soft-deleted → NOT_FOUND**
  - Mock: `shareLink.findUnique` → link with `revokedAt: null`, `expiresAt: null`, `note: { deletedAt: new Date() }`
  - Assert: throws NOT_FOUND; `shareLink.update` NOT called

- [x] **T-20 — SHARE-UT-15: `getPublicNote` `expiresAt: null` (permanent link) → success**
  - Mock: `shareLink.findUnique` → link with `revokedAt: null`, `expiresAt: null`, `note: { title: 'X', content: { type: 'doc' }, deletedAt: null }`
  - Assert: returns `{ title: 'X', content: { type: 'doc' } }`

---

## Phase 5 — Integration Tests

> File: `apps/api/src/routes/__tests__/shares.routes.integration.ts` (new file)
>
> Setup:
> ```typescript
> const DB_AVAILABLE = Boolean(process.env.DATABASE_URL_TEST);
> beforeAll(async () => { /* warn if no DB */ });
> beforeEach(async () => { if (DB_AVAILABLE) await resetDatabase(); });
> afterAll(async () => { if (DB_AVAILABLE) await getTestPrisma().$disconnect(); });
> ```
>
> Helpers (copy pattern from `notes.routes.integration.ts`):
> - `registerUser(creds?)` → `{ accessToken, userId }`
> - `createNote(token, body?)` → `noteId: string`
> - `createShare(token, noteId, body?)` → `shareId: string` (new helper)
>
> Constants: `AUTH_BASE`, `NOTES_BASE = '/api/v1/notes'`, `SHARES_BASE = '/api/v1/shares'`, `PUBLIC_BASE = '/api/v1/public'`

#### `POST /api/v1/notes/:id/share`

- [x] **T-21 — SHARE-IT-01: no auth → 401**
  - `POST /api/v1/notes/fake-id/share` with no `Authorization` header
  - Assert: `status === 401`

- [x] **T-22 — SHARE-IT-02/03: note not found and cross-user → 404**
  - SHARE-IT-02: valid auth, non-existent noteId → `404`
  - SHARE-IT-03: Alice auth, Bob's noteId → `404`

- [x] **T-23 — SHARE-IT-04/05: create without and with `expiresAt` → 201**
  - SHARE-IT-04: no `expiresAt` → `201`; body matches ShareLink shape; `viewCount: 0`, `revokedAt: null`
  - SHARE-IT-05: future `expiresAt` → `201`; `expiresAt` in response is ISO string matching input

- [x] **T-24 — SHARE-IT-06: past `expiresAt` → 400 VALIDATION_ERROR**
  - `POST` with `expiresAt: '2000-01-01T00:00:00.000Z'`
  - Assert: `status === 400`, `body.error.code === 'VALIDATION_ERROR'`

- [x] **T-25 — SHARE-IT-07: two links for same note → both 201 with distinct tokens**
  - Create 2 share links for same note
  - Assert: both `201`; `body.token` values differ; `body.id` values differ

#### `GET /api/v1/notes/:id/shares`

- [x] **T-26 — SHARE-IT-08/09: no auth → 401; note not found → 404**
  - SHARE-IT-08: no auth header → `401`
  - SHARE-IT-09: valid auth, non-existent noteId → `404`

- [x] **T-27 — SHARE-IT-10/11: empty list and single active link**
  - SHARE-IT-10: no share links created → `200`, body `[]`
  - SHARE-IT-11: one link created → `200`, array length 1

- [x] **T-28 — SHARE-IT-12: returns all links including revoked**
  - Create 2 links; revoke one via `DELETE /shares/:shareId`; `GET /notes/:id/shares`
  - Assert: `status === 200`; `body.length === 2`; revoked link has `revokedAt` non-null; active link has `revokedAt: null`

#### `DELETE /api/v1/shares/:shareId`

- [x] **T-29 — SHARE-IT-13/14/15: no auth, not found, cross-user**
  - SHARE-IT-13: no auth → `401`
  - SHARE-IT-14: valid auth, non-existent shareId → `404`
  - SHARE-IT-15: Alice auth, Bob's shareLink → `404`

- [x] **T-30 — SHARE-IT-16: successful revoke → 204; revokedAt set in subsequent list**
  - Create share link; `DELETE /api/v1/shares/:shareId`
  - Assert: `status === 204`
  - Subsequent `GET /notes/:id/shares` → link has `revokedAt` non-null

#### `GET /api/v1/public/notes/:token`

- [x] **T-31 — SHARE-IT-17/18/19/20: 404 scenarios**
  - SHARE-IT-17: unknown token → `404`
  - SHARE-IT-18: revoked link token → `404`
  - SHARE-IT-19: expired link token (create with past `expiresAt` directly via test Prisma client) → `404`
  - SHARE-IT-20: soft-deleted note → create share link, delete note via `DELETE /notes/:id`, access public URL → `404`

- [x] **T-32 — SHARE-IT-21/23: valid public access and no auth required**
  - SHARE-IT-21: valid active link → `200`; body has `title` and `content` only — assert no `tags`, `userId`, `revokedAt`, `viewCount`, `token` keys
  - SHARE-IT-23: `200` returned **without** any `Authorization` header

- [x] **T-33 — SHARE-IT-22: `viewCount` incremented atomically**
  - Create share link; access public URL twice
  - After first access: `GET /notes/:id/shares` → `viewCount === 1`
  - After second access: `GET /notes/:id/shares` → `viewCount === 2`

---

## Phase 6 — Final Quality Gates

- [x] **T-34 — All quality gates pass**
  - `pnpm -r lint` → 0 errors
  - `pnpm -r build` → 0 type errors
  - `pnpm --filter api test` → all unit tests pass; integration tests pass if `DATABASE_URL_TEST` set
