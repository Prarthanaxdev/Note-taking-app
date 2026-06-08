# Implementation Proposal — AB-1007: Full-Text Search

| Field | Value |
|---|---|
| Ticket | AB-1007 |
| Status | **Awaiting Approval** |
| Scope | Backend — `apps/api` + one shared schema update |
| Depends on | AB-1004 (FTS migration — `ts` tsvector column + GIN index on `Note` already in DB) |
| Unblocks | AB-1013/1014 (frontend search UI — `SearchResult` type, `<mark>` highlight rendering) |

---

## 1. Goal

Implement `GET /notes/search` — a paginated full-text search endpoint over the authenticated user's non-deleted notes, using PostgreSQL `plainto_tsquery` + `ts_headline` via `prisma.$queryRaw`.

---

## 2. Clarifying Decisions (recorded)

| Question | Decision |
|---|---|
| Route location | `GET /notes/search` added to `notes.routes.ts` — registered **before** `GET /:id` to prevent Express treating "search" as a note ID |
| QUERY_REQUIRED semantics | Remove `min(1)` from `SearchQuerySchema.q`; add `.trim()`. Service explicitly checks `if (!q)` and throws `AppError('QUERY_REQUIRED', ..., 400)` — ensures whitespace-only returns the specific code, not VALIDATION_ERROR |
| Total count strategy | `COUNT(*) OVER()` window function — single DB round-trip; `total_count` BigInt column in every result row |
| `ts_headline` when `contentText` is null | `COALESCE(n."contentText", '')` — returns empty headline fragment, never throws |

---

## 3. Files to Create or Modify

### 3.1 Shared Package

| File | Change |
|---|---|
| `packages/shared/src/schemas/search.schemas.ts` | Replace `min(1)` with `.trim()` on `q` (removes Zod min guard; service takes over QUERY_REQUIRED) |

No new shared types — `SearchResult` and `PaginationMeta` already exported from `api.types.ts`.

### 3.2 API

| File | Change |
|---|---|
| `apps/api/src/services/search.service.ts` | Create — `search(userId, dto)` function using `$queryRaw` |
| `apps/api/src/routes/notes.routes.ts` | Add `GET /search` handler **before** `GET /:id`; import from `search.service.ts` and `SearchQuerySchema` |
| `apps/api/src/services/__tests__/search.service.test.ts` | Create — unit tests (mock `$queryRaw`) |
| `apps/api/src/routes/__tests__/notes.routes.integration.ts` | Append search integration tests to the existing file |

### 3.3 Already Correct (no changes needed)

| File | Why |
|---|---|
| `packages/shared/src/types/errors.types.ts` | `QUERY_REQUIRED` already in `AppErrorCode` union |
| `packages/shared/src/types/api.types.ts` | `SearchResult` (`id`, `title`, `headline`, `updatedAt`) already exported |
| `packages/shared/src/index.ts` | `export *` — `SearchQuerySchema` already re-exported |
| `apps/api/src/index.ts` | `notesRouter` already registered at `/api/v1/notes`; `/search` is a sub-route |

---

## 4. Detailed Design

### 4.1 Shared Schema Change

**`packages/shared/src/schemas/search.schemas.ts`** — change `q`:

```typescript
// Before
q: z.string().min(1),

// After
q: z.string().trim(),
```

Removing `min(1)` means an all-whitespace query passes Zod (trimmed to `""`) and reaches the service, where `QUERY_REQUIRED` is thrown with its specific code. A truly missing `q` field still fails Zod as Required → VALIDATION_ERROR (correct).

### 4.2 `search.service.ts`

```typescript
import type { z } from 'zod';
import type { SearchResult, PaginationMeta } from 'shared';
import { SearchQuerySchema } from 'shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

type RawSearchRow = {
  id: string;
  title: string;
  updatedAt: Date;
  headline: string;
  rank: number;
  total_count: bigint;
};

export async function search(
  userId: string,
  dto: z.infer<typeof SearchQuerySchema>,
): Promise<{ data: SearchResult[]; meta: PaginationMeta }> {
  const { q, page, limit } = dto;
  if (!q) throw new AppError('QUERY_REQUIRED', 'Search query is required.', 400);

  const offset = (page - 1) * limit;

  const rows = await prisma.$queryRaw<RawSearchRow[]>`
    SELECT
      n.id,
      n.title,
      n."updatedAt",
      ts_headline(
        'english',
        COALESCE(n."contentText", ''),
        plainto_tsquery('english', ${q}),
        'StartSel=<mark>, StopSel=</mark>, MaxWords=40, MinWords=20'
      ) AS headline,
      ts_rank(n.ts, plainto_tsquery('english', ${q})) AS rank,
      COUNT(*) OVER() AS total_count
    FROM "Note" n
    WHERE
      n."userId" = ${userId}
      AND n."deletedAt" IS NULL
      AND n.ts @@ plainto_tsquery('english', ${q})
    ORDER BY rank DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const total = rows.length > 0 ? Number(rows[0].total_count) : 0;
  const data: SearchResult[] = rows.map(row => ({
    id: row.id,
    title: row.title,
    headline: row.headline,
    updatedAt: row.updatedAt.toISOString(),
  }));

  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}
```

Key points:
- `plainto_tsquery()` used (not `to_tsquery()`) — sanitizes user input, prevents FTS syntax injection
- Tagged template literals throughout — no string interpolation
- `COALESCE(n."contentText", '')` — safe when content is null
- `COUNT(*) OVER()` — total in every result row, one DB round-trip
- BigInt `total_count` → `Number()` conversion
- `updatedAt` (Date) → `.toISOString()` for consistent API response shape

### 4.3 Route — `notes.routes.ts`

```typescript
// Add imports at top:
import { CreateNoteSchema, UpdateNoteSchema, NoteListQuerySchema, SearchQuerySchema } from 'shared';
import * as searchService from '../services/search.service.js';

// Add BEFORE GET /:id:
notesRouter.get(
  '/search',
  authenticate,
  validate(SearchQuerySchema, 'query'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = req.query as unknown as Parameters<typeof searchService.search>[1];
      const result = await searchService.search(req.user.id, query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
```

Route order is critical: Express matches routes in declaration order. `/search` must appear **before** `/:id` or a `GET /notes/search` request would match `/:id` with `id = "search"`.

---

## 5. Security Invariants

| Invariant | Implementation |
|---|---|
| `userId` from JWT only | `req.user.id` passed to service; never from query params or body |
| Authorization in service layer | `WHERE n."userId" = ${userId}` in the raw query |
| No raw SQL string interpolation | All dynamic values use tagged template literal placeholders `${...}` |
| `plainto_tsquery()` only | User input never passed to `to_tsquery()` — prevents operator injection |
| Soft-deleted notes excluded | `AND n."deletedAt" IS NULL` in WHERE clause |
| Cross-user isolation | userId scopes the query; no other user's notes can match |
| QUERY_REQUIRED for empty q | Service-level guard runs before the DB query |

---

## 6. Implementation Order

| Step | Task |
|---|---|
| 1 | Update `SearchQuerySchema.q` — replace `min(1)` with `.trim()` |
| 2 | Create `apps/api/src/services/search.service.ts` |
| 3 | Add `GET /search` route to `notes.routes.ts` before `GET /:id` |
| 4 | Write unit tests — `search.service.test.ts` |
| 5 | Append search integration tests to `notes.routes.integration.ts` |
| 6 | Quality gates: lint → build → test |

---

## 7. Quality Gate Checkpoints

```bash
pnpm -r lint                      # 0 errors
pnpm -r build                     # 0 type errors (all three packages)
pnpm --filter api test            # all unit tests pass; integration skipped if no DB
```

---

## 8. Out of Scope

| Item | Ticket |
|---|---|
| Frontend search UI (search bar, results page, `<mark>` styling) | AB-1013/1014 |
| Share links | AB-1008 |
| Note versions | AB-1009 |
| Search within shared/public notes (unauthenticated) | Not in FRS |
