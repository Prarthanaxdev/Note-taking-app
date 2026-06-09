# Technical Plan — AB-1007: Full-Text Search

| Field | Value |
|---|---|
| Ticket | AB-1007 |
| Branch | `feature/AB-1007-search-service` |
| Status | **Awaiting Approval** |
| Depends on | AB-1004 (FTS migration — `ts` tsvector + GIN index already live) |
| Unblocks | AB-1013/1014 (frontend search UI) |

---

## 1. Summary

Add `GET /api/v1/notes/search` — paginated full-text search over the authenticated user's non-deleted notes. Uses PostgreSQL `plainto_tsquery` + `ts_headline` via `prisma.$queryRaw`. One schema change in `packages/shared`; one new service; one route addition; two test files.

No DB migrations needed — the `ts` tsvector column and GIN index already exist from AB-1004.

---

## 2. Files to Change

| File | Action | Notes |
|---|---|---|
| `packages/shared/src/schemas/search.schemas.ts` | **Edit** | Replace `min(1)` → `.trim()` on `q` |
| `apps/api/src/services/search.service.ts` | **Create** | `search(userId, dto)` with `$queryRaw` |
| `apps/api/src/routes/notes.routes.ts` | **Edit** | Add `GET /search` before `GET /:id`; add imports |
| `apps/api/src/services/__tests__/search.service.test.ts` | **Create** | Unit tests SRCH-UT-01 through SRCH-UT-06 |
| `apps/api/src/routes/__tests__/notes.routes.integration.ts` | **Edit** | Append search block SRCH-IT-01 through SRCH-IT-11 |

**Already correct — no changes:**
- `packages/shared/src/types/errors.types.ts` — `QUERY_REQUIRED` already in union
- `packages/shared/src/types/api.types.ts` — `SearchResult` + `PaginationMeta` already exported
- `packages/shared/src/index.ts` — `SearchQuerySchema` already re-exported
- `apps/api/src/index.ts` — `notesRouter` already mounted at `/api/v1/notes`

---

## 3. TypeScript Shapes

All types sourced from `packages/shared` — no new types needed.

```ts
// packages/shared/src/types/api.types.ts — already exists, unchanged
type SearchResult = { id: string; title: string; headline: string; updatedAt: string };
type PaginationMeta = { total: number; page: number; limit: number; totalPages: number };

// Internal to search.service.ts — raw PostgreSQL row shape
type RawSearchRow = {
  id: string;
  title: string;
  updatedAt: Date;       // Date object from pg driver
  headline: string;
  rank: number;
  total_count: bigint;   // BigInt from pg driver — must Number() convert
};
```

---

## 4. Schema Change (packages/shared)

**`packages/shared/src/schemas/search.schemas.ts`**

```ts
// Before
q: z.string().min(1),

// After
q: z.string().trim(),
```

**Why:** `min(1)` causes whitespace-only input (`" "`) to return `VALIDATION_ERROR`, not `QUERY_REQUIRED`. Removing it lets the trimmed empty string reach the service, where the specific error code is thrown. Missing `q` entirely still fails Zod's Required check → `VALIDATION_ERROR` (correct, unchanged).

---

## 5. Service Implementation — `apps/api/src/services/search.service.ts`

```ts
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
  return {
    data: rows.map(row => ({
      id: row.id,
      title: row.title,
      headline: row.headline,
      updatedAt: row.updatedAt.toISOString(),
    })),
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}
```

**Key invariants:**
- `plainto_tsquery()` everywhere — never `to_tsquery()` (AGENTS.md constraint)
- Tagged template literals only — no string interpolation (AGENTS.md constraint)
- `COALESCE(n."contentText", '')` — safe when note has no plain text yet
- `COUNT(*) OVER()` — single DB round-trip for total
- `Number(total_count)` — explicit BigInt → number (pg returns bigint for window aggregates)
- `updatedAt.toISOString()` — Date → string for API response shape
- `userId` from parameter (sourced from JWT at route layer) — never from query string

---

## 6. Route Change — `apps/api/src/routes/notes.routes.ts`

Two changes:

**1. Add imports at the top:**
```ts
// Existing line (will be extended):
import { CreateNoteSchema, UpdateNoteSchema, NoteListQuerySchema } from 'shared';
// Change to:
import { CreateNoteSchema, UpdateNoteSchema, NoteListQuerySchema, SearchQuerySchema } from 'shared';

// Add new import after notesService import:
import * as searchService from '../services/search.service.js';
```

**2. Insert route BEFORE `notesRouter.get('/:id', ...)`:**
```ts
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

**Why before `/:id`:** Express matches routes in declaration order. If `/search` is registered after `/:id`, a request to `GET /notes/search` would match `/:id` with `id = "search"` — producing a NOT_FOUND error instead of search results.

**Pattern match:** Handler shape is identical to the existing `GET /` list handler — same `req.query as unknown as Parameters<...>` cast, same try/catch/next pattern.

---

## 7. Unit Tests — `apps/api/src/services/__tests__/search.service.test.ts`

```
vi.mock('../../lib/prisma.js') with prisma.$queryRaw: vi.fn()
```

| Test | Scenario | Assertion |
|---|---|---|
| SRCH-UT-01 | `q = ""` | Throws `AppError('QUERY_REQUIRED', ..., 400)`; `$queryRaw` NOT called |
| SRCH-UT-02 | `$queryRaw` returns `[]` | Returns `{ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }` |
| SRCH-UT-03 | Two rows with valid shape | `data` has 2 `SearchResult`; `updatedAt` is ISO string; BigInt converted |
| SRCH-UT-04 | `page=2, limit=5` | `$queryRaw` called with correct args; `meta.page === 2`, `meta.limit === 5` |
| SRCH-UT-05 | `total_count = BigInt(7)`, 3 rows | `meta.total === 7`, `meta.totalPages === 1` |
| SRCH-UT-06 | Valid query | `$queryRaw` called once (confirms it reaches DB for valid input) |

Mock pattern matches `notes.service.test.ts` — `vi.mock('../../lib/prisma.js')` before the import of the service under test.

---

## 8. Integration Tests — append to `apps/api/src/routes/__tests__/notes.routes.integration.ts`

New `describe.skipIf(!DB_AVAILABLE)('GET /api/v1/notes/search', () => { ... })` block, reusing the existing `registerUser` and `createNote` helpers already in the file.

| Test | Scenario | Expected |
|---|---|---|
| SRCH-IT-01 | No auth | `401` |
| SRCH-IT-02 | Missing `q` param | `400 VALIDATION_ERROR` |
| SRCH-IT-03 | `q=%20%20` (whitespace) | `400 QUERY_REQUIRED` |
| SRCH-IT-04 | Valid query, no matching notes | `200`, `data: []`, `meta.total: 0` |
| SRCH-IT-05 | Query matches note title | `200`, correct `id` + `title` |
| SRCH-IT-06 | Query matches `contentText` | `200`, 1 result |
| SRCH-IT-07 | `headline` contains `<mark>` | `res.body.data[0].headline` includes `<mark>` |
| SRCH-IT-08 | Soft-deleted note excluded | Create → delete → search → `data: []` |
| SRCH-IT-09 | Cross-user isolation | Bob's note doesn't appear in Alice's results |
| SRCH-IT-10 | Pagination `page=1&limit=1`, 2 matches | `data.length === 1`, `meta.total === 2`, `meta.totalPages === 2` |
| SRCH-IT-11 | `updatedAt` format | Matches `/^\d{4}-\d{2}-\d{2}T/` |

**Note for SRCH-IT-05/06/08:** Notes need searchable `contentText`. Create notes with a `title` containing the search term (title flows through FTS via the tsvector). For content matching (SRCH-IT-06), the integration test must set `contentText` directly via the test Prisma client or create the note with content that produces the right `contentText` — check how `notesService.create` stores `contentText` from TipTap JSON.

---

## 9. Architecture Decisions

| Decision | Rationale |
|---|---|
| `prisma.$queryRaw` instead of Prisma ORM | Prisma ORM has no `GENERATED ALWAYS AS` column support and no `ts_headline` / `plainto_tsquery` mapping — raw SQL is the only option for FTS |
| Single query with `COUNT(*) OVER()` | Avoids a second `COUNT(*)` round-trip; safe because results are small and the window aggregate is cheap relative to the FTS scan |
| Service-level `QUERY_REQUIRED` guard | Zod `.trim()` means a whitespace `q` becomes `""` and passes schema validation — the explicit `if (!q)` guard returns the specific error code the FRS requires |
| `/search` registered before `/:id` | Express route matching is first-match; without this ordering, `/notes/search` would resolve `id = "search"` → NOT_FOUND |
| No new shared types | `SearchResult` and `PaginationMeta` are already in `packages/shared/src/types/api.types.ts` and `QUERY_REQUIRED` is already in `errors.types.ts` |

---

## 10. DB Impact

No migrations. The `ts` tsvector column (generated always) and GIN index on `Note` were added in AB-1004. This ticket only reads from the DB; it does not alter the schema.

---

## 11. Implementation Order

```
Task 1 → packages/shared schema change
Task 2 → search.service.ts
Task 3 → notes.routes.ts edit
Task 4 → unit tests
Task 5 → integration tests (append)
Task 6 → quality gates
```

Tasks 1–3 must be sequential (route depends on service, both depend on schema). Tasks 4–5 can be written in any order.

---

## 12. Quality Gates

Run in this exact order before committing:

```bash
pnpm -r lint                  # 0 ESLint errors across all packages
pnpm -r build                 # 0 TypeScript errors (shared, api, web)
pnpm --filter api test        # All unit tests pass; integration skipped if no DATABASE_URL_TEST
```

---

## 13. Out of Scope

| Item | Ticket |
|---|---|
| Frontend search bar + results page | AB-1013/1014 |
| `<mark>` tag rendering/styling | AB-1013/1014 |
| Share links | AB-1008 |
| Note versions | AB-1009 |
| Unauthenticated search | Not in FRS |
