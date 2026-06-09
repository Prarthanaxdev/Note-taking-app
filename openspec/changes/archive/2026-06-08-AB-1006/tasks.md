# Task Checklist — AB-1006: Tags CRUD

| Field | Value |
|---|---|
| Ticket | AB-1006 |
| Status | **Complete** |
| Proposal ref | `openspec/changes/AB-1006/proposal.md` |
| Spec ref | `openspec/changes/AB-1006/spec.md` |
| Total tasks | 6 |

Legend: `[ ]` = todo · `[x]` = done · `[~]` = in progress · `[P]` = can run in parallel with sibling `[P]` tasks

---

## Phase 1 — Shared Package Updates

> Update shared FIRST — the API cannot compile until `TagWithCount` exists and `UpdateTagSchema` is updated.

- [x] **T01** Update `packages/shared/src/types/api.types.ts`
  - Add `export type TagWithCount = TagSummary & { noteCount: number };` after `TagSummary`
  - Verify: `pnpm --filter shared build` passes

- [x] **T02** Update `packages/shared/src/schemas/tags.schemas.ts`
  - Add `.trim()` to `name` in `CreateTagSchema`: `z.string().trim().min(1).max(50)`
  - Replace `UpdateTagSchema = CreateTagSchema.partial()` with an explicit object schema:
    - `name: z.string().trim().min(1).max(50).optional()`
    - `color: z.string().regex(...).optional().nullable()`
  - Verify: `pnpm -r build` passes (shared + api + web all compile)

---

### ✅ Phase 1 Checkpoint

```bash
pnpm -r build   # 0 type errors across all packages
```

---

## Phase 2 — Service + Routes

- [x] **T03** Create `apps/api/src/services/tags.service.ts`
  - `toTagSummary(tag)` — maps `{ id, name, color }` to `TagSummary`
  - `checkNameConflict(userId, name, excludeId?)` — `findFirst` with `mode: 'insensitive'`; throws `TAG_NAME_TAKEN 409` if found
  - `listTags(userId)` — `tag.findMany({ where: { userId }, include: { _count: { select: { notes: { where: { note: { deletedAt: null } } } } } }, orderBy: { createdAt: 'asc' } })` → `TagWithCount[]`
  - `createTag(userId, dto)` — `checkNameConflict` → `tag.create` → `TagSummary`
  - `updateTag(userId, tagId, dto)` — `findFirst({ id, userId })` → 404 if null → optional `checkNameConflict(userId, dto.name, tagId)` → `tag.update` with conditional spread for `name` and `color` → `TagSummary`
  - `deleteTag(userId, tagId)` — `findFirst({ id, userId })` → 404 if null → `tag.delete` (DB cascade removes NoteTag)
  - Color update logic: `...(dto.color !== undefined && { color: dto.color })` — handles null (unset), string (set), undefined (unchanged)
  - Verify: `pnpm --filter api build` and `pnpm --filter api lint` pass

- [x] **T04** Fill `apps/api/src/routes/tags.routes.ts`
  - Import `authenticate`, `validate`, `CreateTagSchema`, `UpdateTagSchema`, `* as tagsService`
  - `GET /` — `authenticate` → `tagsService.listTags` → `res.json(tags)` (200)
  - `POST /` — `authenticate`, `validate(CreateTagSchema)` → `tagsService.createTag` → `res.status(201).json(tag)`
  - `PATCH /:id` — `authenticate`, `validate(UpdateTagSchema)` → `tagsService.updateTag(req.user.id, String(req.params.id), ...)` → `res.json(tag)` (200)
  - `DELETE /:id` — `authenticate` → `tagsService.deleteTag` → `res.status(204).send()`
  - Verify: `pnpm --filter api build` and `pnpm --filter api lint` pass

---

### ✅ Phase 2 Checkpoint

```bash
pnpm --filter api build   # 0 type errors
pnpm --filter api lint    # 0 errors, 0 warnings
```

---

## Phase 3 — Unit Tests [P]

- [x] **T05** Create `apps/api/src/services/__tests__/tags.service.test.ts`

  **Mock setup:**
  ```typescript
  vi.mock('../../lib/prisma.js', () => ({
    prisma: {
      tag: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    },
  }));
  ```

  **Tests (TAG-UT-01 through TAG-UT-17):**

  - UT-01: `listTags` — 2 tags with noteCounts → `findMany` called with `_count` include; returns `TagWithCount[]`
  - UT-02: `listTags` — no tags → returns `[]`
  - UT-03: `createTag` happy path (name + color) → uniqueness check passes; `create` called; returns `TagSummary`
  - UT-04: `createTag` no color → `create` called with `color: null`
  - UT-05: `createTag` duplicate name → `findFirst` returns existing; throws `TAG_NAME_TAKEN 409`; `create` NOT called
  - UT-06: `createTag` name trimming — Zod trims; `create` called with trimmed name
  - UT-07: `updateTag` tag not found → throws `NOT_FOUND 404`
  - UT-08: `updateTag` name update, no conflict → uniqueness check excludes own id; `update` called with `{ name }`
  - UT-09: `updateTag` new name conflicts → throws `TAG_NAME_TAKEN 409`; `update` NOT called
  - UT-10: `updateTag` color update only → `update` called with `{ color: '#aabbcc' }`; no `name` in data
  - UT-11: `updateTag` color: null → `update` called with `{ color: null }`
  - UT-12: `updateTag` color absent → `update` called WITHOUT `color` key
  - UT-13: `updateTag` both name and color → `update` called with both keys
  - UT-14: `updateTag` same name different case (self-exclusion) → uniqueness query has `id: { not: tagId }`; returns null → update proceeds
  - UT-15: `deleteTag` happy path → `findFirst` returns tag; `delete` called; resolves void
  - UT-16: `deleteTag` tag not found → throws `NOT_FOUND 404`; `delete` NOT called
  - UT-17: `deleteTag` foreign tag (`findFirst` returns null due to userId scope) → throws `NOT_FOUND 404`

---

## Phase 4 — Integration Tests [P]

- [x] **T06** Create `apps/api/src/routes/__tests__/tags.routes.integration.ts`

  **Helpers:** `registerUser(creds)`, `createTag(token, body)`

  **Tests (TAG-IT-01 through TAG-IT-24):**

  - IT-01 through IT-05: `GET /api/v1/tags` (auth, empty list, noteCount, noteCount excludes deleted, cross-user isolation)
  - IT-06 through IT-13: `POST /api/v1/tags` (auth, valid create, missing name, bad color, duplicate same case, duplicate different case, same name other user)
  - IT-14 through IT-20: `PATCH /api/v1/tags/:id` (auth, update name, update color, color → null, name conflict, self-rename different case, foreign tag)
  - IT-21 through IT-24: `DELETE /api/v1/tags/:id` (auth, own tag, foreign tag, cascade — note no longer shows deleted tag)

---

### ✅ Phase 3+4 Checkpoint (Final Quality Gate)

```bash
pnpm -r lint                      # 0 errors
pnpm -r build                     # 0 type errors
pnpm --filter api test            # all unit tests pass; integration skipped without DB
pnpm --filter api test:coverage   # ≥80% for tags.service.ts
```

---

## Commit Sequence

| Commit | After | Message |
|---|---|---|
| 1 | T01 + T02 | `feat(shared): add TagWithCount type and nullable color to UpdateTagSchema` |
| 2 | T03 + T04 | `feat(api): add tags CRUD service and routes` |
| 3 | T05 + T06 | `test(api): add tags service unit tests and routes integration tests` |

---

## Out of Scope

| Item | Ticket |
|---|---|
| Frontend tag management UI | AB-1011/1012 |
| Tag filter in notes list | AB-1005 ✓ (complete) |
| Search, shares, versions, version restore | AB-1007–AB-1009 |
