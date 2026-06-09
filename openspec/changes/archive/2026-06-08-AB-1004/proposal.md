# Implementation Proposal — AB-1004: Notes CRUD + FTS Migration

| Field | Value |
|---|---|
| Ticket | AB-1004 |
| Status | **Awaiting Approval** |
| Scope | Backend only — `apps/api` |
| Depends on | AB-1003 (initial Prisma migration already applied; `notesRouter` already registered in `index.ts`) |
| Unblocks | AB-1005 (list/pagination), AB-1007 (search), AB-1008 (shares), AB-1009 (versions) |

---

## 1. Goal

Implement the core Notes CRUD backend for the NTA:

- **Raw SQL FTS migration** — adds the `tsvector` generated column and GIN index to the `Note` table (Prisma cannot generate this natively).
- **`notes.service.ts`** — `create`, `getById`, `update` (with version snapshot + auto-purge in a single transaction), `softDelete`.
- **`notes.routes.ts`** — wires `POST /notes`, `GET /notes/:id`, `PATCH /notes/:id`, `DELETE /notes/:id` through auth + validate middleware to the service.
- **Unit + integration tests** covering all business rules and error paths.

`GET /notes` (list with pagination/sorting) is **deliberately excluded** — it belongs to AB-1005.

---

## 2. Clarifying Decisions (recorded)

| Question | Decision |
|---|---|
| `GET /notes` scope | Defer entirely to AB-1005. AB-1004 wires only POST, GET /:id, PATCH /:id, DELETE /:id. |
| `contentText` extraction | Inline recursive helper `extractText(node)` at the top of `notes.service.ts`. No new file; no shared dep. |
| `shareLinksCount` field | Compute now via `_count: { select: { shareLinks: true } }` on every note fetch. Correct from day one; AB-1008 just adds create/revoke endpoints. |
| FTS migration approach | New separate migration file `20260608000001_fts_tsvector`. The init migration is already applied; it must not be modified. |
| Test coverage | Both unit tests (Vitest + Prisma mocks) and integration tests (Supertest + real `nta_test` DB). Same pattern as AB-1003. |
| `TITLE_REQUIRED` vs `VALIDATION_ERROR` | Zod schema (`min(1)`) fires first at the route layer → `VALIDATION_ERROR`. The service also throws `TITLE_REQUIRED` as defense-in-depth for direct service calls. Both satisfy the 400 contract; the specific code is tested at the unit level. |
| Tag update semantics | `tagIds` in `PATCH` body is a full replacement: `undefined` = leave tags unchanged; `[]` = remove all; `['id1']` = replace with id1. |

---

## 3. Files to Create or Modify

### 3.1 New Files

| File | Purpose |
|---|---|
| `apps/api/prisma/migrations/20260608000001_fts_tsvector/migration.sql` | Idempotent raw SQL: `tsvector` generated column + GIN index on `Note` |
| `apps/api/src/services/notes.service.ts` | `create`, `getById`, `update`, `softDelete` + `extractText` helper |
| `apps/api/src/services/__tests__/notes.service.test.ts` | Unit tests with mocked Prisma |
| `apps/api/src/routes/__tests__/notes.routes.integration.ts` | Supertest integration tests against `nta_test` DB |

### 3.2 Modified Files

| File | Change |
|---|---|
| `apps/api/src/routes/notes.routes.ts` | Add all 4 route handlers (currently exports empty router) |

### 3.3 Already Correct (no changes needed)

| File | Why |
|---|---|
| `packages/shared/src/schemas/notes.schemas.ts` | `CreateNoteSchema`, `UpdateNoteSchema`, `NoteListQuerySchema` already defined |
| `packages/shared/src/types/api.types.ts` | `NoteDetail`, `NoteListItem`, `TagSummary`, `PaginationMeta` already defined |
| `packages/shared/src/types/errors.types.ts` | `TITLE_REQUIRED`, `TOO_MANY_TAGS`, `INVALID_TAG`, `NOT_FOUND` already in union |
| `apps/api/src/index.ts` | `notesRouter` already registered at `/api/v1/notes` |

---

## 4. Detailed Design

### 4.1 FTS Migration

**File:** `apps/api/prisma/migrations/20260608000001_fts_tsvector/migration.sql`

```sql
-- Idempotent: safe to re-run
ALTER TABLE "Note"
  ADD COLUMN IF NOT EXISTS ts tsvector
    GENERATED ALWAYS AS (
      to_tsvector('english', coalesce(title, '') || ' ' || coalesce("contentText", ''))
    ) STORED;

CREATE INDEX IF NOT EXISTS note_ts_gin ON "Note" USING GIN(ts);
```

**Migration workflow:**

```bash
# 1. Scaffold empty migration (does NOT touch DB yet)
pnpm --filter api prisma migrate dev --create-only --name fts_tsvector

# 2. Replace the generated migration.sql with the raw SQL above

# 3. Apply to dev DB
pnpm --filter api prisma migrate dev

# 4. Apply to test DB before running integration tests
DATABASE_URL="$DATABASE_URL_TEST" pnpm --filter api prisma migrate deploy
```

The `ts` column is `GENERATED ALWAYS AS ... STORED` — PostgreSQL recomputes it automatically on any `INSERT` or `UPDATE` to `title` or `contentText`. No application-level update needed.

### 4.2 `extractText` Helper (inline in `notes.service.ts`)

```typescript
function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  if (n.type === 'text' && typeof n.text === 'string') return n.text;
  if (!Array.isArray(n.content)) return '';
  return (n.content as unknown[]).map(extractText).join(' ');
}
```

Traverses TipTap's JSON tree recursively. Text nodes (`{ type: 'text', text: '...' }`) are collected; structural nodes delegate to their `content` array. Returns empty string for null/undefined content.

### 4.3 `notes.service.ts` Function Designs

#### `create`

```typescript
export async function create(
  userId: string,
  dto: z.infer<typeof CreateNoteSchema>,
): Promise<NoteDetail> {
  // 1. Tag validation (before any DB write)
  if (dto.tagIds && dto.tagIds.length > 0) {
    if (dto.tagIds.length > 5)
      throw new AppError('TOO_MANY_TAGS', 'A note can have at most 5 tags.', 400);
    const owned = await prisma.tag.findMany({ where: { id: { in: dto.tagIds }, userId } });
    if (owned.length !== dto.tagIds.length)
      throw new AppError('INVALID_TAG', 'One or more selected tags are invalid.', 400);
  }

  // 2. Create note + NoteTag associations in one call
  const note = await prisma.note.create({
    data: {
      userId,
      title: dto.title,
      content: dto.content as Prisma.InputJsonValue ?? Prisma.DbNull,
      contentText: extractText(dto.content),
      tags: { create: (dto.tagIds ?? []).map(tagId => ({ tagId })) },
    },
    include: {
      tags: { include: { tag: true } },
      _count: { select: { shareLinks: true } },
    },
  });

  return toNoteDetail(note);
}
```

**Key invariants:**
- `userId` comes only from the service parameter (populated from `req.user.id` in the route).
- Tag ownership is checked by counting tags where `id IN tagIds AND userId = userId`. A mismatch means at least one tag is foreign.
- `Prisma.DbNull` stores DB NULL for an optional JSON column when `dto.content` is absent.

#### `getById`

```typescript
export async function getById(userId: string, noteId: string): Promise<NoteDetail> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
    include: {
      tags: { include: { tag: true } },
      _count: { select: { shareLinks: true } },
    },
  });
  if (!note) throw new AppError('NOT_FOUND', 'Note not found.', 404);
  return toNoteDetail(note);
}
```

`findFirst` with `{ id, userId, deletedAt: null }` enforces both ownership and soft-delete in a single query. Cross-user access and deleted notes both return 404 — never 403.

#### `update`

```typescript
export async function update(
  userId: string,
  noteId: string,
  dto: z.infer<typeof UpdateNoteSchema>,
): Promise<NoteDetail> {
  // 1. Ownership + existence check (outside transaction — read-only)
  const current = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
  });
  if (!current) throw new AppError('NOT_FOUND', 'Note not found.', 404);

  // 2. Title empty check (defense-in-depth; Zod min(1) fires first at route layer)
  if (dto.title !== undefined && dto.title.trim() === '')
    throw new AppError('TITLE_REQUIRED', 'Title is required.', 400);

  // 3. Tag validation
  if (dto.tagIds && dto.tagIds.length > 0) {
    if (dto.tagIds.length > 5)
      throw new AppError('TOO_MANY_TAGS', 'A note can have at most 5 tags.', 400);
    const owned = await prisma.tag.findMany({ where: { id: { in: dto.tagIds }, userId } });
    if (owned.length !== dto.tagIds.length)
      throw new AppError('INVALID_TAG', 'One or more selected tags are invalid.', 400);
  }

  // 4. Transaction: snapshot → update tags → update note → auto-purge
  await prisma.$transaction(async (tx) => {
    // a. Snapshot current state BEFORE applying changes (BR-NOTE-07)
    await tx.noteVersion.create({
      data: { noteId, title: current.title, content: current.content ?? Prisma.DbNull },
    });

    // b. Replace tags if provided (undefined = no change, [] = remove all)
    if (dto.tagIds !== undefined) {
      await tx.noteTag.deleteMany({ where: { noteId } });
      if (dto.tagIds.length > 0)
        await tx.noteTag.createMany({ data: dto.tagIds.map(tagId => ({ noteId, tagId })) });
    }

    // c. Build and apply note update
    const updateData: Prisma.NoteUpdateInput = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.content !== undefined) {
      updateData.content = dto.content as Prisma.InputJsonValue ?? Prisma.DbNull;
      updateData.contentText = extractText(dto.content);
    }
    await tx.note.update({ where: { id: noteId }, data: updateData });

    // d. Auto-purge: keep at most 50 versions per note (BR-VER-06)
    const versions = await tx.noteVersion.findMany({
      where: { noteId },
      orderBy: { savedAt: 'asc' },
      select: { id: true },
    });
    if (versions.length > 50) {
      const toDelete = versions.slice(0, versions.length - 50).map(v => v.id);
      await tx.noteVersion.deleteMany({ where: { id: { in: toDelete } } });
    }
  });

  // 5. Re-fetch with all includes and return
  return await getById(userId, noteId);
}
```

**Transaction guarantees:**
- The snapshot is written BEFORE the note update — even if the transaction rolls back, no partial update exists.
- Tag replacement (delete + create) is atomic with the note update.
- Auto-purge counts the snapshot just created, so "50 versions after save" is the correct threshold.

#### `softDelete`

```typescript
export async function softDelete(userId: string, noteId: string): Promise<void> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
  });
  if (!note) throw new AppError('NOT_FOUND', 'Note not found.', 404);

  await prisma.note.update({
    where: { id: noteId },
    data: { deletedAt: new Date() },
  });
}
```

Sets `deletedAt` only. Physical rows are retained for 30 days per BR-NOTE-06.

#### `toNoteDetail` Mapping Helper

```typescript
function toNoteDetail(note: NoteWithTags): NoteDetail {
  return {
    id: note.id,
    title: note.title,
    content: note.content as object | null,
    tags: note.tags.map(nt => ({
      id: nt.tag.id,
      name: nt.tag.name,
      color: nt.tag.color,
    })),
    shareLinksCount: note._count.shareLinks,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
```

### 4.4 Route Wiring — `notes.routes.ts`

```typescript
import { Router, type Request, type Response, type NextFunction, type IRouter } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { CreateNoteSchema, UpdateNoteSchema } from 'shared';
import * as notesService from '../services/notes.service.js';

export const notesRouter: IRouter = Router();

// POST /api/v1/notes
notesRouter.post(
  '/',
  authMiddleware,
  validate(CreateNoteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const note = await notesService.create(req.user!.id, req.body);
      res.status(201).json(note);
    } catch (err) { next(err); }
  },
);

// GET /api/v1/notes/:id
notesRouter.get(
  '/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const note = await notesService.getById(req.user!.id, req.params.id);
      res.json(note);
    } catch (err) { next(err); }
  },
);

// PATCH /api/v1/notes/:id
notesRouter.patch(
  '/:id',
  authMiddleware,
  validate(UpdateNoteSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const note = await notesService.update(req.user!.id, req.params.id, req.body);
      res.json(note);
    } catch (err) { next(err); }
  },
);

// DELETE /api/v1/notes/:id
notesRouter.delete(
  '/:id',
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await notesService.softDelete(req.user!.id, req.params.id);
      res.status(204).send();
    } catch (err) { next(err); }
  },
);
```

`req.user!.id` is safe here because `authMiddleware` throws `401` before the handler runs if the token is missing or invalid. `req.body.userId` is never used.

---

## 5. Security Invariants

| Invariant | Implementation |
|---|---|
| `userId` source is JWT only | Every service function takes `userId: string` as a parameter populated from `req.user!.id`. `req.body.userId` is never read. |
| Authorization in service layer | `findFirst({ where: { id, userId, deletedAt: null } })` scopes every query. Route layer applies no ownership logic. |
| Cross-user access → 404 | `findFirst` returns null for foreign notes → `AppError('NOT_FOUND', ..., 404)`. Never 403. |
| All multi-table mutations transactional | `update` wraps snapshot + tag replace + note update + auto-purge in a single `prisma.$transaction`. |
| Soft delete only | `softDelete` sets `deletedAt`. No `note.delete()` call exists in this ticket or anywhere for MVP. |
| No `$queryRaw` in this ticket | FTS queries belong to AB-1007. No raw SQL in notes.service.ts. |

---

## 6. Implementation Order

| Step | Task | Depends on |
|---|---|---|
| 1 | Scaffold + write FTS migration (`20260608000001_fts_tsvector`) | Init migration already applied |
| 2 | Apply FTS migration to dev DB (`prisma migrate dev`) | Step 1 |
| 3 | Implement `notes.service.ts` (`extractText` + all 4 functions + `toNoteDetail`) | Step 2 (tsvector column exists) |
| 4 | Wire routes in `notes.routes.ts` | Step 3 |
| 5 | Write `notes.service.test.ts` unit tests | Step 3 |
| 6 | Apply FTS migration to `nta_test` DB | Step 1 |
| 7 | Write `notes.routes.integration.ts` integration tests | Steps 4 + 6 |

---

## 7. Quality Gate Checkpoints

```bash
# 1. Lint — 0 errors
pnpm -r lint

# 2. Build / type-check — 0 errors
pnpm -r build

# 3. Unit tests
pnpm --filter api test --reporter=verbose

# 4. Integration tests (requires DATABASE_URL_TEST → nta_test with FTS migration applied)
pnpm --filter api test --reporter=verbose

# 5. Coverage gate (≥80% line + branch on services)
pnpm --filter api test:coverage
```

---

## 8. Out of Scope

| Item | Ticket |
|---|---|
| `GET /notes` (list + pagination + sorting + tag filter) | AB-1005 |
| `GET /notes/search` (FTS query via `$queryRaw`) | AB-1007 |
| Tags CRUD endpoints | AB-1006 |
| Share link creation, revocation, public access | AB-1008 |
| Version list, detail, restore endpoints | AB-1009 |
| Frontend notes UI, editor, autosave | AB-1011/1012 |

---

## 9. Commit Plan

| Commit | After | Message |
|---|---|---|
| 1 | FTS migration scaffolded, SQL written, applied to dev DB | `chore(db): add fts tsvector generated column and GIN index migration` |
| 2 | `notes.service.ts` written, build passes | `feat(api): add notes service with CRUD and version snapshot` |
| 3 | `notes.routes.ts` wired, build passes | `feat(api): wire notes CRUD routes` |
| 4 | Unit tests passing | `test(api): add notes service unit tests` |
| 5 | Integration tests passing | `test(api): add notes routes integration tests` |
