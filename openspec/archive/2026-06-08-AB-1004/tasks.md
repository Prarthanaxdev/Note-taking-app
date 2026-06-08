# Task Checklist — AB-1004: Notes CRUD + FTS Migration

| Field | Value |
|---|---|
| Ticket | AB-1004 |
| Status | **Complete** |
| Proposal ref | `openspec/changes/AB-1004/proposal.md` |
| Spec ref | `openspec/changes/AB-1004/spec.md` |
| Total tasks | 18 |

Legend: `[ ]` = todo · `[x]` = done · `[~]` = in progress · `[P]` = can run in parallel with sibling `[P]` tasks

---

## Phase 1 — FTS Migration

> The init migration exists (`20260608000000_init`) but does NOT include the `tsvector` column. This phase adds it.

- [x] **T01** Create `apps/api/prisma/migrations/20260608000001_fts_tsvector/migration.sql`
  - Add `ts tsvector GENERATED ALWAYS AS ... STORED` column to `"Note"` table using `IF NOT EXISTS`
  - Add GIN index `note_ts_gin` on `ts` using `IF NOT EXISTS`
  - Verify migration is idempotent — can be re-run without error
  - Apply to dev DB: `pnpm --filter api prisma migrate dev` (or `migrate deploy`)
  - Apply to test DB: `DATABASE_URL=$DATABASE_URL_TEST pnpm --filter api prisma migrate deploy`

---

### ✅ Phase 1 Checkpoint

```bash
pnpm --filter api prisma migrate status   # migration applied, no pending
pnpm --filter api build                   # 0 type errors
```

---

## Phase 2 — `notes.service.ts`

> Core business logic. All four functions + `extractText` helper + `toNoteDetail` mapper.

- [x] **T02** Create `apps/api/src/services/notes.service.ts`
  - `extractText(node: unknown): string` — recursive TipTap JSON → plain text
  - `toNoteDetail(note: NoteWithRelations): NoteDetail` — maps Prisma result to shared type
  - `create(userId, dto)` — tag validation → `prisma.note.create` with nested NoteTag create
  - `getById(userId, noteId)` — `findFirst({ id, userId, deletedAt: null })` → 404 if null
  - `update(userId, noteId, dto)` — ownership check → tag validation → `$transaction` (snapshot + tag replace + note update + auto-purge) → re-fetch via `getById`
  - `softDelete(userId, noteId)` — ownership check → `note.update({ deletedAt: new Date() })`
  - Verify: `pnpm --filter api build` passes; `pnpm --filter api lint` clean

---

### ✅ Phase 2 Checkpoint

```bash
pnpm --filter api build   # 0 type errors
pnpm --filter api lint    # 0 errors, 0 warnings
```

---

## Phase 3 — Route Wiring

> Depends on T02. Wire the 4 routes through `authenticate` + `validate` middleware.

- [x] **T03** Update `apps/api/src/routes/notes.routes.ts`
  - Import `authenticate` from `../middleware/auth.middleware.js`
  - Import `validate` from `../middleware/validate.middleware.js`
  - Import `CreateNoteSchema`, `UpdateNoteSchema` from `'shared'`
  - Import `* as notesService` from `../services/notes.service.js`
  - Add `POST /` — `authenticate`, `validate(CreateNoteSchema)` → `notesService.create` → 201
  - Add `GET /:id` — `authenticate` → `notesService.getById` → 200
  - Add `PATCH /:id` — `authenticate`, `validate(UpdateNoteSchema)` → `notesService.update` → 200
  - Add `DELETE /:id` — `authenticate` → `notesService.softDelete` → 204
  - Verify: `pnpm --filter api build` passes; `pnpm --filter api lint` clean

---

### ✅ Phase 3 Checkpoint

```bash
pnpm --filter api build   # 0 type errors
pnpm --filter api lint    # 0 errors, 0 warnings
```

---

## Phase 4 — Unit Tests

> Mocked Prisma. 23 tests covering all service functions and business rules.

- [x] **T04** Create `apps/api/src/services/__tests__/notes.service.test.ts`

  **Mock setup:**
  - Mock `../../lib/prisma.js` with `prisma.note`, `prisma.tag`, `prisma.noteTag`, `prisma.noteVersion`, `prisma.$transaction`
  - `$transaction` default mock executes callback with a `tx` object containing the same mock methods

  **`create` tests (NOTE-UT-01 to NOTE-UT-06):**
  - UT-01: Happy path no tags → `prisma.note.create` called; returns `NoteDetail` with `shareLinksCount: 0`
  - UT-02: Happy path with owned tags → tag `findMany` returns 2; `note.create` with nested `tags.create`
  - UT-03: `tagIds.length > 5` → throws `TOO_MANY_TAGS`; `note.create` not called
  - UT-04: Foreign tag → `findMany` returns fewer than `tagIds.length` → throws `INVALID_TAG`
  - UT-05: Content provided → `note.create` called with non-empty `contentText`
  - UT-06: Content undefined → `note.create` called with `contentText: ''`

  **`getById` tests (NOTE-UT-07 to NOTE-UT-09):**
  - UT-07: `findFirst` returns note → returns `NoteDetail`
  - UT-08: `findFirst` returns null → throws `NOT_FOUND` (404)
  - UT-09: `findFirst` returns null (deleted/foreign) → throws `NOT_FOUND` (404)

  **`update` tests (NOTE-UT-10 to NOTE-UT-20):**
  - UT-10: Note not found → throws `NOT_FOUND`; `$transaction` not called
  - UT-11: Title update only → `$transaction` called; `noteVersion.create` called with OLD title
  - UT-12: Content update → `note.update` called with new `content` and new `contentText`
  - UT-13: `tagIds: undefined` → `noteTag.deleteMany` and `noteTag.createMany` NOT called
  - UT-14: `tagIds: []` → `noteTag.deleteMany` called; `noteTag.createMany` NOT called
  - UT-15: `tagIds: ['id1']` → `noteTag.deleteMany` then `noteTag.createMany([{ noteId, tagId: 'id1' }])`
  - UT-16: Foreign tag → throws `INVALID_TAG`; `$transaction` not called
  - UT-17: Snapshot captures PRE-update title/content → verify `noteVersion.create` data
  - UT-18: 51 versions after snapshot → `noteVersion.deleteMany` called with 1 oldest id
  - UT-19: 50 versions after snapshot → `noteVersion.deleteMany` NOT called
  - UT-20: `title: '  '` (whitespace) → throws `TITLE_REQUIRED`

  **`softDelete` tests (NOTE-UT-21 to NOTE-UT-23):**
  - UT-21: Happy path → `note.update` called with `{ deletedAt: any Date }`; resolves void
  - UT-22: `findFirst` returns null → throws `NOT_FOUND`; `note.update` not called
  - UT-23: `findFirst` returns null (already deleted) → throws `NOT_FOUND`; `note.update` not called

---

### ✅ Phase 4 Checkpoint

```bash
pnpm --filter api build           # 0 type errors
pnpm --filter api lint            # 0 errors, 0 warnings
pnpm --filter api test            # all *.test.ts pass
pnpm --filter api test:coverage   # ≥80% for notes.service.ts
```

---

## Phase 5 — Integration Tests

> Requires `nta_test` DB with both migrations applied. 24 tests covering all 4 endpoints.

**Pre-condition:**
```bash
DATABASE_URL=$DATABASE_URL_TEST pnpm --filter api prisma migrate deploy
```

- [x] **T05** Create `apps/api/src/routes/__tests__/notes.routes.integration.ts`

  **`POST /api/v1/notes` (NOTE-IT-01 to NOTE-IT-06):**
  - IT-01: No auth → 401
  - IT-02: Valid, no tags → 201 with `NoteDetail` shape (id, title, content, tags, shareLinksCount, createdAt, updatedAt)
  - IT-03: Valid, with owned tag → 201; `tags` contains TagSummary
  - IT-04: Missing title → 400 VALIDATION_ERROR
  - IT-05: Cross-user tagId → 400 INVALID_TAG
  - IT-06: After create → direct DB query confirms `ts` column is non-null

  **`GET /api/v1/notes/:id` (NOTE-IT-07 to NOTE-IT-11):**
  - IT-07: No auth → 401
  - IT-08: Own note → 200 NoteDetail
  - IT-09: Different user's note → 404
  - IT-10: Soft-deleted note → 404
  - IT-11: Non-existent ID → 404

  **`PATCH /api/v1/notes/:id` (NOTE-IT-12 to NOTE-IT-18):**
  - IT-12: No auth → 401
  - IT-13: Update title → 200; response shows updated title
  - IT-14: Update content → direct DB query confirms `contentText` regenerated
  - IT-15: Different user's note → 404
  - IT-16: After PATCH → `SELECT COUNT(*) FROM "NoteVersion" WHERE "noteId" = $1` returns 1
  - IT-17: PATCH with new tagIds → response `tags` reflects new set
  - IT-18: PATCH with `tagIds: []` → response `tags: []`

  **`DELETE /api/v1/notes/:id` (NOTE-IT-19 to NOTE-IT-24):**
  - IT-19: No auth → 401
  - IT-20: Own note → 204 No Content
  - IT-21: Different user's note → 404
  - IT-22: After DELETE, GET same note → 404
  - IT-23: Physical row retained → direct DB query shows `deletedAt IS NOT NULL`
  - IT-24: DELETE already-soft-deleted → 404

---

### ✅ Phase 5 Checkpoint (Final Quality Gate)

```bash
pnpm --filter api build           # 0 type errors
pnpm --filter api lint            # 0 errors, 0 warnings
pnpm --filter api test            # all tests pass (unit + integration)
pnpm --filter api test:coverage   # ≥80% line + branch for notes.service.ts + notes.routes.ts
```

---

## Commit Sequence

| Commit | After | Message |
|---|---|---|
| 1 | Phase 1 | `chore(db): add fts tsvector generated column and GIN index migration` |
| 2 | Phase 2+3 | `feat(api): add notes service with CRUD and version snapshot` |
| 3 | Phase 3 | `feat(api): wire notes CRUD routes` |
| 4 | Phase 4 | `test(api): add notes service unit tests` |
| 5 | Phase 5 | `test(api): add notes routes integration tests` |

---

## Out of Scope

| Item | Ticket |
|---|---|
| `GET /notes` list, pagination, sorting, tag filtering | AB-1005 |
| `GET /notes/search` FTS query | AB-1007 |
| Tags CRUD | AB-1006 |
| Share links | AB-1008 |
| Version list/detail/restore endpoints | AB-1009 |
