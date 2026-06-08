# Spec Delta — AB-1005: Notes List (Pagination, Sorting, Tag Filter)

| Field | Value |
|---|---|
| Ticket | AB-1005 |
| Spec type | Delta — behavioral requirements and test scenarios |
| FRS source | §4 Notes Feature (UC-NOTE-04, BR-NOTE-11), §2 Pagination conventions |
| SDS source | §5.2 Notes Endpoints (`GET /notes`), §8 Ticket Mapping (AB-1005) |

> **Delta scope:** This spec covers `GET /notes` only. CRUD operations (`POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`) are covered in the AB-1004 spec delta. Search is covered in AB-1007.

---

## 1. Behavioral Requirements

All requirements use SHALL/MUST.

### 1.1 `GET /notes` — List Notes

| ID | Requirement |
|---|---|
| LIST-REQ-01 | The endpoint SHALL require a valid Bearer JWT (`authenticate`). Missing or invalid token → `401 UNAUTHORIZED`. |
| LIST-REQ-02 | Query parameters SHALL be validated and coerced via `validate(NoteListQuerySchema, 'query')` before the handler runs. Invalid params → `400 VALIDATION_ERROR`. |
| LIST-REQ-03 | The endpoint SHALL exclude soft-deleted notes (`deletedAt IS NOT NULL`) from all results and counts. |
| LIST-REQ-04 | The endpoint SHALL only return notes belonging to the authenticated user (`userId` from JWT). |
| LIST-REQ-05 | Default query param values: `page=1`, `limit=20`, `sortBy=updatedAt`, `sortOrder=desc`. |
| LIST-REQ-06 | `limit` SHALL not exceed 100. `limit=101` → `400 VALIDATION_ERROR`. |
| LIST-REQ-07 | On success, the endpoint SHALL return `200` with `{ data: NoteListItem[], meta: PaginationMeta }`. |

### 1.2 Pagination

| ID | Requirement |
|---|---|
| LIST-REQ-08 | `meta.total` SHALL equal the count of all non-deleted notes owned by the user that match the current filter (before pagination). |
| LIST-REQ-09 | `meta.totalPages` SHALL equal `Math.ceil(total / limit)`. When `total=0`, `totalPages=0`. |
| LIST-REQ-10 | If `page` is beyond the last page (e.g., `page=99` with only 5 notes), the endpoint SHALL return `200` with `data: []` and correct `meta` (`total` reflects actual count). |
| LIST-REQ-11 | `skip = (page - 1) * limit`. |

### 1.3 Sorting

| ID | Requirement |
|---|---|
| LIST-REQ-12 | `sortBy` accepts `createdAt`, `updatedAt`, or `title`. Default is `updatedAt`. |
| LIST-REQ-13 | `sortOrder` accepts `asc` or `desc`. Default is `desc`. |
| LIST-REQ-14 | The sort is applied via Prisma `orderBy`. Title sort is case-sensitive (PostgreSQL default collation). |

### 1.4 Tag Filtering (AND-logic)

| ID | Requirement |
|---|---|
| LIST-REQ-15 | The `tags` query param is an optional CSV string of tag CUIDs (e.g., `?tags=id1,id2`). If omitted, no tag filter is applied. |
| LIST-REQ-16 | When `tags` is provided, the service SHALL parse the CSV, split on `,`, and discard empty strings. |
| LIST-REQ-17 | For each tag ID in the parsed list, the service SHALL verify the tag exists and belongs to the authenticated user. Any mismatch (non-existent or foreign tag) → `400 INVALID_TAG`. This check is performed BEFORE the note query. |
| LIST-REQ-18 | Tag filtering uses AND-logic (BR-NOTE-11): a note is included only if it has ALL specified tags attached. |
| LIST-REQ-19 | Tag filtering is implemented via Prisma's relational AND: `{ AND: tagIds.map(id => ({ tags: { some: { tagId: id } } })) }`. |
| LIST-REQ-20 | When a valid tag filter matches zero notes, the response is `200` with `data: []` and `meta.total: 0`. |

### 1.5 `contentPreview` Computation

| ID | Requirement |
|---|---|
| LIST-REQ-21 | `contentPreview` SHALL be the first 150 characters of the note's `contentText` field. |
| LIST-REQ-22 | Truncation is a hard cut: `contentText.slice(0, 150)`. No ellipsis is appended. |
| LIST-REQ-23 | If `contentText` is `null` (no content), `contentPreview` SHALL be an empty string `''`. |
| LIST-REQ-24 | If `contentText` is 150 characters or shorter, `contentPreview` equals the full `contentText`. |

### 1.6 `NoteListItem` Response Shape

| ID | Requirement |
|---|---|
| LIST-REQ-25 | Each item in `data` SHALL conform to `NoteListItem`: `{ id, title, contentPreview, tags: TagSummary[], updatedAt }`. |
| LIST-REQ-26 | `updatedAt` SHALL be serialized as an ISO 8601 string. |
| LIST-REQ-27 | `tags` SHALL list all tags currently attached to the note, each as `{ id, name, color }`. |

### 1.7 Service Layer Constraints

| ID | Requirement |
|---|---|
| LIST-REQ-28 | The `list` function signature SHALL be `list(userId: string, query: z.infer<typeof NoteListQuerySchema>): Promise<{ data: NoteListItem[]; meta: PaginationMeta }>`. |
| LIST-REQ-29 | Count and findMany SHALL execute in the same `prisma.$transaction([...])` to guarantee a consistent snapshot. |
| LIST-REQ-30 | `userId` MUST come from `req.user.id` at the route layer. The `tags` query param contains tag IDs, not a user ID — never trust query param user identification. |

---

## 2. Test Scenarios

### 2.1 Unit Tests — additions to `notes.service.test.ts`

> Same Prisma mock setup as AB-1004. Additional mocks needed:
> - `prisma.$transaction` mock must handle array form: `vi.fn(async (ops) => Promise.all(ops))`
>
> The default `$transaction` mock from AB-1004 uses the callback form. A new `mockImplementationOnce` override is needed per test for the array form.

**`list` tests:**

| Test ID | Scenario | Expected |
|---|---|---|
| `LIST-UT-01` | Happy path — no tags filter, default pagination | `$transaction` called with `[count, findMany]`; returns `{ data: NoteListItem[], meta: { total, page:1, limit:20, totalPages } }` |
| `LIST-UT-02` | `tags` CSV with all owned tags | `tag.findMany` called to validate; `note.findMany` called with `AND` conditions |
| `LIST-UT-03` | `tags` CSV contains a foreign tag ID | `tag.findMany` returns fewer records; throws `AppError` with `code: 'INVALID_TAG'`, `statusCode: 400` |
| `LIST-UT-04` | `contentText` is `null` | `contentPreview` in result is `''` |
| `LIST-UT-05` | `contentText` is longer than 150 chars | `contentPreview` is exactly 150 chars (hard cut) |
| `LIST-UT-06` | `sortBy: 'title'`, `sortOrder: 'asc'` | `note.findMany` called with `orderBy: { title: 'asc' }` |
| `LIST-UT-07` | `page=2`, `limit=5` | `note.findMany` called with `skip: 5`, `take: 5` |
| `LIST-UT-08` | `total=0` | Returns `meta: { total:0, totalPages:0 }` with `data: []` |
| `LIST-UT-09` | No `tags` param | `tag.findMany` (validation) NOT called; `where` has no `AND` key |

### 2.2 Integration Tests — additions to `notes.routes.integration.ts`

> Same `describe.skipIf(!DB_AVAILABLE)` pattern. Existing `registerUser` and `createNote` helpers are reused.

**`GET /api/v1/notes`:**

| Test ID | Scenario | Expected |
|---|---|---|
| `LIST-IT-01` | No auth header | `401` |
| `LIST-IT-02` | Auth, no notes → empty list | `200`; `data: []`; `meta.total: 0`; `meta.totalPages: 0` |
| `LIST-IT-03` | Auth, one note → list contains one item with correct shape | `200`; `data[0]` has `id`, `title`, `contentPreview`, `tags`, `updatedAt` |
| `LIST-IT-04` | Auth, `contentText` longer than 150 chars → `contentPreview` truncated | `200`; `data[0].contentPreview.length === 150` |
| `LIST-IT-05` | Auth, two users — each sees only own notes | Alice's GET returns only Alice's notes; Bob's GET returns only Bob's notes |
| `LIST-IT-06` | `limit=1`, two notes → `meta.totalPages: 2` | `200`; `data.length === 1`; `meta.total: 2`; `meta.totalPages: 2` |
| `LIST-IT-07` | `page=2`, `limit=1`, two notes → second note returned | `200`; `data[0].id` equals the second note's ID |
| `LIST-IT-08` | `page=99` (out of range) → empty data, correct meta | `200`; `data: []`; `meta.total: 2` (reflects actual count) |
| `LIST-IT-09` | `sortBy=title&sortOrder=asc`, two notes with different titles | `200`; `data[0].title` is alphabetically first |
| `LIST-IT-10` | `tags=id1` filter — note with that tag returned, note without excluded | `200`; `data` contains only the tagged note |
| `LIST-IT-11` | `tags=id1,id2` AND filter — only note with BOTH tags returned | `200`; note missing one tag is excluded |
| `LIST-IT-12` | `tags=` contains a foreign tag ID → `400 INVALID_TAG` | `400`; `error.code: 'INVALID_TAG'` |
| `LIST-IT-13` | `limit=101` → `400 VALIDATION_ERROR` | `400`; `error.code: 'VALIDATION_ERROR'` |
| `LIST-IT-14` | Soft-deleted note excluded from list | `200`; deleted note not in `data`; `meta.total` excludes it |

---

## 3. Acceptance Criteria (FRS mapping)

| FRS / UC ID | Acceptance Criterion | Test IDs |
|---|---|---|
| UC-NOTE-04 | List notes with sort and pagination | LIST-IT-06, LIST-IT-07, LIST-IT-09 |
| UC-NOTE-04 | Page out of range → 200 empty (not 404) | LIST-IT-08 |
| BR-NOTE-11 | Tag filter uses AND-logic | LIST-IT-11 |
| BR-NOTE-06 | Soft-deleted notes excluded | LIST-IT-14 |
| API convention | Only owner's notes returned | LIST-IT-05 |
| API convention | `{ data, meta }` response shape | LIST-IT-03 |
| API convention | `limit` max 100 | LIST-IT-13 |
| AGENTS.md | `userId` from JWT, never query param | LIST-REQ-30 |
| AGENTS.md | Cross-user tags → 400 (not 404) | LIST-IT-12 |

---

## 4. Error Code Reference

| Code | Status | Trigger |
|---|---|---|
| `INVALID_TAG` | 400 | Any tag ID in the `tags` CSV does not exist or belongs to another user |
| `VALIDATION_ERROR` | 400 | Zod parse failure on query params (e.g., `limit > 100`, invalid `sortBy` value) |
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer JWT |
