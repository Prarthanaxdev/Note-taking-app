# Spec Delta — AB-1007: Full-Text Search

| Field | Value |
|---|---|
| Ticket | AB-1007 |
| Spec type | Delta — behavioral requirements and test scenarios |
| FRS source | §6 Full-Text Search Feature (UC-SRCH-01, BR-SRCH-01 through BR-SRCH-07) |
| SDS source | §4.5 Search Service, §5.2 Notes Endpoints — Search, §5.3 SearchResult shape |

---

## 1. Behavioral Requirements

### 1.1 Shared Schema Change

| ID | Requirement |
|---|---|
| SRCH-REQ-01 | `SearchQuerySchema.q` SHALL use `.trim()` instead of `.min(1)`. Whitespace-only input trims to `""` and is handled by a service-level `QUERY_REQUIRED` guard rather than Zod's `VALIDATION_ERROR`. |
| SRCH-REQ-02 | A missing `q` query parameter SHALL still return `400 VALIDATION_ERROR` (Zod Required failure for an absent field — correct behavior unchanged). |

### 1.2 `GET /notes/search` — Full-Text Search

| ID | Requirement |
|---|---|
| SRCH-REQ-03 | The endpoint SHALL require a valid Bearer JWT. Missing or invalid token → `401 UNAUTHORIZED`. |
| SRCH-REQ-04 | The endpoint SHALL be registered in `notes.routes.ts` at path `/search`, **before** the `GET /:id` route. |
| SRCH-REQ-05 | Query parameters SHALL be validated against `SearchQuerySchema` using `validate(SearchQuerySchema, 'query')`. |
| SRCH-REQ-06 | If `q` is empty or whitespace-only (trimmed to `""`), the service SHALL throw `AppError('QUERY_REQUIRED', 'Search query is required.', 400)`. |
| SRCH-REQ-07 | The service SHALL query only the authenticated user's notes (`WHERE n."userId" = ${userId}`). Cross-user notes SHALL never appear in results (BR-SRCH-01). |
| SRCH-REQ-08 | The service SHALL exclude soft-deleted notes (`AND n."deletedAt" IS NULL`) (BR-SRCH-01). |
| SRCH-REQ-09 | The FTS query SHALL use `plainto_tsquery('english', ${q})` — NEVER `to_tsquery()`. This sanitizes operator characters in user input (BR-SRCH-06, AGENTS.md constraint). |
| SRCH-REQ-10 | The query SHALL be executed via `prisma.$queryRaw` tagged template literal. String interpolation SHALL NOT be used (AGENTS.md constraint). |
| SRCH-REQ-11 | `ts_headline` SHALL use `COALESCE(n."contentText", '')` as the document argument. Options: `'StartSel=<mark>, StopSel=</mark>, MaxWords=40, MinWords=20'` (BR-SRCH-04, BR-SRCH-05). |
| SRCH-REQ-12 | Results SHALL be ordered by `ts_rank` descending (BR-SRCH-03). |
| SRCH-REQ-13 | Total count SHALL be obtained via `COUNT(*) OVER()` window function in the same query — single DB round-trip. |
| SRCH-REQ-14 | The raw `total_count` column returned by PostgreSQL is a `bigint`. The service SHALL convert it to `number` via `Number(rows[0].total_count)`. |
| SRCH-REQ-15 | The raw `updatedAt` column is a `Date` object. The service SHALL call `.toISOString()` when constructing the `SearchResult` objects. |
| SRCH-REQ-16 | On success, return `200` with `{ data: SearchResult[], meta: PaginationMeta }`. |
| SRCH-REQ-17 | If no notes match, return `200` with `{ data: [], meta: { total: 0, page, limit, totalPages: 0 } }`. |
| SRCH-REQ-18 | `SearchResult` shape: `{ id: string, title: string, headline: string, updatedAt: string }`. No extra fields. |
| SRCH-REQ-19 | Pagination defaults: `page=1`, `limit=20`, `max=100` — enforced by `SearchQuerySchema` (already defined with `default(1)`, `default(20)`, `max(100)`). |

### 1.3 Cross-Cutting Constraints

| ID | Requirement |
|---|---|
| SRCH-REQ-20 | `userId` is always sourced from `req.user.id` at the route layer — never from query params or body. |
| SRCH-REQ-21 | Authorization is enforced in the service layer via the `WHERE` clause — not at the route layer. |

---

## 2. Test Scenarios

### 2.1 Unit Tests — `search.service.test.ts`

> Mock `../../lib/prisma.js` with `prisma.$queryRaw: vi.fn()`.

| Test ID | Scenario | Expected |
|---|---|---|
| `SRCH-UT-01` | `q` is empty string `""` | Throws `AppError('QUERY_REQUIRED', ..., 400)`; `$queryRaw` NOT called |
| `SRCH-UT-02` | No rows returned (`$queryRaw` returns `[]`) | Returns `{ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }` |
| `SRCH-UT-03` | Two rows returned with valid shape | Returns `data` array of 2 `SearchResult` objects; `updatedAt` is ISO string; `total_count` BigInt → `number` |
| `SRCH-UT-04` | `page=2, limit=5` | `$queryRaw` called with `LIMIT 5 OFFSET 5`; `meta.page === 2`, `meta.limit === 5` |
| `SRCH-UT-05` | `total_count` is `BigInt(7)`, 3 rows returned | `meta.total === 7`, `meta.totalPages === Math.ceil(7/20)` |
| `SRCH-UT-06` | Valid query | `$queryRaw` template includes `userId`, `q` as placeholders (no string interpolation) |

### 2.2 Integration Tests — appended to `notes.routes.integration.ts`

> Same `describe.skipIf(!DB_AVAILABLE)` pattern. Reuses existing `registerUser` and `createNote` helpers.

| Test ID | Scenario | Expected |
|---|---|---|
| `SRCH-IT-01` | No auth → `GET /notes/search?q=test` | `401` |
| `SRCH-IT-02` | Missing `q` param → `GET /notes/search` | `400 VALIDATION_ERROR` |
| `SRCH-IT-03` | Whitespace-only `q` → `GET /notes/search?q=%20%20` | `400 QUERY_REQUIRED` |
| `SRCH-IT-04` | Valid query, no matching notes | `200`, `data: []`, `meta.total: 0` |
| `SRCH-IT-05` | Query matches note title | `200`, `data` has 1 result with correct `id` and `title` |
| `SRCH-IT-06` | Query matches note contentText | `200`, `data` has 1 result |
| `SRCH-IT-07` | Matching result contains `<mark>` tags in `headline` | `res.body.data[0].headline` includes `<mark>` |
| `SRCH-IT-08` | Soft-deleted note is excluded from results | Create note, delete note, search → `data: []` |
| `SRCH-IT-09` | Cross-user isolation — Alice's search returns only Alice's notes | Bob has a note matching the query; Alice's search returns no results |
| `SRCH-IT-10` | Pagination — `page=1&limit=1` when 2 notes match | `data` has 1 result; `meta.total === 2`, `meta.totalPages === 2` |
| `SRCH-IT-11` | `updatedAt` in response is ISO 8601 string | `res.body.data[0].updatedAt` matches `/^\d{4}-\d{2}-\d{2}T/` |

---

## 3. Acceptance Criteria (FRS mapping)

| FRS / UC ID | Acceptance Criterion | Test IDs |
|---|---|---|
| UC-SRCH-01 Main | Search returns results ordered by rank; headline has `<mark>` tags | SRCH-IT-05, SRCH-IT-06, SRCH-IT-07 |
| UC-SRCH-01 Alt A | No results → `200 []` | SRCH-IT-04 |
| UC-SRCH-01 Alt B | Empty query → `400 QUERY_REQUIRED` | SRCH-IT-03, SRCH-UT-01 |
| UC-SRCH-01 Alt C | Input sanitized via `plainto_tsquery` | SRCH-REQ-09 (enforced structurally) |
| BR-SRCH-01 | User-scoped, non-deleted only | SRCH-IT-08, SRCH-IT-09 |
| BR-SRCH-03 | Ordered by `ts_rank` DESC | SRCH-REQ-12 |
| BR-SRCH-04 | `<mark>` tags in headline | SRCH-IT-07, SRCH-REQ-11 |
| BR-SRCH-05 | Headline from `contentText`, not TipTap JSON | SRCH-REQ-11 (`COALESCE(n."contentText", '')`) |
| BR-SRCH-06 | Empty/whitespace → `QUERY_REQUIRED` | SRCH-IT-03, SRCH-UT-01 |
| BR-SRCH-07 | Pagination matches notes list structure | SRCH-IT-10, SRCH-REQ-16 |
| AGENTS.md | `userId` from JWT only | SRCH-REQ-20 |
| AGENTS.md | `plainto_tsquery` only | SRCH-REQ-09 |
| AGENTS.md | Tagged template literals only | SRCH-REQ-10 |

---

## 4. Error Code Reference

| Code | Status | Trigger |
|---|---|---|
| `QUERY_REQUIRED` | 400 | Empty or whitespace-only `q` (after trim) |
| `VALIDATION_ERROR` | 400 | Missing `q` param entirely; invalid `page`/`limit` |
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer JWT |
