# Spec Delta — AB-1006: Tags CRUD

| Field | Value |
|---|---|
| Ticket | AB-1006 |
| Spec type | Delta — behavioral requirements and test scenarios |
| FRS source | §5 Tags Feature (UC-TAG-01, UC-TAG-02, BR-TAG-01 through BR-TAG-06) |
| SDS source | §5.4 Tag Endpoints, §3.5 Tag DB Schema, §8 Ticket Mapping (AB-1006) |

---

## 1. Behavioral Requirements

### 1.1 Shared Package Changes

| ID | Requirement |
|---|---|
| TAG-REQ-01 | `packages/shared/src/types/api.types.ts` SHALL export `TagWithCount = TagSummary & { noteCount: number }`. |
| TAG-REQ-02 | `packages/shared/src/schemas/tags.schemas.ts` SHALL add `.trim()` to the `name` field in `CreateTagSchema` so leading/trailing whitespace is stripped before min(1) validation. |
| TAG-REQ-03 | `UpdateTagSchema` SHALL allow `color: null` (to unset an existing color) in addition to `color: string` (to set) and omitted `color` (to leave unchanged). The schema SHALL use `.optional().nullable()` on the color field. |
| TAG-REQ-04 | `CreateTagSchema` SHALL NOT accept `color: null` — color is either a valid hex string or absent. |

### 1.2 `GET /tags` — List Tags

| ID | Requirement |
|---|---|
| TAG-REQ-05 | The endpoint SHALL require a valid Bearer JWT. Missing or invalid token → `401 UNAUTHORIZED`. |
| TAG-REQ-06 | The response SHALL be `200` with a JSON array of `TagWithCount` objects (`{ id, name, color, noteCount }`). |
| TAG-REQ-07 | The array SHALL include ALL tags belonging to the authenticated user, ordered by `createdAt ASC`. |
| TAG-REQ-08 | `noteCount` SHALL equal the number of active (non-soft-deleted) notes currently tagged with that tag, for the tag's owner. Soft-deleted notes MUST NOT be counted (BR-TAG-05). |
| TAG-REQ-09 | `noteCount` SHALL be computed via Prisma's filtered `_count.notes` with `where: { note: { deletedAt: null } }`. |
| TAG-REQ-10 | Tags belonging to other users SHALL NOT appear in the response. The query is scoped by `userId` from JWT. |
| TAG-REQ-11 | If the user has no tags, the response SHALL be `200` with an empty array `[]`. |

### 1.3 `POST /tags` — Create Tag

| ID | Requirement |
|---|---|
| TAG-REQ-12 | The endpoint SHALL require a valid Bearer JWT → `401` if missing or invalid. |
| TAG-REQ-13 | The request body SHALL be validated against `CreateTagSchema`. Invalid input → `400 VALIDATION_ERROR`. |
| TAG-REQ-14 | `name` is required, 1–50 characters after trimming. Empty or whitespace-only name → `400 VALIDATION_ERROR`. |
| TAG-REQ-15 | `color` is optional. If provided, it MUST match `^#[0-9A-Fa-f]{6}$`. Invalid format → `400 VALIDATION_ERROR`. |
| TAG-REQ-16 | The service SHALL check name uniqueness case-insensitively against the authenticated user's existing tags (BR-TAG-01). If a tag with the same name already exists (case-insensitive), throw `409 TAG_NAME_TAKEN`. |
| TAG-REQ-17 | The `userId` on the created tag MUST come from `req.user.id`. `req.body.userId` MUST NOT be used. |
| TAG-REQ-18 | On success, return `201` with a `TagSummary` object (`{ id, name, color }`). |

### 1.4 `PATCH /tags/:id` — Update Tag

| ID | Requirement |
|---|---|
| TAG-REQ-19 | The endpoint SHALL require a valid Bearer JWT → `401`. |
| TAG-REQ-20 | The request body SHALL be validated against `UpdateTagSchema`. All fields optional. Invalid input → `400 VALIDATION_ERROR`. |
| TAG-REQ-21 | The service SHALL verify the tag exists and belongs to the authenticated user (`findFirst({ id, userId })`). If null → `404 NOT_FOUND`. |
| TAG-REQ-22 | If `name` is provided, the service SHALL check case-insensitive uniqueness against the user's other tags (excluding the tag being updated). Conflict → `409 TAG_NAME_TAKEN`. |
| TAG-REQ-23 | `color` field semantics in PATCH: `undefined` (field absent) = leave color unchanged; `null` = set `color` to `NULL` in DB (unset); `"#RRGGBB"` = set to that value. |
| TAG-REQ-24 | On success, return `200` with the updated `TagSummary` (`{ id, name, color }`). |

### 1.5 `DELETE /tags/:id` — Delete Tag

| ID | Requirement |
|---|---|
| TAG-REQ-25 | The endpoint SHALL require a valid Bearer JWT → `401`. |
| TAG-REQ-26 | The service SHALL verify the tag exists and belongs to the authenticated user. If null → `404 NOT_FOUND`. |
| TAG-REQ-27 | The service SHALL delete the `Tag` row using `prisma.tag.delete`. The DB's `onDelete: Cascade` on the `NoteTag` model removes all NoteTag rows for the deleted tag atomically (BR-TAG-04). |
| TAG-REQ-28 | Notes that had the deleted tag SHALL NOT be modified or deleted — only the tag association is removed. |
| TAG-REQ-29 | On success, return `204 No Content` with an empty body. |

### 1.6 Cross-Cutting Constraints

| ID | Requirement |
|---|---|
| TAG-REQ-30 | All service functions accept `userId: string` from `req.user.id` at the route layer. |
| TAG-REQ-31 | Case-insensitive uniqueness is enforced in the SERVICE LAYER via `prisma.tag.findFirst({ where: { userId, name: { equals: name, mode: 'insensitive' } } })`. It is NOT enforced by a DB constraint (the DB `@@unique([userId, name])` is case-sensitive). |
| TAG-REQ-32 | Cross-user tag access SHALL return `404 NOT_FOUND`. Never `403`. |

---

## 2. Test Scenarios

### 2.1 Unit Tests — `tags.service.test.ts`

> Mock `../../lib/prisma.js` with `prisma.tag` (create, findFirst, findMany, update, delete).

**`listTags` tests:**

| Test ID | Scenario | Expected |
|---|---|---|
| `TAG-UT-01` | User has 2 tags with different noteCounts | `tag.findMany` called with `{ where: { userId }, include: { _count: { select: { notes: { where: { note: { deletedAt: null } } } } } } }`; returns `TagWithCount[]` with correct `noteCount` values |
| `TAG-UT-02` | User has no tags | Returns empty array `[]` |

**`createTag` tests:**

| Test ID | Scenario | Expected |
|---|---|---|
| `TAG-UT-03` | Happy path — name and color | `tag.findFirst` (uniqueness check) returns null; `tag.create` called with `{ userId, name, color }`; returns `TagSummary` |
| `TAG-UT-04` | Happy path — name only (no color) | `tag.create` called with `color: null`; returns `{ id, name, color: null }` |
| `TAG-UT-05` | Duplicate name (case-insensitive conflict) | `tag.findFirst` returns existing tag; throws `AppError('TAG_NAME_TAKEN', ..., 409)`; `tag.create` NOT called |
| `TAG-UT-06` | Name with leading/trailing whitespace | `tag.create` called with trimmed name (Zod `.trim()` fires in validate middleware) |

**`updateTag` tests:**

| Test ID | Scenario | Expected |
|---|---|---|
| `TAG-UT-07` | Tag not found | `tag.findFirst` returns null; throws `NOT_FOUND 404` |
| `TAG-UT-08` | Update name only (no conflict) | Uniqueness check called excluding the tag's own id; `tag.update` called with `{ name: newName }` |
| `TAG-UT-09` | New name conflicts with another tag | `checkNameConflict` returns existing; throws `TAG_NAME_TAKEN 409`; `tag.update` NOT called |
| `TAG-UT-10` | Update color to a new hex string | `tag.update` called with `{ color: '#aabbcc' }`; `name` NOT in update data |
| `TAG-UT-11` | Set `color: null` to unset | `tag.update` called with `{ color: null }` |
| `TAG-UT-12` | `color` field absent (undefined) | `tag.update` called without `color` key in data |
| `TAG-UT-13` | Update both name and color | `tag.update` called with both `name` and `color` |
| `TAG-UT-14` | Name is same as current (self-conflict excluded) | `findFirst` with `id: { not: tagId }` returns null; update proceeds without error |

**`deleteTag` tests:**

| Test ID | Scenario | Expected |
|---|---|---|
| `TAG-UT-15` | Happy path | `tag.findFirst` returns tag; `tag.delete` called with `{ where: { id: tagId } }`; resolves void |
| `TAG-UT-16` | Tag not found | `tag.findFirst` returns null; throws `NOT_FOUND 404`; `tag.delete` NOT called |
| `TAG-UT-17` | Tag belongs to different user | `tag.findFirst` returns null (userId scoping); throws `NOT_FOUND 404` |

### 2.2 Integration Tests — `tags.routes.integration.ts`

> Same `describe.skipIf(!DB_AVAILABLE)` pattern. `beforeEach` runs `resetDatabase`. Uses `registerUser` / `createTag` helpers.

**`GET /api/v1/tags`:**

| Test ID | Scenario | Expected |
|---|---|---|
| `TAG-IT-01` | No auth | `401` |
| `TAG-IT-02` | Auth, no tags | `200`, `[]` |
| `TAG-IT-03` | Auth, one tag (note attached to it) | `200`; `[0].noteCount >= 0` (DB available) |
| `TAG-IT-04` | noteCount excludes soft-deleted notes | Create tag, create note with tag, delete note → `noteCount: 0` |
| `TAG-IT-05` | Cross-user isolation | Alice's GET returns only Alice's tags |

**`POST /api/v1/tags`:**

| Test ID | Scenario | Expected |
|---|---|---|
| `TAG-IT-06` | No auth | `401` |
| `TAG-IT-07` | Valid name and color | `201`; response `{ id, name, color }` |
| `TAG-IT-08` | Valid name, no color | `201`; `color: null` |
| `TAG-IT-09` | Missing name | `400 VALIDATION_ERROR` |
| `TAG-IT-10` | Invalid color format | `400 VALIDATION_ERROR` |
| `TAG-IT-11` | Duplicate name same case | `409 TAG_NAME_TAKEN` |
| `TAG-IT-12` | Duplicate name different case (`Work` vs `work`) | `409 TAG_NAME_TAKEN` |
| `TAG-IT-13` | Same name as another user's tag | `201` (tags are user-scoped) |

**`PATCH /api/v1/tags/:id`:**

| Test ID | Scenario | Expected |
|---|---|---|
| `TAG-IT-14` | No auth | `401` |
| `TAG-IT-15` | Update name | `200`; response has new name |
| `TAG-IT-16` | Update color | `200`; response has new color |
| `TAG-IT-17` | Set `color: null` to unset | `200`; `color: null` in response |
| `TAG-IT-18` | Rename to existing name (case-insensitive conflict) | `409 TAG_NAME_TAKEN` |
| `TAG-IT-19` | Rename to own name in different case | `200`; update succeeds (self-exclusion in uniqueness check) |
| `TAG-IT-20` | Tag belongs to different user | `404` |

**`DELETE /api/v1/tags/:id`:**

| Test ID | Scenario | Expected |
|---|---|---|
| `TAG-IT-21` | No auth | `401` |
| `TAG-IT-22` | Own tag | `204` |
| `TAG-IT-23` | Different user's tag | `404` |
| `TAG-IT-24` | After delete, note that had the tag no longer shows it | `GET /notes/:id` → `tags: []` |

---

## 3. Acceptance Criteria (FRS mapping)

| FRS / UC ID | Acceptance Criterion | Test IDs |
|---|---|---|
| UC-TAG-01 | Create tag → 201 with TagSummary | TAG-IT-07, TAG-IT-08 |
| UC-TAG-01 Alt A | Duplicate name (case-insensitive) → 409 TAG_NAME_TAKEN | TAG-IT-11, TAG-IT-12 |
| UC-TAG-01 Alt B | Invalid name or color → 400 | TAG-IT-09, TAG-IT-10 |
| UC-TAG-02 | Delete tag → 204; NoteTag rows removed; notes intact | TAG-IT-22, TAG-IT-24 |
| UC-TAG-02 Alt A | Tag not found or foreign → 404 | TAG-IT-23 |
| BR-TAG-01 | Name case-insensitive uniqueness per user | TAG-IT-11, TAG-IT-12, TAG-UT-05 |
| BR-TAG-01 | Same name as other user's tag → allowed | TAG-IT-13 |
| BR-TAG-02 | Color optional, hex format `#RRGGBB` | TAG-IT-08, TAG-IT-10 |
| BR-TAG-04 | Delete removes NoteTag rows; notes not touched | TAG-IT-24 |
| BR-TAG-05 | `noteCount` excludes soft-deleted notes | TAG-IT-04 |
| BR-TAG-06 | User-scoped: no cross-user visibility | TAG-IT-05, TAG-IT-20, TAG-IT-23 |
| AGENTS.md | Cross-user access → 404, never 403 | TAG-IT-20, TAG-IT-23 |
| AGENTS.md | `userId` from JWT only | TAG-REQ-17 |

---

## 4. Error Code Reference

| Code | Status | Trigger |
|---|---|---|
| `TAG_NAME_TAKEN` | 409 | Case-insensitive name conflict for same user |
| `NOT_FOUND` | 404 | Tag doesn't exist or belongs to another user |
| `VALIDATION_ERROR` | 400 | Zod parse failure (empty name, bad color format) |
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer JWT |
