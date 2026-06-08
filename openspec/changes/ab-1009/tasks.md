# Tasks — AB-1009: Version History Endpoints

| Field | Value |
|---|---|
| Ticket | AB-1009 |
| Total tasks | 31 |
| Status | Not started |

---

## Phase 1 — Foundation (Shared Type)

> Checkpoint: `pnpm -r build` → 0 errors

- [x] **T-01 — Add `VersionListItem` to `packages/shared/src/types/api.types.ts`**
  - File: `packages/shared/src/types/api.types.ts`
  - Append after the `ShareLink` export:
    ```typescript
    export type VersionListItem = {
      id: string;
      savedAt: string;
    };
    ```
  - Verify: `pnpm -r build` passes (no import errors in either app)

---

## Phase 2 — Core Implementation

> Tasks T-02, T-03 are independent and can be done in parallel. T-04 depends on T-03.
> Checkpoint: `pnpm -r lint` → 0 errors, `pnpm -r build` → 0 type errors

- [x] **T-02 — Create `versions.service.ts`**
  - File: `apps/api/src/services/versions.service.ts` (new file)
  - Imports: `NoteDetail`, `VersionListItem` from `'shared'`; `prisma` from `'../lib/prisma.js'`; `AppError` from `'../lib/errors.js'`; `* as notesService` from `'./notes.service.js'`
  - Local type (not exported):
    ```typescript
    type VersionDetail = { id: string; title: string; content: object | null; savedAt: string };
    ```
  - Private helper `assertNoteOwnership(userId, noteId)`:
    - `prisma.note.findFirst({ where: { id: noteId, userId, deletedAt: null } })` → throw `AppError('NOT_FOUND', 'Not found.', 404)` if null
  - Implement `export async function listVersions(userId, noteId)`:
    - Call `assertNoteOwnership(userId, noteId)`
    - `prisma.noteVersion.findMany({ where: { noteId }, orderBy: { savedAt: 'desc' }, select: { id: true, savedAt: true } })`
    - Return `versions.map(v => ({ id: v.id, savedAt: v.savedAt.toISOString() }))`
  - Implement `export async function getVersion(userId, noteId, versionId)`:
    - Call `assertNoteOwnership(userId, noteId)`
    - `prisma.noteVersion.findFirst({ where: { id: versionId, noteId } })` → throw `NOT_FOUND` if null
    - Return `{ id, title, content: version.content as object | null, savedAt: version.savedAt.toISOString() }`
  - Implement `export async function restoreVersion(userId, noteId, versionId)`:
    - Call `assertNoteOwnership(userId, noteId)`
    - `prisma.noteVersion.findFirst({ where: { id: versionId, noteId } })` → throw `NOT_FOUND` if null
    - Return `notesService.update(userId, noteId, { title: version.title, content: version.content as unknown })`

- [x] **T-03 — Fill `versions.routes.ts`**
  - File: `apps/api/src/routes/versions.routes.ts`
  - Replace the empty scaffold with full implementation:
    ```typescript
    import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
    import { authenticate } from '../middleware/auth.middleware.js';
    import * as versionsService from '../services/versions.service.js';

    export const versionsRouter: IRouter = Router({ mergeParams: true });
    ```
  - Register `GET /` → `authenticate` → `listVersions(req.user.id, String(req.params.id))` → `res.json(versions)` → 200
  - Register `GET /:versionId` → `authenticate` → `getVersion(req.user.id, String(req.params.id), String(req.params.versionId))` → `res.json(version)` → 200
  - Register `POST /:versionId/restore` → `authenticate` → `restoreVersion(req.user.id, String(req.params.id), String(req.params.versionId))` → `res.json(note)` → 200
  - All handlers follow the `try/catch/next(err)` pattern from `shares.routes.ts`

- [x] **T-04 — Mount `versionsRouter` in `notes.routes.ts`**
  - File: `apps/api/src/routes/notes.routes.ts`
  - Add import: `import { versionsRouter } from './versions.routes.js';`
  - Add mount **before** the `GET /:id` handler: `notesRouter.use('/:id/versions', versionsRouter);`
  - No other changes to `notes.routes.ts`
  - Dependency: T-03 must be done first so the import resolves

---

## Phase 3 — Integration Checkpoint

> Checkpoint: `pnpm -r lint` → 0 errors, `pnpm -r build` → 0 type errors

- [x] **T-05 — Lint + build gate**
  - `pnpm -r lint` → 0 errors across all three packages
  - `pnpm -r build` → 0 TypeScript errors across all three packages
  - Fix any issues before proceeding to tests

---

## Phase 4 — Unit Tests

> File: `apps/api/src/services/__tests__/versions.service.test.ts` (new file)
>
> Mock setup:
> ```typescript
> vi.mock('../../lib/prisma.js', () => ({
>   prisma: {
>     note: { findFirst: vi.fn() },
>     noteVersion: { findMany: vi.fn(), findFirst: vi.fn() },
>   },
> }));
> vi.mock('../notes.service.js', () => ({
>   update: vi.fn(),
> }));
> ```
> Import service under test **after** mock declarations.
> Private helper `mockNote(overrides?)` and `mockVersion(overrides?)` build minimal DB row shapes with `Date` fields.

- [x] **T-06 — VER-UT-01: `listVersions` happy path returns `VersionListItem[]`**
  - Mock: `note.findFirst` → valid note; `noteVersion.findMany` → 2 version rows (Dates)
  - Assert: returns array of 2; each item has only `id` (string) and `savedAt` (ISO string); sorted desc (mock order)
  - Assert: `noteVersion.findMany` called with `{ where: { noteId }, orderBy: { savedAt: 'desc' }, select: { id: true, savedAt: true } }`

- [x] **T-07 — VER-UT-02: `listVersions` note not found → NOT_FOUND**
  - Mock: `note.findFirst` → `null`
  - Assert: throws `AppError` with `code: 'NOT_FOUND'`, `statusCode: 404`
  - Assert: `noteVersion.findMany` NOT called

- [x] **T-08 — VER-UT-03: `listVersions` no versions → empty array**
  - Mock: `note.findFirst` → valid note; `noteVersion.findMany` → `[]`
  - Assert: returns `[]`

- [x] **T-09 — VER-UT-04: `getVersion` returns full version content**
  - Mock: `note.findFirst` → valid note; `noteVersion.findFirst` → version row with title, content JSONB object, savedAt Date
  - Assert: returns `{ id, title, content: <object>, savedAt: <ISO string> }`
  - Assert: `noteVersion.findFirst` called with `{ where: { id: versionId, noteId } }`

- [x] **T-10 — VER-UT-05: `getVersion` note not found → NOT_FOUND; version not queried**
  - Mock: `note.findFirst` → `null`
  - Assert: throws NOT_FOUND; `noteVersion.findFirst` NOT called

- [x] **T-11 — VER-UT-06: `getVersion` version not found under note → NOT_FOUND**
  - Mock: `note.findFirst` → valid note; `noteVersion.findFirst` → `null`
  - Assert: throws NOT_FOUND

- [x] **T-12 — VER-UT-07: `restoreVersion` delegates to `notesService.update` with version's title+content**
  - Mock: `note.findFirst` → valid note; `noteVersion.findFirst` → version with `title: 'Old Title'`, `content: { type: 'doc' }`; `notesService.update` → mock NoteDetail
  - Assert: `notesService.update` called with `(userId, noteId, { title: 'Old Title', content: { type: 'doc' } })`
  - Assert: return value matches mock NoteDetail

- [x] **T-13 — VER-UT-08: `restoreVersion` note not found → NOT_FOUND; update not called**
  - Mock: `note.findFirst` → `null`
  - Assert: throws NOT_FOUND; `notesService.update` NOT called

- [x] **T-14 — VER-UT-09: `restoreVersion` version not found → NOT_FOUND; update not called**
  - Mock: `note.findFirst` → valid note; `noteVersion.findFirst` → `null`
  - Assert: throws NOT_FOUND; `notesService.update` NOT called

---

## Phase 5 — Integration Tests

> File: `apps/api/src/routes/__tests__/versions.routes.integration.ts` (new file)
>
> Setup:
> ```typescript
> const DB_AVAILABLE = Boolean(process.env.DATABASE_URL_TEST);
> beforeAll(async () => { if (!DB_AVAILABLE) console.warn('⚠ Skipping versions integration tests — DATABASE_URL_TEST not set'); });
> beforeEach(async () => { if (DB_AVAILABLE) await resetDatabase(); });
> afterAll(async () => { if (DB_AVAILABLE) await getTestPrisma().$disconnect(); });
> ```
>
> Helpers:
> - `registerUser(creds?)` → `{ accessToken, userId }` (same pattern as shares integration)
> - `createNote(token, body?)` → `noteId: string`
> - `patchNote(token, noteId, body?)` → calls `PATCH /api/v1/notes/:id`; creates a version snapshot as a side effect
>
> Constants: `AUTH_BASE`, `NOTES_BASE = '/api/v1/notes'`

#### `GET /api/v1/notes/:id/versions`

- [x] **T-15 — VER-IT-01: no auth → 401**
  - `GET /api/v1/notes/fake-id/versions` with no Authorization header
  - Assert: `status === 401`

- [x] **T-16 — VER-IT-02/03: note not found and cross-user → 404**
  - VER-IT-02: valid auth, non-existent noteId → `404`
  - VER-IT-03: Alice auth, Bob's noteId → `404`

- [x] **T-17 — VER-IT-04: no versions yet → 200 empty array**
  - Create note (no PATCH), `GET /notes/:id/versions`
  - Assert: `status === 200`, `body` deep equals `[]`

- [x] **T-18 — VER-IT-05: one version → 200 array with `{ id, savedAt }` only**
  - Create note; `patchNote` once (creates version); `GET /notes/:id/versions`
  - Assert: `status === 200`; `body` has length 1; each item has exactly `id` (string) and `savedAt` (string); no `title`, `content`, or extra fields

#### `GET /api/v1/notes/:id/versions/:versionId`

- [x] **T-19 — VER-IT-06: no auth → 401**
  - `GET /api/v1/notes/fake-id/versions/fake-vid` with no Authorization header
  - Assert: `status === 401`

- [x] **T-20 — VER-IT-07/08: note not found and cross-user → 404**
  - VER-IT-07: valid auth, non-existent noteId → `404`
  - VER-IT-08: Alice auth, Bob's noteId → `404`

- [x] **T-21 — VER-IT-09: version not found under note → 404**
  - Create note (owned by Alice); `GET /notes/:id/versions/nonexistent-vid`
  - Assert: `status === 404`

- [x] **T-22 — VER-IT-10: valid → 200 with full version content**
  - Create note with `title: 'Original'`; patch note with `title: 'Updated'` (creates version snapshot of 'Original')
  - `GET /notes/:id/versions` to get version id; `GET /notes/:id/versions/:versionId`
  - Assert: `status === 200`; `body.title === 'Original'`; `body` has `id`, `title`, `content`, `savedAt`; `savedAt` is an ISO date string

#### `POST /api/v1/notes/:id/versions/:versionId/restore`

- [x] **T-23 — VER-IT-11: no auth → 401**
  - `POST /api/v1/notes/fake-id/versions/fake-vid/restore` with no Authorization header
  - Assert: `status === 401`

- [x] **T-24 — VER-IT-12/13: note not found and cross-user → 404**
  - VER-IT-12: valid auth, non-existent noteId → `404`
  - VER-IT-13: Alice auth, Bob's noteId → `404`

- [x] **T-25 — VER-IT-14: version not found → 404**
  - Create note; `POST /notes/:id/versions/nonexistent-vid/restore`
  - Assert: `status === 404`

- [x] **T-26 — VER-IT-15: valid restore → 200 NoteDetail; note content matches version**
  - Create note with `title: 'Original Title'`; patch note to `title: 'Edited Title'` (creates v1 snapshot of 'Original Title')
  - `GET /notes/:id/versions` → get v1 id; `POST /notes/:id/versions/:v1id/restore`
  - Assert: `status === 200`; response matches NoteDetail shape
  - Assert: `body.title === 'Original Title'` (restored)
  - Assert: `GET /notes/:id/versions` now has one more entry than before restore (restore itself creates a new snapshot)

- [x] **T-27 — VER-IT-16: auto-purge keeps version count ≤ 50 during restore**
  - Create note; insert 50 version snapshots directly via `getTestPrisma().noteVersion.createMany(...)` (avoids 50 API calls)
  - `GET /notes/:id/versions` → pick oldest versionId; `POST /notes/:id/versions/:vid/restore`
  - Assert: `status === 200`
  - Assert: `GET /notes/:id/versions` returns exactly 50 versions (purge fired, not 51)

---

## Phase 6 — Final Quality Gates

- [x] **T-28 — All quality gates pass**
  - `pnpm -r lint` → 0 errors
  - `pnpm -r build` → 0 type errors
  - `pnpm --filter api test` → all unit tests pass; integration tests pass if `DATABASE_URL_TEST` set
