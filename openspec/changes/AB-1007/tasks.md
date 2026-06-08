# Tasks — AB-1007: Full-Text Search

| Field | Value |
|---|---|
| Ticket | AB-1007 |
| Total tasks | 22 |
| Status | Not started |

---

## Phase 1 — Foundation (Shared Schema)

> Checkpoint after this phase: `pnpm -r build` → 0 errors

- [x] **T-01 — Update `SearchQuerySchema.q`**
  - File: `packages/shared/src/schemas/search.schemas.ts`
  - Change `q: z.string().min(1)` → `q: z.string().trim()`
  - Why: `min(1)` maps whitespace-only input to `VALIDATION_ERROR`; the FRS requires `QUERY_REQUIRED` for that case. Trim + service guard achieves this without breaking the "missing `q`" → `VALIDATION_ERROR` path.
  - Verify: `pnpm -r build` still passes (both apps import `SearchQuerySchema`)

---

## Phase 2 — Core Implementation

> Tasks T-02 and T-03 are sequential (route depends on service). Both can proceed independently of Phase 1's build check once T-01 is committed.
> Checkpoint after this phase: `pnpm -r lint` → 0 errors, `pnpm -r build` → 0 type errors

- [x] **T-02 — Create `search.service.ts`**
  - File: `apps/api/src/services/search.service.ts` (new file)
  - Implement `export async function search(userId: string, dto: z.infer<typeof SearchQuerySchema>)`
  - Guard: `if (!q) throw new AppError('QUERY_REQUIRED', 'Search query is required.', 400)`
  - Raw query must include:
    - `plainto_tsquery('english', ${q})` — never `to_tsquery()`
    - `COALESCE(n."contentText", '')` as the `ts_headline` document argument
    - `ts_headline` options: `'StartSel=<mark>, StopSel=</mark>, MaxWords=40, MinWords=20'`
    - `ts_rank(...) AS rank` for ordering
    - `COUNT(*) OVER() AS total_count` — single round-trip total
    - `WHERE n."userId" = ${userId} AND n."deletedAt" IS NULL AND n.ts @@ plainto_tsquery(...)`
    - `ORDER BY rank DESC LIMIT ${limit} OFFSET ${offset}`
  - Map result: `total_count` BigInt → `Number()`; `updatedAt` Date → `.toISOString()`
  - Return: `{ data: SearchResult[], meta: PaginationMeta }`
  - Imports: `prisma` from `'../lib/prisma.js'`, `AppError` from `'../lib/errors.js'`, types + schema from `'shared'`

- [x] **T-03 — Add `GET /search` route to `notes.routes.ts`**
  - File: `apps/api/src/routes/notes.routes.ts`
  - Sub-tasks:
    - Add `SearchQuerySchema` to existing `import { ..., NoteListQuerySchema } from 'shared'` line
    - Add `import * as searchService from '../services/search.service.js'` after the `notesService` import
    - Register `notesRouter.get('/search', authenticate, validate(SearchQuerySchema, 'query'), handler)` **before** the existing `notesRouter.get('/:id', ...)` block
    - Handler shape: mirror the existing `GET /` handler — `req.query as unknown as Parameters<typeof searchService.search>[1]`, `res.json(result)`, `try/catch/next`
  - Critical: `/search` must be declared before `/:id` — Express first-match would otherwise resolve `id = "search"`

---

## Phase 3 — Integration Checkpoint

> Run after T-02 and T-03 are complete.

- [x] **T-04 — Lint + build gate**
  - `pnpm -r lint` → 0 errors (all three packages)
  - `pnpm -r build` → 0 TypeScript errors (all three packages)
  - Fix any issues before proceeding to tests

---

## Phase 4 — Unit Tests

> File: `apps/api/src/services/__tests__/search.service.test.ts` (new file)
> Setup: `vi.mock('../../lib/prisma.js', () => ({ prisma: { $queryRaw: vi.fn() } }))` + import service under test after mock declaration (matches pattern in `notes.service.test.ts`).
> Each task below is a single `it(...)` block.

- [x] **T-05 — SRCH-UT-01: empty `q` throws `QUERY_REQUIRED` without hitting DB**
  - Input: `dto = { q: '', page: 1, limit: 20 }`
  - Assert: throws `AppError` with `code === 'QUERY_REQUIRED'` and `statusCode === 400`
  - Assert: `prisma.$queryRaw` was NOT called (`expect(mockQueryRaw).not.toHaveBeenCalled()`)

- [x] **T-06 — SRCH-UT-02: `$queryRaw` returns empty array → zero-result response**
  - Mock: `prisma.$queryRaw.mockResolvedValue([])`
  - Input: `dto = { q: 'typescript', page: 1, limit: 20 }`
  - Assert: returns `{ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }`

- [x] **T-07 — SRCH-UT-03: two rows map to correct `SearchResult` shapes**
  - Mock: two rows with `{ id, title, updatedAt: new Date('2024-01-01'), headline: 'hello <mark>world</mark>', rank: 0.5, total_count: BigInt(2) }`
  - Assert: `data.length === 2`
  - Assert: `data[0].updatedAt` is an ISO 8601 string (not a Date object)
  - Assert: `meta.total === 2` (BigInt converted to number)

- [x] **T-08 — SRCH-UT-04: pagination offset calculated correctly**
  - Mock: `prisma.$queryRaw.mockResolvedValue([])` (empty is fine — we only care about the call args)
  - Input: `dto = { q: 'test', page: 2, limit: 5 }`
  - Assert: `meta.page === 2`, `meta.limit === 5`
  - Assert: `$queryRaw` was called (confirms offset logic ran without throwing)

- [x] **T-09 — SRCH-UT-05: BigInt `total_count` converts and `totalPages` computed**
  - Mock: 3 rows, each with `total_count: BigInt(7)`
  - Input: default `page=1, limit=20`
  - Assert: `meta.total === 7` (typeof number)
  - Assert: `meta.totalPages === 1` (`Math.ceil(7/20) === 1`)

- [x] **T-10 — SRCH-UT-06: valid query reaches `$queryRaw` exactly once**
  - Mock: `prisma.$queryRaw.mockResolvedValue([])`
  - Input: `dto = { q: 'hello', page: 1, limit: 20 }`
  - Assert: `prisma.$queryRaw` called exactly once (`toHaveBeenCalledTimes(1)`)

---

## Phase 5 — Integration Tests

> File: `apps/api/src/routes/__tests__/notes.routes.integration.ts` (append only — do not remove existing tests)
> Pattern: new `describe.skipIf(!DB_AVAILABLE)('GET /api/v1/notes/search', () => { ... })` block at the end of the file.
> Reuse existing `registerUser` and `createNote` helpers. For content-FTS tests, create notes with the search term in the title (the tsvector covers both title and contentText).

- [x] **T-11 — SRCH-IT-01: no auth header → 401**
  - `GET /api/v1/notes/search?q=test` with no `Authorization` header
  - Assert: `status === 401`

- [x] **T-12 — SRCH-IT-02: missing `q` param → 400 VALIDATION_ERROR**
  - `GET /api/v1/notes/search` (no query params)
  - Assert: `status === 400`, `body.error.code === 'VALIDATION_ERROR'`

- [x] **T-13 — SRCH-IT-03: whitespace-only `q` → 400 QUERY_REQUIRED**
  - `GET /api/v1/notes/search?q=%20%20` (URL-encoded spaces)
  - Assert: `status === 400`, `body.error.code === 'QUERY_REQUIRED'`

- [x] **T-14 — SRCH-IT-04: valid query, no matching notes → 200 empty**
  - Register user; search for a term not in any note
  - Assert: `status === 200`, `body.data` is `[]`, `body.meta.total === 0`

- [x] **T-15 — SRCH-IT-05: query matches note title → 200 with correct result**
  - Create note with `title: 'PostgreSQL indexing guide'`; search `q=indexing`
  - Assert: `status === 200`, `body.data.length === 1`, `body.data[0].title === 'PostgreSQL indexing guide'`, `body.data[0].id` matches the created note's ID

- [x] **T-16 — SRCH-IT-06: query matches note contentText → 200 with result**
  - Create note; update `contentText` directly via test Prisma client with a unique term; search for that term
  - Assert: `status === 200`, `body.data.length >= 1`
  - Alternative if Prisma test client unavailable: create note with title containing the unique term and rely on title FTS

- [x] **T-17 — SRCH-IT-07: matching result headline contains `<mark>` tags**
  - Create note with title containing the search term
  - Assert: `body.data[0].headline` includes `'<mark>'`

- [x] **T-18 — SRCH-IT-08: soft-deleted note excluded from results**
  - Create note with title containing the search term
  - `DELETE /api/v1/notes/:id` (soft-deletes)
  - Search for the term
  - Assert: `body.data` is `[]`

- [x] **T-19 — SRCH-IT-09: cross-user isolation — Alice's results exclude Bob's notes**
  - Register Alice and Bob
  - Bob creates a note with unique term
  - Alice searches for that term
  - Assert: `body.data` is `[]` (Alice sees nothing)

- [x] **T-20 — SRCH-IT-10: pagination — `page=1&limit=1` when 2 notes match**
  - Create 2 notes, both titles containing the search term
  - `GET /api/v1/notes/search?q=<term>&page=1&limit=1`
  - Assert: `body.data.length === 1`, `body.meta.total === 2`, `body.meta.totalPages === 2`

- [x] **T-21 — SRCH-IT-11: `updatedAt` in response is ISO 8601 string**
  - Create a matching note; search
  - Assert: `body.data[0].updatedAt` matches `/^\d{4}-\d{2}-\d{2}T/`

---

## Phase 6 — Final Quality Gates

- [x] **T-22 — All quality gates pass**
  - `pnpm -r lint` → 0 errors
  - `pnpm -r build` → 0 type errors
  - `pnpm --filter api test` → all unit tests pass; integration tests pass if `DATABASE_URL_TEST` is set
