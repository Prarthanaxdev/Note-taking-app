# Implementation Proposal — AB-1005: Notes List (Pagination, Sorting, Tag Filter)

| Field | Value |
|---|---|
| Ticket | AB-1005 |
| Status | **Awaiting Approval** |
| Scope | Backend only — `apps/api` |
| Depends on | AB-1004 (notes service + routes already exist; FTS migration applied) |
| Unblocks | AB-1011/1012 (frontend notes list UI) |

---

## 1. Goal

Add `GET /notes` — the notes list endpoint — to the NTA backend:

- **`notes.service.ts`** — add a `list(userId, query)` function: pagination, multi-field sorting, AND-logic tag filtering, computed `contentPreview`.
- **`notes.routes.ts`** — wire `GET /` through `authenticate` + `validate(NoteListQuerySchema, 'query')`.
- **Unit + integration tests** for the new function and route.

No shared types or schemas need to change. `NoteListQuerySchema`, `NoteListItem`, and `PaginationMeta` are already defined and correct.

---

## 2. Clarifying Decisions (recorded)

| Question | Decision |
|---|---|
| Invalid tag IDs in `tags` CSV | `400 INVALID_TAG` — consistent with create/update tag validation |
| `contentPreview` truncation | Hard-cut at 150 chars (`contentText.slice(0, 150)`), no ellipsis — matches SDS literal spec; frontend adds ellipsis if desired |
| AND-logic tag filter implementation | Prisma relational AND: `{ AND: tagIds.map(id => ({ tags: { some: { tagId: id } } })) }` — no raw SQL; correct for max-5-tags-per-note constraint |
| Title sort case sensitivity | Standard Prisma `orderBy` (case-sensitive by default in PostgreSQL) — true case-insensitive ordering requires raw SQL or a functional index, deferred to a future iteration |

---

## 3. Files to Create or Modify

### 3.1 Modified Files

| File | Change |
|---|---|
| `apps/api/src/services/notes.service.ts` | Add `list(userId, query)` export |
| `apps/api/src/routes/notes.routes.ts` | Add `GET /` handler before `GET /:id` |
| `apps/api/src/services/__tests__/notes.service.test.ts` | Add unit tests for `list` |
| `apps/api/src/routes/__tests__/notes.routes.integration.ts` | Add integration tests for `GET /notes` |

### 3.2 Already Correct (no changes needed)

| File | Why |
|---|---|
| `packages/shared/src/schemas/notes.schemas.ts` | `NoteListQuerySchema` already defined with all required fields |
| `packages/shared/src/types/api.types.ts` | `NoteListItem` and `PaginationMeta` already defined |
| `packages/shared/src/types/errors.types.ts` | `INVALID_TAG` already in the union |
| `apps/api/src/index.ts` | `notesRouter` already registered at `/api/v1/notes` |

---

## 4. Detailed Design

### 4.1 `NoteListQuerySchema` (already in shared — shown for reference)

```typescript
export const NoteListQuerySchema = z.object({
  page:      z.coerce.number().int().positive().default(1),
  limit:     z.coerce.number().int().positive().max(100).default(20),
  sortBy:    z.enum(['createdAt', 'updatedAt', 'title']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  tags:      z.string().optional(),  // CSV of tag IDs, e.g. "id1,id2"
});
```

The `validate(NoteListQuerySchema, 'query')` middleware coerces and validates these from `req.query` (string values from the URL become numbers where needed), then merges the parsed result back into `req.query` via `Object.assign`.

### 4.2 `list` function — `notes.service.ts`

```typescript
export async function list(
  userId: string,
  query: z.infer<typeof NoteListQuerySchema>,
): Promise<{ data: NoteListItem[]; meta: PaginationMeta }> {
  const { page, limit, sortBy, sortOrder, tags } = query;

  // Parse CSV tag filter
  const tagIds = tags ? tags.split(',').filter(Boolean) : [];

  // Validate tag ownership — 400 INVALID_TAG on any mismatch
  if (tagIds.length > 0) {
    const owned = await prisma.tag.findMany({ where: { id: { in: tagIds }, userId } });
    if (owned.length !== tagIds.length)
      throw new AppError('INVALID_TAG', 'One or more specified tags are invalid.', 400);
  }

  // Build WHERE clause
  const where: Prisma.NoteWhereInput = {
    userId,
    deletedAt: null,
    ...(tagIds.length > 0 && {
      AND: tagIds.map(id => ({ tags: { some: { tagId: id } } })),
    }),
  };

  // Parallel count + paginated fetch in one transaction snapshot
  const [total, notes] = await prisma.$transaction([
    prisma.note.count({ where }),
    prisma.note.findMany({
      where,
      orderBy: { [sortBy]: sortOrder } as Prisma.NoteOrderByWithRelationInput,
      skip: (page - 1) * limit,
      take: limit,
      include: { tags: { include: { tag: true } } },
    }),
  ]);

  const data: NoteListItem[] = notes.map(note => ({
    id: note.id,
    title: note.title,
    contentPreview: (note.contentText ?? '').slice(0, 150),
    tags: note.tags.map(nt => ({ id: nt.tag.id, name: nt.tag.name, color: nt.tag.color })),
    updatedAt: note.updatedAt.toISOString(),
  }));

  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}
```

**Key design points:**

- `prisma.$transaction([count, findMany])` — batch read ensures count and data see the same snapshot. No mutation, no callback form needed.
- `tagIds.map(id => ({ tags: { some: { tagId: id } } }))` — each condition requires at least one `NoteTag` with that `tagId` for the note's user; Prisma emits `EXISTS (SELECT 1 FROM "NoteTag" WHERE ...)` per condition. AND-logic = all conditions must hold.
- `(note.contentText ?? '').slice(0, 150)` — `contentText` is `String | null` in Prisma; fallback to `''` avoids null propagation.
- `Math.ceil(total / limit)` — `total=0` → `totalPages=0`. Page out of range → empty `data`, `meta.total` reflects actual count.
- Title sort is case-sensitive (PostgreSQL default). True case-insensitive ordering is deferred.

### 4.3 Route Wiring — `notes.routes.ts`

`GET /` is registered **before** `GET /:id` to avoid route shadowing:

```typescript
import { NoteListQuerySchema, CreateNoteSchema, UpdateNoteSchema } from 'shared';

// GET /api/v1/notes  — must precede GET /:id
notesRouter.get(
  '/',
  authenticate,
  validate(NoteListQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as z.infer<typeof NoteListQuerySchema>;
      const result = await notesService.list(req.user.id, query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
```

The `validate` middleware coerces query string values (e.g., `"1"` → `1` for `page`) and sets defaults before the handler runs. The route returns `200` with `{ data: NoteListItem[], meta: PaginationMeta }`.

---

## 5. Security Invariants

| Invariant | Implementation |
|---|---|
| `userId` from JWT only | `list(req.user.id, ...)` — never from query params or body |
| Ownership enforced in service | `where: { userId }` scopes every Prisma query |
| Tag validation before query | Tag IDs validated against `userId` before any note fetch |
| No `$queryRaw` | Pure Prisma — no raw SQL in this ticket |
| Cross-user tags → 400, not 404 | Tag validation returns INVALID_TAG to prevent inferring tag existence via list behavior |

---

## 6. Implementation Order

| Step | Task | Depends on |
|---|---|---|
| 1 | Add `list` to `notes.service.ts` | AB-1004 service already exists |
| 2 | Add `GET /` to `notes.routes.ts` | Step 1 |
| 3 | Add unit tests for `list` in `notes.service.test.ts` | Step 1 |
| 4 | Add integration tests for `GET /notes` in `notes.routes.integration.ts` | Step 2 |
| 5 | Quality gates: lint → build → test | Steps 1–4 |

---

## 7. Quality Gate Checkpoints

```bash
pnpm -r lint            # 0 errors
pnpm -r build           # 0 type errors
pnpm --filter api test  # all unit + integration tests pass
pnpm --filter api test:coverage  # ≥80% line + branch on notes.service.ts
```

---

## 8. Out of Scope

| Item | Ticket |
|---|---|
| `GET /notes/search` (FTS via `plainto_tsquery`) | AB-1007 |
| Tags CRUD endpoints | AB-1006 |
| Share links | AB-1008 |
| Version list/restore | AB-1009 |
| Frontend notes list page | AB-1011 |
| Case-insensitive title sort | Future iteration |

---

## 9. Commit Plan

| Commit | After | Message |
|---|---|---|
| 1 | `list` function + route wired, build passes | `feat(api): add notes list endpoint with pagination, sorting, and tag filter` |
| 2 | Unit + integration tests passing | `test(api): add notes list unit and integration tests` |
