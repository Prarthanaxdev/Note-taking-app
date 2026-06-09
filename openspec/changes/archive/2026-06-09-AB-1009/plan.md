# Plan — AB-1009: Version History Endpoints

## Files to Create / Modify

| File | Action |
|---|---|
| `packages/shared/src/types/api.types.ts` | Add `VersionListItem` type |
| `apps/api/src/services/versions.service.ts` | New file — `listVersions`, `getVersion`, `restoreVersion` |
| `apps/api/src/routes/versions.routes.ts` | Fill empty scaffold — 3 routes, `mergeParams: true` |
| `apps/api/src/routes/notes.routes.ts` | Add `notesRouter.use('/:id/versions', versionsRouter)` + import |
| `apps/api/src/services/__tests__/versions.service.test.ts` | New file — unit tests |
| `apps/api/src/routes/__tests__/versions.routes.integration.ts` | New file — integration tests |

**No DB migration** — `NoteVersion` table and composite index `[noteId, savedAt(sort: Desc)]` already exist from AB-1004.  
**No new error codes** — only `NOT_FOUND` is thrown by all three service functions.  
**No new Zod schemas** — all inputs are path params; no request body on any route.

---

## TypeScript Interfaces

### `packages/shared/src/types/api.types.ts` — new export

```typescript
export type VersionListItem = {
  id: string;
  savedAt: string;  // ISO 8601 UTC
};
```

### `versions.service.ts` — local type (not exported to shared)

The detail response shape is used only by `getVersion`. Since AB-1015 (frontend) will define its own hook type, there's no need to export this to `packages/shared` now.

```typescript
type VersionDetail = {
  id: string;
  title: string;
  content: object | null;
  savedAt: string;
};
```

### Service function signatures

```typescript
export async function listVersions(
  userId: string,
  noteId: string,
): Promise<VersionListItem[]>

export async function getVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<VersionDetail>

export async function restoreVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<NoteDetail>
```

---

## Architecture Decisions

### 1. Router nesting with `mergeParams`

`versionsRouter` is created with `Router({ mergeParams: true })` so it can read `req.params.id` (the noteId from the parent `notesRouter` mount at `/:id/versions`). This avoids re-declaring `/:id` on every route inside `versionsRouter`.

Mount location: **inside `notes.routes.ts`**, before the `GET /:id` handler:
```typescript
import { versionsRouter } from './versions.routes.js';
notesRouter.use('/:id/versions', versionsRouter);
```

This keeps version routes logically grouped under notes without touching `index.ts`.

### 2. Restore delegates to `notesService.update()`

`restoreVersion` reads the version record, then calls `notesService.update(userId, noteId, { title: version.title, content: version.content as unknown })`. This reuses the existing snapshot+purge transaction with zero duplication.

The import is one-directional (`versions.service` → `notes.service`); there is no circular dependency.

The `version.content` field is `Prisma.JsonValue | null`. It is cast to `unknown` to satisfy `UpdateNoteSchema.content` (typed as `z.unknown().optional()`). `notesService.update()` calls `toJsonInput()` internally which handles `null`.

### 3. Ownership check pattern for versions

`NoteVersion` has no `userId` column — ownership flows through the parent note. The pattern for all three service functions:
```typescript
// Step 1: verify note ownership (also guards soft-deleted notes)
const note = await prisma.note.findFirst({
  where: { id: noteId, userId, deletedAt: null },
});
if (!note) throw new AppError('NOT_FOUND', 'Not found.', 404);

// Step 2 (getVersion / restoreVersion only): verify version belongs to this note
const version = await prisma.noteVersion.findFirst({
  where: { id: versionId, noteId },
});
if (!version) throw new AppError('NOT_FOUND', 'Not found.', 404);
```

This pattern matches AGENTS.md — 404 for cross-user access (never 403), and `findFirst` over `findUnique` for authorization checks.

### 4. `listVersions` — no pagination

Auto-purge caps versions at 50 per note. A full array is always ≤50 items, so a `{ data, meta }` envelope adds overhead with no benefit. Response is a plain `VersionListItem[]` sorted newest-first.

---

## Implementation Details

### `versions.service.ts`

```typescript
import type { NoteDetail, VersionListItem } from 'shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import * as notesService from './notes.service.js';

type VersionDetail = { id: string; title: string; content: object | null; savedAt: string };

async function assertNoteOwnership(userId: string, noteId: string): Promise<void> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
  });
  if (!note) throw new AppError('NOT_FOUND', 'Not found.', 404);
}

export async function listVersions(userId: string, noteId: string): Promise<VersionListItem[]> {
  await assertNoteOwnership(userId, noteId);
  const versions = await prisma.noteVersion.findMany({
    where: { noteId },
    orderBy: { savedAt: 'desc' },
    select: { id: true, savedAt: true },
  });
  return versions.map(v => ({ id: v.id, savedAt: v.savedAt.toISOString() }));
}

export async function getVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<VersionDetail> {
  await assertNoteOwnership(userId, noteId);
  const version = await prisma.noteVersion.findFirst({ where: { id: versionId, noteId } });
  if (!version) throw new AppError('NOT_FOUND', 'Not found.', 404);
  return {
    id: version.id,
    title: version.title,
    content: version.content as object | null,
    savedAt: version.savedAt.toISOString(),
  };
}

export async function restoreVersion(
  userId: string,
  noteId: string,
  versionId: string,
): Promise<NoteDetail> {
  await assertNoteOwnership(userId, noteId);
  const version = await prisma.noteVersion.findFirst({ where: { id: versionId, noteId } });
  if (!version) throw new AppError('NOT_FOUND', 'Not found.', 404);
  return notesService.update(userId, noteId, {
    title: version.title,
    content: version.content as unknown,
  });
}
```

### `versions.routes.ts`

```typescript
import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as versionsService from '../services/versions.service.js';

export const versionsRouter: IRouter = Router({ mergeParams: true });

versionsRouter.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const versions = await versionsService.listVersions(req.user.id, String(req.params.id));
    res.json(versions);
  } catch (err) { next(err); }
});

versionsRouter.get('/:versionId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const version = await versionsService.getVersion(
      req.user.id, String(req.params.id), String(req.params.versionId),
    );
    res.json(version);
  } catch (err) { next(err); }
});

versionsRouter.post('/:versionId/restore', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const note = await versionsService.restoreVersion(
      req.user.id, String(req.params.id), String(req.params.versionId),
    );
    res.json(note);
  } catch (err) { next(err); }
});
```

### Addition to `notes.routes.ts`

After the existing share-link handlers and before `GET /:id`:
```typescript
import { versionsRouter } from './versions.routes.js';
notesRouter.use('/:id/versions', versionsRouter);
```

---

## Test Plan

### Unit tests — `versions.service.test.ts`

Mock setup:
```typescript
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    note: { findFirst: vi.fn() },
    noteVersion: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));
vi.mock('../notes.service.js', () => ({
  update: vi.fn(),
}));
```

| ID | Function | Scenario |
|---|---|---|
| VER-UT-01 | `listVersions` | Note owned → returns `VersionListItem[]` with ISO `savedAt`, sorted desc |
| VER-UT-02 | `listVersions` | Note not found → throws `NOT_FOUND`; `noteVersion.findMany` not called |
| VER-UT-03 | `listVersions` | No versions → returns `[]` |
| VER-UT-04 | `getVersion` | Version found → returns `{ id, title, content, savedAt }` |
| VER-UT-05 | `getVersion` | Note not found → throws `NOT_FOUND`; `noteVersion.findFirst` not called |
| VER-UT-06 | `getVersion` | Version not found under note → throws `NOT_FOUND` |
| VER-UT-07 | `restoreVersion` | Version found → delegates to `notesService.update` with `{ title, content }` |
| VER-UT-08 | `restoreVersion` | Note not found → throws `NOT_FOUND`; `notesService.update` not called |
| VER-UT-09 | `restoreVersion` | Version not found → throws `NOT_FOUND`; `notesService.update` not called |

### Integration tests — `versions.routes.integration.ts`

Uses `describe.skipIf(!DB_AVAILABLE)` pattern, `beforeEach(resetDatabase)`.

Helper: `patchNote(token, noteId, body?)` — calls `PATCH /notes/:id` to create a version snapshot.

| ID | Endpoint | Scenario |
|---|---|---|
| VER-IT-01 | `GET /versions` | No auth → 401 |
| VER-IT-02 | `GET /versions` | Note not found → 404 |
| VER-IT-03 | `GET /versions` | Cross-user note → 404 |
| VER-IT-04 | `GET /versions` | No versions yet → 200 `[]` |
| VER-IT-05 | `GET /versions` | One version → 200 `[{ id, savedAt }]`; no extra fields |
| VER-IT-06 | `GET /versions/:vid` | No auth → 401 |
| VER-IT-07 | `GET /versions/:vid` | Note not found → 404 |
| VER-IT-08 | `GET /versions/:vid` | Cross-user note → 404 |
| VER-IT-09 | `GET /versions/:vid` | Version not found → 404 |
| VER-IT-10 | `GET /versions/:vid` | Valid → 200 `{ id, title, content, savedAt }` |
| VER-IT-11 | `POST /:vid/restore` | No auth → 401 |
| VER-IT-12 | `POST /:vid/restore` | Note not found → 404 |
| VER-IT-13 | `POST /:vid/restore` | Cross-user note → 404 |
| VER-IT-14 | `POST /:vid/restore` | Version not found → 404 |
| VER-IT-15 | `POST /:vid/restore` | Valid restore → 200 NoteDetail; title+content match version; new snapshot in list |
| VER-IT-16 | `POST /:vid/restore` | Auto-purge: 50 versions before restore → still 50 after |

---

## Checkpoints

```bash
# After Phase 1 (shared type + service):
pnpm -r build   # 0 type errors

# After Phase 2 (routes + mount):
pnpm -r lint    # 0 errors
pnpm -r build   # 0 type errors

# After Phase 3 (all tests written):
pnpm --filter api test    # 9 unit tests pass; 16 integration tests skipped (no test DB)
```
