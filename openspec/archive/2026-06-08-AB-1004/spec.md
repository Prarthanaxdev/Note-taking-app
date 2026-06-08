# Spec Delta — AB-1004: Notes CRUD + FTS Migration

| Field | Value |
|---|---|
| Ticket | AB-1004 |
| Spec type | Delta — behavioral requirements and test scenarios |
| FRS source | §4 Notes Feature (UC-NOTE-01 through UC-NOTE-03, BR-NOTE-01 through BR-NOTE-07, BR-NOTE-11), §8 Version History (BR-VER-06 partial) |
| SDS source | §3.4 Note Table (tsvector migration), §4.4 Notes Service, §5.2 Notes Endpoints, §8 Ticket Mapping (AB-1004) |

> **Delta scope:** This spec covers the four core Notes CRUD endpoints and the FTS migration.
> `GET /notes` (list/pagination/filtering) is covered in the AB-1005 spec delta.
> Search, shares, and version endpoints are covered in AB-1007, AB-1008, and AB-1009 respectively.

---

## 1. Behavioral Requirements

All requirements use SHALL/MUST.

### 1.1 FTS Migration

| ID | Requirement |
|---|---|
| NOTE-REQ-01 | A second Prisma migration directory SHALL exist at `apps/api/prisma/migrations/20260608000001_fts_tsvector/` after this ticket. |
| NOTE-REQ-02 | The migration SQL SHALL add a `ts` column of type `tsvector` to the `"Note"` table using `GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') \|\| ' ' \|\| coalesce("contentText",''))) STORED`. |
| NOTE-REQ-03 | The migration SQL SHALL create a GIN index `note_ts_gin` on the `ts` column. |
| NOTE-REQ-04 | The migration MUST be idempotent — use `ADD COLUMN IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`. |
| NOTE-REQ-05 | After the migration is applied, an `INSERT` to `"Note"` with a `title` and `contentText` MUST result in a populated `ts` column without any application-level write. |

### 1.2 `POST /notes` — Create Note

| ID | Requirement |
|---|---|
| NOTE-REQ-06 | The endpoint SHALL require a valid Bearer JWT (`authMiddleware`). Missing or invalid token → `401 UNAUTHORIZED`. |
| NOTE-REQ-07 | The request body SHALL be validated against `CreateNoteSchema` from `packages/shared` via `validateMiddleware`. |
| NOTE-REQ-08 | `title` is required and must be 1–255 characters. Empty or missing title → `400`. |
| NOTE-REQ-09 | `content` is optional TipTap JSON. If omitted, the note's `content` column is set to `NULL` and `contentText` is set to `''`. |
| NOTE-REQ-10 | `tagIds` is an optional array of CUIDs with a maximum of 5 elements. If `tagIds.length > 5`, the service SHALL throw `400 TOO_MANY_TAGS`. |
| NOTE-REQ-11 | For each `tagId` in `tagIds`, the service SHALL verify the tag exists and belongs to the authenticated user. Any mismatch → `400 INVALID_TAG`. |
| NOTE-REQ-12 | The `userId` on the created note MUST be taken from `req.user.id` (JWT). `req.body.userId` MUST NOT be used. |
| NOTE-REQ-13 | On success, the endpoint SHALL return `201` with a `NoteDetail` object including `id`, `title`, `content`, `tags` (array of `TagSummary`), `shareLinksCount`, `createdAt`, `updatedAt`. |
| NOTE-REQ-14 | `shareLinksCount` on a newly created note SHALL be `0`. |
| NOTE-REQ-15 | `contentText` SHALL be extracted from the TipTap JSON by recursively collecting all `{ type: 'text', text: '...' }` leaf nodes. |

### 1.3 `GET /notes/:id` — Get Note by ID

| ID | Requirement |
|---|---|
| NOTE-REQ-16 | The endpoint SHALL require a valid Bearer JWT. Missing or invalid token → `401 UNAUTHORIZED`. |
| NOTE-REQ-17 | If no note exists with the given `id` belonging to the authenticated user with `deletedAt IS NULL`, the service SHALL throw `404 NOT_FOUND`. This applies to: non-existent IDs, IDs belonging to a different user, and soft-deleted notes. |
| NOTE-REQ-18 | The response SHALL never return `403` for cross-user access — always `404` (prevents enumeration). |
| NOTE-REQ-19 | On success, the endpoint SHALL return `200` with a `NoteDetail` object (same shape as create response). |

### 1.4 `PATCH /notes/:id` — Update Note

| ID | Requirement |
|---|---|
| NOTE-REQ-20 | The endpoint SHALL require a valid Bearer JWT. Missing or invalid token → `401 UNAUTHORIZED`. |
| NOTE-REQ-21 | The request body SHALL be validated against `UpdateNoteSchema` (all fields optional). |
| NOTE-REQ-22 | The service SHALL first verify note ownership and existence (`findFirst({ id, userId, deletedAt: null })`). If null → `404 NOT_FOUND`. |
| NOTE-REQ-23 | If `title` is provided and is an empty or whitespace-only string, the service SHALL throw `400 TITLE_REQUIRED`. |
| NOTE-REQ-24 | If `tagIds` is provided and exceeds 5 elements → `400 TOO_MANY_TAGS`. If any tag is foreign → `400 INVALID_TAG`. |
| NOTE-REQ-25 | The service SHALL execute the following operations inside a single `prisma.$transaction`: (a) create a `NoteVersion` snapshot of the note's pre-update `title` and `content`; (b) if `tagIds` is defined, delete all existing `NoteTag` rows for the note and create new ones; (c) apply changes to the `Note` row; (d) auto-purge oldest versions if count exceeds 50. |
| NOTE-REQ-26 | The version snapshot MUST capture the state BEFORE the update is applied (old `title`, old `content`). |
| NOTE-REQ-27 | `tagIds` update uses full-replacement semantics: `undefined` = no change, `[]` = remove all tags, `['id1']` = set exactly to `['id1']`. |
| NOTE-REQ-28 | If `content` is changed, `contentText` SHALL be re-extracted from the new TipTap JSON within the same transaction. The `tsvector` column updates automatically via PostgreSQL's generated column mechanism. |
| NOTE-REQ-29 | Auto-purge: if the note has more than 50 `NoteVersion` rows AFTER the new snapshot is created, the oldest versions (by `savedAt ASC`) exceeding 50 SHALL be deleted in the same transaction. |
| NOTE-REQ-30 | On success, the endpoint SHALL return `200` with the updated `NoteDetail` (re-fetched after the transaction with full includes). |

### 1.5 `DELETE /notes/:id` — Soft Delete Note

| ID | Requirement |
|---|---|
| NOTE-REQ-31 | The endpoint SHALL require a valid Bearer JWT. Missing or invalid token → `401 UNAUTHORIZED`. |
| NOTE-REQ-32 | The service SHALL verify ownership + existence (`findFirst({ id, userId, deletedAt: null })`). If null → `404 NOT_FOUND`. This means both a non-existent note and an already-soft-deleted note return `404`. |
| NOTE-REQ-33 | The service SHALL set `deletedAt = now()` on the `Note` row. MUST NOT physically delete the row. |
| NOTE-REQ-34 | On success, the endpoint SHALL return `204 No Content` with an empty body. |
| NOTE-REQ-35 | After soft deletion, `GET /notes/:id` for the same note SHALL return `404`. |
| NOTE-REQ-36 | The physical row MUST still exist in the database after soft deletion (verifiable via direct DB query). |

### 1.6 `notes.service.ts` — Cross-Cutting Constraints

| ID | Requirement |
|---|---|
| NOTE-REQ-37 | Every service function signature SHALL accept `userId: string` as its first parameter. This value MUST originate from `req.user!.id` at the route layer. |
| NOTE-REQ-38 | Every multi-table mutation (`update`) SHALL use `prisma.$transaction()`. Single-table operations (`create`, `softDelete`) may use a standard Prisma call. |
| NOTE-REQ-39 | `contentText` extraction SHALL handle `null` and `undefined` content gracefully, returning `''`. |
| NOTE-REQ-40 | The `toNoteDetail` mapping function SHALL serialize `createdAt` and `updatedAt` as ISO 8601 strings. |

---

## 2. Test Scenarios

### 2.1 Unit Tests — `notes.service.test.ts`

> Uses mocked Prisma client. Prisma mock structure:
> ```typescript
> vi.mock('../../lib/prisma.js', () => ({
>   prisma: {
>     note: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
>     tag: { findMany: vi.fn() },
>     noteTag: { deleteMany: vi.fn(), createMany: vi.fn() },
>     noteVersion: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
>     $transaction: vi.fn(),
>   }
> }))
> ```
> `$transaction` mock should execute the callback synchronously with the same mock `tx` object.

**`create` tests:**

| Test ID | Scenario | Expected |
|---|---|---|
| `NOTE-UT-01` | Happy path — no `tagIds` | `prisma.note.create` called with `userId`, `title`, `contentText`, empty `tags.create`; returns `NoteDetail` with `shareLinksCount: 0` |
| `NOTE-UT-02` | Happy path — valid `tagIds` (2 tags, all owned) | Tag `findMany` returns 2 matching records; `note.create` called with `tags.create` containing both tagIds |
| `NOTE-UT-03` | `tagIds.length > 5` | Throws `AppError` with `code: 'TOO_MANY_TAGS'`, `statusCode: 400`; `prisma.note.create` MUST NOT be called |
| `NOTE-UT-04` | One `tagId` belongs to a different user | `prisma.tag.findMany` returns fewer records than `tagIds.length`; throws `AppError` with `code: 'INVALID_TAG'`, `statusCode: 400` |
| `NOTE-UT-05` | `content` provided — `contentText` extraction | `prisma.note.create` called with `contentText` equal to the extracted plain text from the mock TipTap JSON |
| `NOTE-UT-06` | `content` is `undefined` | `prisma.note.create` called with `contentText: ''` |

**`getById` tests:**

| Test ID | Scenario | Expected |
|---|---|---|
| `NOTE-UT-07` | Note exists, same user | `findFirst` called with `{ id, userId, deletedAt: null }`; returns mapped `NoteDetail` |
| `NOTE-UT-08` | `findFirst` returns `null` (note doesn't exist) | Throws `AppError` with `code: 'NOT_FOUND'`, `statusCode: 404` |
| `NOTE-UT-09` | `findFirst` returns `null` (simulating deleted/foreign note) | Same as NOTE-UT-08 — `findFirst` null always → 404 |

**`update` tests:**

| Test ID | Scenario | Expected |
|---|---|---|
| `NOTE-UT-10` | Note not found (`findFirst` returns `null`) | Throws `AppError` with `code: 'NOT_FOUND'`, `statusCode: 404`; `$transaction` MUST NOT be called |
| `NOTE-UT-11` | Title only — happy path | `$transaction` called; `noteVersion.create` called with OLD title/content; `note.update` called with new title |
| `NOTE-UT-12` | Content only — `contentText` regenerated | `note.update` called with new `content` AND new `contentText` derived from it |
| `NOTE-UT-13` | `tagIds: undefined` — tags unchanged | `noteTag.deleteMany` and `noteTag.createMany` MUST NOT be called |
| `NOTE-UT-14` | `tagIds: []` — remove all tags | `noteTag.deleteMany` called with `{ noteId }`; `noteTag.createMany` MUST NOT be called |
| `NOTE-UT-15` | `tagIds: ['id1', 'id2']` — replace tags | `noteTag.deleteMany` then `noteTag.createMany` with `[{ noteId, tagId: 'id1' }, { noteId, tagId: 'id2' }]` |
| `NOTE-UT-16` | Cross-user `tagId` | Throws `AppError` with `code: 'INVALID_TAG'`; `$transaction` MUST NOT be called |
| `NOTE-UT-17` | Snapshot uses PRE-UPDATE values | `noteVersion.create` called with `current.title` and `current.content` (not the updated values) |
| `NOTE-UT-18` | `noteVersion.findMany` returns 51 versions after snapshot | `noteVersion.deleteMany` called with the 1 oldest version's id; 50 remain |
| `NOTE-UT-19` | `noteVersion.findMany` returns exactly 50 versions | `noteVersion.deleteMany` MUST NOT be called |
| `NOTE-UT-20` | `title` provided as whitespace string | Throws `AppError` with `code: 'TITLE_REQUIRED'`, `statusCode: 400` |

**`softDelete` tests:**

| Test ID | Scenario | Expected |
|---|---|---|
| `NOTE-UT-21` | Happy path | `prisma.note.update` called with `{ deletedAt: any Date }`; function resolves `void` |
| `NOTE-UT-22` | `findFirst` returns `null` (note not found) | Throws `AppError` with `code: 'NOT_FOUND'`, `statusCode: 404`; `note.update` MUST NOT be called |
| `NOTE-UT-23` | `findFirst` returns `null` (simulating already-deleted note) | Same as NOTE-UT-22 |

### 2.2 Integration Tests — `notes.routes.integration.ts`

> Requires `nta_test` DB with BOTH migrations applied (`20260608000000_init` + `20260608000001_fts_tsvector`).
> `beforeEach` truncates `"Note"`, `"Tag"`, `"NoteTag"`, `"NoteVersion"`, `"User"` in correct FK order.
> A `testUser` + valid access token is created in `beforeEach`.

**Helper needed:**
```typescript
async function createTestUser() {
  const res = await request(app)
    .post(`${BASE}/auth/register`)
    .send({ email: 'test@example.com', password: 'password123' });
  return { userId: res.body.user.id, token: res.body.accessToken };
}
```

**`POST /api/v1/notes`:**

| Test ID | Scenario | Expected |
|---|---|---|
| `NOTE-IT-01` | No auth header | `401 UNAUTHORIZED` |
| `NOTE-IT-02` | Valid request, no tags | `201`; response has `id`, `title`, `content: null`, `tags: []`, `shareLinksCount: 0`, `createdAt`, `updatedAt` |
| `NOTE-IT-03` | Valid request, valid `tagIds` (tag created for same user) | `201`; `tags` array contains the TagSummary for the created tag |
| `NOTE-IT-04` | Missing `title` field | `400 VALIDATION_ERROR` |
| `NOTE-IT-05` | `tagIds` contains a tag from a different user | `400 INVALID_TAG` |
| `NOTE-IT-06` | Note created → `ts` column is populated (direct DB query) | `SELECT ts FROM "Note" WHERE id = $1` returns a non-null value |

**`GET /api/v1/notes/:id`:**

| Test ID | Scenario | Expected |
|---|---|---|
| `NOTE-IT-07` | No auth header | `401 UNAUTHORIZED` |
| `NOTE-IT-08` | Valid auth, own note | `200`; response matches `NoteDetail` shape |
| `NOTE-IT-09` | Valid auth, note belongs to a different user | `404 NOT_FOUND` |
| `NOTE-IT-10` | Note has been soft-deleted | `404 NOT_FOUND` |
| `NOTE-IT-11` | Non-existent ID | `404 NOT_FOUND` |

**`PATCH /api/v1/notes/:id`:**

| Test ID | Scenario | Expected |
|---|---|---|
| `NOTE-IT-12` | No auth header | `401 UNAUTHORIZED` |
| `NOTE-IT-13` | Update `title` only | `200`; response has updated `title`; `updatedAt` is after the create timestamp |
| `NOTE-IT-14` | Update `content` — `contentText` regenerated | Direct DB query: `contentText` matches extracted text from new content |
| `NOTE-IT-15` | Note not owned by requester | `404 NOT_FOUND` |
| `NOTE-IT-16` | Version snapshot created in DB after update | `SELECT COUNT(*) FROM "NoteVersion" WHERE "noteId" = $1` returns `1` after one PATCH |
| `NOTE-IT-17` | Replace tags via `tagIds` | `200`; response `tags` reflects the new tag set; old tags absent |
| `NOTE-IT-18` | `tagIds: []` removes all tags | `200`; `tags: []` in response |

**`DELETE /api/v1/notes/:id`:**

| Test ID | Scenario | Expected |
|---|---|---|
| `NOTE-IT-19` | No auth header | `401 UNAUTHORIZED` |
| `NOTE-IT-20` | Valid auth, own note | `204 No Content` with empty body |
| `NOTE-IT-21` | Note not owned by requester | `404 NOT_FOUND` |
| `NOTE-IT-22` | Soft-deleted note → subsequent GET returns 404 | After DELETE 204, `GET /notes/:id` → `404` |
| `NOTE-IT-23` | Physical row retained after soft delete | Direct DB query: `SELECT deletedAt FROM "Note" WHERE id = $1` returns a non-null timestamp; row exists |
| `NOTE-IT-24` | Attempt to DELETE an already-soft-deleted note | `404 NOT_FOUND` |

---

## 3. Acceptance Criteria (FRS mapping)

| FRS / UC ID | Acceptance Criterion | Test IDs |
|---|---|---|
| UC-NOTE-01 | Create note → 201 with tags included | NOTE-IT-02, NOTE-IT-03 |
| UC-NOTE-01 Alt A | Missing title → 400 | NOTE-IT-04 |
| UC-NOTE-01 Alt B/C | Invalid/excess tags → 400 TOO_MANY_TAGS / INVALID_TAG | NOTE-UT-03, NOTE-UT-04, NOTE-IT-05 |
| BR-NOTE-01 | Title required, max 255 | NOTE-IT-04, NOTE-UT-20 |
| BR-NOTE-02 | Only note owner can edit/delete | NOTE-IT-15, NOTE-IT-21 |
| BR-NOTE-03 | Max 5 tags | NOTE-UT-03 |
| BR-NOTE-04 | Tags must belong to same user | NOTE-UT-04, NOTE-IT-05 |
| UC-NOTE-02 | Edit note → 200, version snapshot created | NOTE-IT-13, NOTE-IT-16 |
| BR-NOTE-07 | Version snapshot in same transaction as update | NOTE-UT-17, NOTE-IT-16 |
| BR-VER-06 | Auto-purge beyond 50 versions | NOTE-UT-18, NOTE-UT-19 |
| UC-NOTE-03 | Soft delete → 204; note hidden from subsequent GET | NOTE-IT-20, NOTE-IT-22 |
| BR-NOTE-06 | Soft-deleted notes excluded from detail endpoint | NOTE-IT-10, NOTE-IT-22 |
| FRS §11 | Physical row retained 30 days | NOTE-IT-23 |
| FRS §11 | Cross-user access → 404, not 403 | NOTE-IT-09, NOTE-IT-15, NOTE-IT-21 |
| SDS §3.4 | `ts` column populated after insert | NOTE-IT-06 |

---

## 4. Error Code Reference

All codes below already exist in `packages/shared/src/types/errors.types.ts`:

| Code | Status | Trigger |
|---|---|---|
| `TITLE_REQUIRED` | 400 | `update` called with empty/whitespace title (service-layer defense) |
| `TOO_MANY_TAGS` | 400 | More than 5 tagIds submitted in create or update |
| `INVALID_TAG` | 400 | Any tagId in the request belongs to a different user |
| `NOT_FOUND` | 404 | Note doesn't exist, belongs to another user, or is soft-deleted |
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer JWT |
| `VALIDATION_ERROR` | 400 | Zod schema parse failure (e.g., missing title, non-CUID tagId) |
