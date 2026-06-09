# Task Checklist — AB-1005: Notes List (Pagination, Sorting, Tag Filter)

| Field | Value |
|---|---|
| Ticket | AB-1005 |
| Status | **Complete** |
| Proposal ref | `openspec/changes/AB-1005/proposal.md` |
| Spec ref | `openspec/changes/AB-1005/spec.md` |
| Total tasks | 4 |

Legend: `[ ]` = todo · `[x]` = done · `[~]` = in progress · `[P]` = can run in parallel with sibling `[P]` tasks

---

## Phase 1 — Service: `list` function

> Add `list(userId, query)` to the existing `notes.service.ts`. No new files; no shared changes.

- [x] **T01** Add `list` export to `apps/api/src/services/notes.service.ts`
  - Import `NoteListItem`, `PaginationMeta` from `'shared'`; import `NoteListQuerySchema` from `'shared'`; import `z` from `'zod'`
  - Parse `tags` CSV: `const tagIds = tags ? tags.split(',').filter(Boolean) : []`
  - Validate tag ownership: `prisma.tag.findMany({ where: { id: { in: tagIds }, userId } })` → throw `INVALID_TAG` on mismatch
  - Build `where: Prisma.NoteWhereInput = { userId, deletedAt: null, ...(tagIds.length > 0 && { AND: tagIds.map(id => ({ tags: { some: { tagId: id } } })) }) }`
  - Batch read: `const [total, notes] = await prisma.$transaction([prisma.note.count({ where }), prisma.note.findMany({ where, orderBy: { [sortBy]: sortOrder } as Prisma.NoteOrderByWithRelationInput, skip: (page - 1) * limit, take: limit, include: { tags: { include: { tag: true } } } })])`
  - Map to `NoteListItem[]`: `contentPreview = (note.contentText ?? '').slice(0, 150)`, `updatedAt = note.updatedAt.toISOString()`
  - Return `{ data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } }`
  - Verify: `pnpm --filter api build` passes; `pnpm --filter api lint` clean

---

### ✅ Phase 1 Checkpoint

```bash
pnpm --filter api build   # 0 type errors
pnpm --filter api lint    # 0 errors, 0 warnings
```

---

## Phase 2 — Route: `GET /`

> Add `GET /` handler to `notes.routes.ts` **before** the existing `GET /:id` handler.

- [x] **T02** Update `apps/api/src/routes/notes.routes.ts`
  - Add `NoteListQuerySchema` to the import from `'shared'`
  - Add `import type { z } from 'zod'` (or `import { z }` if not already present)
  - Register `notesRouter.get('/', authenticate, validate(NoteListQuerySchema, 'query'), async (req, res, next) => { ... })` **before** the `GET /:id` handler
  - Inside handler: cast `const query = req.query as z.infer<typeof NoteListQuerySchema>`; call `notesService.list(req.user.id, query)`; return `res.json(result)`
  - Verify route order: `GET /` appears before `GET /:id` in the file
  - Verify: `pnpm --filter api build` passes; `pnpm --filter api lint` clean

---

### ✅ Phase 2 Checkpoint

```bash
pnpm --filter api build   # 0 type errors
pnpm --filter api lint    # 0 errors, 0 warnings
```

---

## Phase 3 — Unit Tests [P]

> Add `list` unit tests to the existing `notes.service.test.ts`. All 9 cases.

- [x] **T03** Add unit tests for `list` in `apps/api/src/services/__tests__/notes.service.test.ts`

  **Mock setup addition (add inside the existing mock or a new describe block):**
  - `$transaction` array form: `vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops))`
  - Use `mockImplementationOnce` per test for the array form; the callback form tests from AB-1004 remain unchanged

  **Tests (LIST-UT-01 to LIST-UT-09):**
  - UT-01: No `tags`, default page/limit → `$transaction` called; returns `{ data, meta }` with `page:1, limit:20`
  - UT-02: Valid `tags` CSV (all owned) → `tag.findMany` called with `{ id: { in: tagIds }, userId }`; `note.findMany` where includes `AND` array
  - UT-03: Foreign tag in CSV → `tag.findMany` returns 0; throws `AppError('INVALID_TAG', ..., 400)`
  - UT-04: `contentText: null` → `contentPreview: ''` in result item
  - UT-05: `contentText` > 150 chars → `contentPreview.length === 150`
  - UT-06: `sortBy: 'title'`, `sortOrder: 'asc'` → `note.findMany` called with `orderBy: { title: 'asc' }`
  - UT-07: `page=2`, `limit=5` → `note.findMany` called with `skip: 5, take: 5`
  - UT-08: `total=0` → returns `meta: { total:0, totalPages:0 }`, `data: []`
  - UT-09: No `tags` param → `tag.findMany` NOT called; `where` has no `AND` key

---

## Phase 4 — Integration Tests [P]

> Add `GET /notes` integration tests to the existing `notes.routes.integration.ts`. All 14 cases.

- [x] **T04** Add integration tests for `GET /api/v1/notes` in `apps/api/src/routes/__tests__/notes.routes.integration.ts`

  **Helper additions:**
  - `createTag(token, body)` — helper to POST to `/api/v1/tags` and return tag `id`

  **Tests (LIST-IT-01 to LIST-IT-14):**
  - IT-01: No auth → `401`
  - IT-02: Auth, no notes → `200`, `data: []`, `meta.total: 0`, `meta.totalPages: 0`
  - IT-03: One note → `200`; `data[0]` has `id`, `title`, `contentPreview`, `tags`, `updatedAt`
  - IT-04: Note with contentText > 150 chars → `data[0].contentPreview.length === 150`
  - IT-05: Two users — each sees only own notes (cross-user isolation)
  - IT-06: `limit=1`, 2 notes → `meta.total: 2`, `meta.totalPages: 2`, `data.length: 1`
  - IT-07: `page=2&limit=1`, 2 notes → returns second note
  - IT-08: `page=99` (out of range) → `200`, `data: []`, correct `meta.total`
  - IT-09: `sortBy=title&sortOrder=asc`, 2 notes → `data[0].title` is alphabetically first
  - IT-10: `tags=id1` → only tagged note returned; untagged note excluded
  - IT-11: `tags=id1,id2` AND filter → only note with BOTH tags returned; note with one tag excluded
  - IT-12: `tags=` contains foreign tag → `400`, `error.code: 'INVALID_TAG'`
  - IT-13: `limit=101` → `400`, `error.code: 'VALIDATION_ERROR'`
  - IT-14: Soft-deleted note not in list → `meta.total` excludes it

---

### ✅ Phase 3+4 Checkpoint (Final Quality Gate)

```bash
pnpm --filter api build           # 0 type errors
pnpm --filter api lint            # 0 errors, 0 warnings
pnpm --filter api test            # all unit + integration tests pass
pnpm --filter api test:coverage   # ≥80% line + branch for notes.service.ts
```

---

## Commit Sequence

| Commit | After | Message |
|---|---|---|
| 1 | T01 + T02 done, build passes | `feat(api): add notes list endpoint with pagination, sorting, and tag filter` |
| 2 | T03 + T04 done, all tests pass | `test(api): add notes list unit and integration tests` |

---

## Out of Scope

| Item | Ticket |
|---|---|
| `GET /notes/search` (FTS via `plainto_tsquery`) | AB-1007 |
| Tags CRUD endpoints | AB-1006 |
| Share links | AB-1008 |
| Version list/restore | AB-1009 |
| Frontend notes list page | AB-1011 |
