# Functional Requirements Specification
## Note Taking Application

| Field | Value |
|---|---|
| Document ID | FRS-NTA-001 |
| Version | 1.0 — DRAFT |
| Date | June 4, 2026 |
| Status | Under Review |
| Project Ref | AB-1001 – AB-1017 |

---

## Revision History

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | 2026-06-04 | Product Team | Initial draft — derived from SRS-NTA-001 |

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Actors](#2-system-actors)
3. [Authentication Feature](#3-authentication-feature)
4. [Notes Feature](#4-notes-feature)
5. [Tags Feature](#5-tags-feature)
6. [Full-Text Search Feature](#6-full-text-search-feature)
7. [Note Sharing Feature](#7-note-sharing-feature)
8. [Version History Feature](#8-version-history-feature)
9. [Frontend Functional Requirements](#9-frontend-functional-requirements)
10. [Error Code Catalog](#10-error-code-catalog)
11. [Acceptance Criteria Summary](#11-acceptance-criteria-summary)
- [Appendix A — Out of Scope Features](#appendix-a--out-of-scope-features-rejected)

---

## 1. Introduction

### 1.1 Purpose

This Functional Requirements Specification (FRS) describes the precise, testable behavior that the Note Taking Application (NTA) must exhibit. It expands each requirement from SRS-NTA-001 into use cases, interaction flows, business rules, and UI behavior. It is the direct input to test case design, QA acceptance, and the ticket-level `/spec` process.

### 1.2 Relationship to SRS

> **Document Hierarchy**
>
> `SRS-NTA-001 → FRS-NTA-001 → SDS-NTA-001`
>
> - The **SRS** defines WHAT the system must do (capability level).
> - The **FRS** defines HOW each feature behaves (interaction level) — this document.
> - The **SDS** defines HOW the system is built (design/implementation level).

### 1.3 Scope

This FRS covers all authenticated user actions and anonymous public-link access flows for the NTA. It does not specify internal data structures, database schemas, or API implementation details — those are in SDS-NTA-001.

### 1.4 Notation

| Symbol | Meaning |
|---|---|
| `[M]` | Must Have — blocker for MVP release |
| `[S]` | Should Have — high value, included if time permits |
| `[C]` | Could Have — nice to have, deferred to v2 |
| `BR-xx` | Business Rule identifier |
| `UC-xx` | Use Case identifier |
| `FRS-xx-yy` | Functional requirement (module-number) |

---

## 2. System Actors

| Actor | Description | System Access |
|---|---|---|
| **Registered User** | An authenticated human user with an account. All note, tag, search, share, and version features are available. | Full access to all protected API routes via Bearer JWT |
| **Anonymous Visitor** | A non-authenticated user who follows a public share link. Read-only access to a single shared note. | `GET /public/notes/:token` only |
| **System (Background)** | Automated system tasks: OTP expiry, token expiry checks, version auto-purge. | Internal DB operations only — no external API |

---

## 3. Authentication Feature

### 3.1 Business Rules

| ID | Rule |
|---|---|
| BR-AUTH-01 | Passwords must be minimum 8 characters. No maximum enforced server-side but UI caps input at 128 characters. |
| BR-AUTH-02 | Email addresses are stored lowercase and trimmed. Login is case-insensitive on email. |
| BR-AUTH-03 | Access tokens expire after exactly 15 minutes. They are never stored server-side. |
| BR-AUTH-04 | Refresh tokens expire after exactly 7 days. Each use rotates the token (old one revoked, new one issued atomically). |
| BR-AUTH-05 | A user may have at most one valid refresh token at a time. New login revokes all prior tokens. |
| BR-AUTH-06 | OTP codes are exactly 6 decimal digits, randomly generated, and expire after 15 minutes. |
| BR-AUTH-07 | OTPs are single-use. Once validated, the `usedAt` field is set and subsequent submissions are rejected. |
| BR-AUTH-08 | The forgot-password endpoint always returns 200 regardless of whether the email exists (enumeration prevention). |
| BR-AUTH-09 | After a successful password reset, all active refresh tokens for that user are revoked. |
| BR-AUTH-10 | The system logs the OTP to stdout only. No email is sent under any circumstance. |

### 3.2 Use Cases

#### UC-AUTH-01: Register

| Field | Detail |
|---|---|
| **Actor** | Unregistered visitor |
| **Trigger** | User submits registration form with email and password |
| **Precondition** | Email is not already registered |
| **Main Flow** | 1. User enters email and password<br>2. System validates format (email RFC 5322, password ≥8 chars)<br>3. System checks email uniqueness<br>4. System hashes password with bcrypt (≥10 rounds)<br>5. System creates User record<br>6. System issues access token (JWT, 15 min) and refresh token (7 days, stored in DB)<br>7. System sets refresh token as HttpOnly cookie<br>8. System returns 201 with access token in response body |
| **Alt Flow A** | Email already exists → `409 EMAIL_TAKEN` |
| **Alt Flow B** | Validation fails → `400` with field-level errors |
| **Post-condition** | User is authenticated and redirected to notes list |

#### UC-AUTH-02: Login

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User submits login form |
| **Precondition** | User has a registered account |
| **Main Flow** | 1. User enters email and password<br>2. System looks up user by email (case-insensitive)<br>3. System verifies password with `bcrypt.compare()`<br>4. System revokes all prior refresh tokens for this user<br>5. System issues new access token and refresh token<br>6. System sets refresh token as HttpOnly cookie<br>7. System returns 200 with access token |
| **Alt Flow A** | Email not found OR password wrong → `401 INVALID_CREDENTIALS` (no field hint) |
| **Alt Flow B** | Validation fails (empty fields) → `400` |
| **Post-condition** | User is authenticated and redirected to notes list |

#### UC-AUTH-03: Silent Token Refresh

| Field | Detail |
|---|---|
| **Actor** | Registered user (automatic — initiated by frontend HTTP interceptor) |
| **Trigger** | Any API call returns `401 UNAUTHORIZED` due to expired access token |
| **Precondition** | Valid non-expired non-revoked refresh token exists in cookie |
| **Main Flow** | 1. Frontend interceptor catches 401<br>2. Frontend sends `POST /auth/refresh` with cookie<br>3. System validates refresh token (exists in DB, not revoked, not expired)<br>4. System atomically revokes old refresh token and inserts new one<br>5. System returns 200 with new access token and sets new refresh cookie<br>6. Frontend retries original failed request with new access token |
| **Alt Flow A** | Refresh token invalid/expired/revoked → `401 REFRESH_TOKEN_INVALID` → frontend redirects to login |
| **Post-condition** | User remains logged in; original request completes transparently |

#### UC-AUTH-04: Logout

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User clicks Logout |
| **Precondition** | User is authenticated |
| **Main Flow** | 1. Frontend sends `POST /auth/logout` with refresh cookie<br>2. System sets `revokedAt` on the refresh token record<br>3. System clears the refresh token cookie (`Set-Cookie: maxAge=0`)<br>4. System returns 200<br>5. Frontend clears access token from memory and redirects to login |
| **Alt Flow A** | Refresh token already expired → system still returns 200, clears cookie |
| **Post-condition** | User is logged out; all tokens are invalid |

#### UC-AUTH-05: Forgot Password

| Field | Detail |
|---|---|
| **Actor** | Unregistered or registered visitor |
| **Trigger** | User submits forgot-password form with email |
| **Precondition** | None — endpoint is public |
| **Main Flow** | 1. User enters email address<br>2. System looks up user by email<br>3. If found: system generates 6-digit OTP, stores with 15-min expiry, logs OTP to stdout<br>4. If not found: system takes no action<br>5. System returns 200 in both cases with generic message |
| **Alt Flow A** | Previous OTP exists and is not yet expired → invalidate old OTP before storing new one |
| **Post-condition** | OTP is available in server logs for testing; user is shown "check your email" message |

#### UC-AUTH-06: Reset Password

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User submits reset-password form with email, OTP, and new password |
| **Precondition** | A valid unused unexpired OTP exists for the email |
| **Main Flow** | 1. User enters email, 6-digit OTP, and new password<br>2. System validates OTP: exists, not expired, not used, matches email<br>3. System marks OTP as used (`usedAt = now`)<br>4. System hashes new password with bcrypt<br>5. System updates `User.passwordHash`<br>6. System revokes all active refresh tokens for this user<br>7. System returns 200 |
| **Alt Flow A** | OTP expired → `400 OTP_EXPIRED` |
| **Alt Flow B** | OTP already used → `400 OTP_USED` |
| **Alt Flow C** | OTP does not match → `400 OTP_INVALID` |
| **Post-condition** | User can log in with new password. All sessions are terminated. |

---

## 4. Notes Feature

### 4.1 Business Rules

| ID | Rule |
|---|---|
| BR-NOTE-01 | Note title is required, max 255 characters. Content is optional, stored as TipTap JSON. |
| BR-NOTE-02 | A note belongs to exactly one user. `userId` is derived from the JWT `sub` claim only — never from request body. |
| BR-NOTE-03 | A note may have 0–5 tags simultaneously. Assigning a 6th tag returns `400 TOO_MANY_TAGS`. |
| BR-NOTE-04 | Tags assigned to a note must belong to the same user. Cross-user tag assignment returns `400 INVALID_TAG`. |
| BR-NOTE-05 | Soft delete sets `deletedAt` to the current UTC timestamp. The row is never physically removed within 30 days. |
| BR-NOTE-06 | Soft-deleted notes are excluded from all list, search, and detail endpoints unless a `trash` query param is explicitly set (future feature — out of scope for MVP). |
| BR-NOTE-07 | Every `PATCH /notes/:id` triggers a `NoteVersion` snapshot before applying changes, within the same DB transaction. |
| BR-NOTE-08 | The note's `tsvector` column is regenerated on every title or content change via a PostgreSQL generated column. |
| BR-NOTE-09 | Pagination defaults: `page=1`, `limit=20`. Maximum `limit` is 100. |
| BR-NOTE-10 | Default sort order is `updatedAt DESC`. Supported sort fields: `createdAt`, `updatedAt`, `title`. |
| BR-NOTE-11 | Tag filter uses AND logic — a note must have ALL specified tags to be included in results. |

### 4.2 Use Cases

#### UC-NOTE-01: Create Note

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User saves a new note in the editor |
| **Precondition** | User is authenticated |
| **Main Flow** | 1. User enters title and optional rich-text content<br>2. User optionally assigns 1–5 tags<br>3. Frontend sends `POST /notes` with `{ title, content, tagIds }`<br>4. System validates title length, tag ownership, tag count (BR-NOTE-01 to -04)<br>5. System creates Note record with `userId` from JWT<br>6. System creates NoteTag associations<br>7. System returns 201 with full note object including tags |
| **Alt Flow A** | Title missing or empty → `400 TITLE_REQUIRED` |
| **Alt Flow B** | Tag count > 5 → `400 TOO_MANY_TAGS` |
| **Alt Flow C** | Tag ID belongs to another user → `400 INVALID_TAG` |
| **Post-condition** | Note appears at top of notes list (sorted by `updatedAt DESC`) |

#### UC-NOTE-02: Edit Note

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User edits note content; TipTap autosave fires after 2-second debounce |
| **Precondition** | Note exists and belongs to the authenticated user |
| **Main Flow** | 1. User edits title or content in TipTap editor<br>2. After 2s debounce, frontend sends `PATCH /notes/:id` with changed fields<br>3. System validates ownership (BR-NOTE-02)<br>4. System creates `NoteVersion` snapshot (title, content, savedAt) in same transaction<br>5. System applies update to Note record<br>6. System regenerates `tsvector` column<br>7. System auto-purges versions exceeding retention limit (50) in same transaction<br>8. System returns 200 with updated note |
| **Alt Flow A** | Note not found or owned by another user → `404` |
| **Alt Flow B** | Title set to empty → `400 TITLE_REQUIRED` |
| **Post-condition** | Note is updated. New version snapshot exists. Editor shows "Saved" indicator. |

#### UC-NOTE-03: Delete Note (Soft)

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User clicks Delete / moves note to trash |
| **Precondition** | Note exists and belongs to the user and has not been previously soft-deleted |
| **Main Flow** | 1. User confirms deletion in UI<br>2. Frontend sends `DELETE /notes/:id`<br>3. System sets `note.deletedAt = now()`<br>4. System returns `204 No Content`<br>5. Note disappears from notes list immediately |
| **Alt Flow A** | Note already soft-deleted → `404` (treated as if gone) |
| **Alt Flow B** | Note belongs to another user → `404` |
| **Post-condition** | Note is hidden from all list/search views. Row retained for 30 days. |

#### UC-NOTE-04: Browse Notes List

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User navigates to notes list or applies filter/sort |
| **Precondition** | User is authenticated |
| **Main Flow** | 1. User may optionally set sort (`createdAt`/`updatedAt`/`title`, `asc`/`desc`) and filter by tags<br>2. Frontend sends `GET /notes` with query params<br>3. System returns paginated results excluding soft-deleted notes<br>4. Response includes `meta: { total, page, limit, totalPages }`<br>5. Each note in list includes: id, title, truncated content preview (first 150 chars), tags, updatedAt |
| **Alt Flow A** | No notes exist → `200` with empty `data` array and `total=0` |
| **Alt Flow B** | Page out of range → `200` with empty `data` array |
| **Post-condition** | User sees their notes filtered and sorted as requested |

---

## 5. Tags Feature

### 5.1 Business Rules

| ID | Rule |
|---|---|
| BR-TAG-01 | Tag names are max 50 characters, trimmed, and stored as provided (case preserved). Uniqueness check is case-insensitive per user. |
| BR-TAG-02 | Tag color is an optional hex string in the format `#RRGGBB`. If omitted, the system assigns `null` (UI renders a default color). |
| BR-TAG-03 | A user may have unlimited tags. |
| BR-TAG-04 | Deleting a tag removes all NoteTag join rows but does not modify or delete any notes. |
| BR-TAG-05 | The `noteCount` field returned by `GET /tags` counts only active (non-soft-deleted) notes for the authenticated user. |
| BR-TAG-06 | Tags are user-scoped — a user cannot see or use another user's tags. |

### 5.2 Use Cases

#### UC-TAG-01: Create Tag

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User creates a new tag from the tag management panel or inline in the editor |
| **Precondition** | User is authenticated |
| **Main Flow** | 1. User enters tag name and optional color<br>2. Frontend sends `POST /tags` with `{ name, color? }`<br>3. System validates name length and uniqueness (case-insensitive, per user)<br>4. System creates Tag record linked to `userId`<br>5. System returns 201 with tag object |
| **Alt Flow A** | Name already exists for this user (case-insensitive) → `409 TAG_NAME_TAKEN` |
| **Alt Flow B** | Name empty or > 50 chars → `400` |
| **Post-condition** | New tag appears in tag list and is available for note assignment |

#### UC-TAG-02: Delete Tag

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User deletes a tag from tag management |
| **Precondition** | Tag exists and belongs to the user |
| **Main Flow** | 1. User confirms deletion<br>2. Frontend sends `DELETE /tags/:id`<br>3. System deletes all NoteTag rows referencing this tag (cascade)<br>4. System deletes the Tag record<br>5. System returns `204`<br>6. Tag disappears from tag list; notes that had it no longer show it |
| **Alt Flow A** | Tag not found or belongs to another user → `404` |
| **Post-condition** | Tag is gone. No notes are modified or deleted. |

---

## 6. Full-Text Search Feature

### 6.1 Business Rules

| ID | Rule |
|---|---|
| BR-SRCH-01 | Search is scoped to the authenticated user's non-deleted notes only. |
| BR-SRCH-02 | The search query is applied against the note's `tsvector` column (title + content combined). |
| BR-SRCH-03 | Results are ordered by `ts_rank` descending by default. |
| BR-SRCH-04 | Each result includes a `headline` field: a text fragment with matched terms wrapped in `<mark>...</mark>` tags (generated by PostgreSQL `ts_headline`). |
| BR-SRCH-05 | The headline is generated from the `contentText` (plain text) column, not the raw TipTap JSON. |
| BR-SRCH-06 | An empty or whitespace-only query string returns `400 QUERY_REQUIRED`. |
| BR-SRCH-07 | Search results use the same pagination structure as the notes list (`page`, `limit`, `total`, `totalPages`). |

### 6.2 Use Case

#### UC-SRCH-01: Search Notes

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User types in the search bar and submits (or presses Enter) |
| **Precondition** | User is authenticated |
| **Main Flow** | 1. User enters a search query (1+ characters)<br>2. Frontend sends `GET /notes/search?q=<query>&page=1&limit=20`<br>3. System executes FTS query against the user's non-deleted notes<br>4. System computes `ts_headline` for each result<br>5. System returns paginated results with `headline` field<br>6. Frontend renders results with `<mark>` tags styled as highlighted text |
| **Alt Flow A** | No results found → `200` with empty `data` array |
| **Alt Flow B** | Query is empty/whitespace → `400 QUERY_REQUIRED` |
| **Alt Flow C** | Query yields PostgreSQL FTS syntax error → system sanitizes input via `plainto_tsquery()` before querying; never exposes DB error |
| **Post-condition** | User sees matching notes with highlighted keywords |

---

## 7. Note Sharing Feature

### 7.1 Business Rules

| ID | Rule |
|---|---|
| BR-SHARE-01 | Share tokens are UUIDs generated server-side. They are unpredictable and not derived from the note ID. |
| BR-SHARE-02 | A note may have multiple simultaneous active share links (e.g. one per recipient). |
| BR-SHARE-03 | An active share link is one where `revokedAt IS NULL` and (`expiresAt IS NULL` OR `expiresAt > now()`). |
| BR-SHARE-04 | Accessing an expired or revoked link returns `404` — not `401` or `403` — to avoid note existence disclosure. |
| BR-SHARE-05 | The view count is incremented atomically using a single `UPDATE` statement (not read-modify-write). |
| BR-SHARE-06 | The public share endpoint returns only title and rendered content — it does not return tags, version history, or share link metadata. |
| BR-SHARE-07 | Revoking a share link is permanent — there is no "re-activate" operation. |
| BR-SHARE-08 | If a note is soft-deleted, all its share links become effectively inaccessible (`GET /public/notes/:token` returns `404`). |

### 7.2 Use Cases

#### UC-SHARE-01: Generate Share Link

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User clicks "Share" and generates a link from the share modal |
| **Precondition** | Note exists and belongs to the authenticated user |
| **Main Flow** | 1. User optionally sets an expiry date<br>2. Frontend sends `POST /notes/:id/share` with `{ expiresAt? }`<br>3. System generates a UUID token<br>4. System creates ShareLink record `{ noteId, userId, token, expiresAt, viewCount: 0 }`<br>5. System returns 201 with full share link object including constructed public URL |
| **Alt Flow A** | Note not found or not owned by user → `404` |
| **Post-condition** | A new share link is active. Public URL can be copied and shared. |

#### UC-SHARE-02: Access Public Share Link

| Field | Detail |
|---|---|
| **Actor** | Anonymous visitor |
| **Trigger** | Visitor opens the public share URL in a browser |
| **Precondition** | None — no authentication required |
| **Main Flow** | 1. Browser sends `GET /public/notes/:token`<br>2. System looks up ShareLink by token<br>3. System validates: link exists, `revokedAt IS NULL`, `expiresAt IS NULL` OR `expiresAt > now()`<br>4. System validates: underlying note is not soft-deleted<br>5. System atomically increments `viewCount`<br>6. System returns 200 with `{ title, content }` — no user data, no tags |
| **Alt Flow A** | Token not found → `404` |
| **Alt Flow B** | Link revoked → `404` |
| **Alt Flow C** | Link expired → `404` |
| **Alt Flow D** | Note soft-deleted → `404` |
| **Post-condition** | Visitor sees note in read-only view. `viewCount` is incremented. |

---

## 8. Version History Feature

### 8.1 Business Rules

| ID | Rule |
|---|---|
| BR-VER-01 | A `NoteVersion` snapshot is created before every `PATCH /notes/:id` within the same DB transaction. |
| BR-VER-02 | A snapshot captures: `noteId`, `title` (at time of save), `content` (at time of save), `savedAt` (UTC timestamp). |
| BR-VER-03 | The version list endpoint returns `id` and `savedAt` only — not full content — to keep payloads small. |
| BR-VER-04 | The version detail endpoint returns the full `title` and `content` for a single version. |
| BR-VER-05 | Restoring a version creates a new save of the note with the restored content, which itself generates a new version snapshot. |
| BR-VER-06 | Auto-purge: if a note has more than 50 versions after a save, the oldest versions exceeding 50 are deleted in the same transaction. |
| BR-VER-07 | Version operations are only permitted for the note's owner. All version endpoints return `404` if the note belongs to a different user. |

### 8.2 Use Cases

#### UC-VER-01: View Version History

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User opens the version history drawer for a note |
| **Precondition** | Note exists and belongs to the user; at least one version exists |
| **Main Flow** | 1. Frontend sends `GET /notes/:id/versions`<br>2. System returns array of `{ id, savedAt }` sorted by `savedAt DESC`<br>3. Frontend renders list of timestamps in the history drawer |
| **Alt Flow A** | No versions exist (note never saved after creation) → `200` with empty array |
| **Post-condition** | User sees list of saved versions |

#### UC-VER-02: Restore Version

| Field | Detail |
|---|---|
| **Actor** | Registered user |
| **Trigger** | User selects a version from history and clicks "Restore" |
| **Precondition** | Version exists and belongs to a note owned by the user |
| **Main Flow** | 1. User previews version content (`GET /notes/:id/versions/:versionId`)<br>2. User clicks "Restore this version"<br>3. Frontend sends `POST /notes/:id/versions/:versionId/restore`<br>4. System reads the version's title and content<br>5. System applies them as a PATCH to the current note (within a transaction)<br>6. This save creates a new `NoteVersion` snapshot (capturing the restore action)<br>7. System returns 200 with the updated note<br>8. Editor refreshes with restored content |
| **Alt Flow A** | Version not found → `404` |
| **Alt Flow B** | Note belongs to another user → `404` |
| **Post-condition** | Note content is restored. A new version snapshot records the restore event. |

---

## 9. Frontend Functional Requirements

### 9.1 Auth Pages (AB-1010)

| ID | Requirement | Priority |
|---|---|---|
| FRS-FE-01 | Registration form shall have fields: Email, Password, Confirm Password. Passwords must match client-side before submission. | [M] |
| FRS-FE-02 | Login form shall have fields: Email, Password. A "Forgot password?" link navigates to the forgot-password page. | [M] |
| FRS-FE-03 | Forgot-password form shall have one field: Email. On submit, show a generic success message regardless of outcome. | [M] |
| FRS-FE-04 | Reset-password form shall have fields: Email, OTP (6-digit), New Password, Confirm Password. | [M] |
| FRS-FE-05 | All auth form errors shall be displayed inline below the relevant input field using `shadcn/ui` `FormMessage`. | [M] |
| FRS-FE-06 | Submit buttons shall be disabled and show a loading spinner while the API request is in flight. | [M] |
| FRS-FE-07 | After successful login or registration, the user is redirected to `/notes`. | [M] |
| FRS-FE-08 | Unauthenticated users navigating to protected routes are redirected to `/login`. | [M] |

### 9.2 Notes List Page (AB-1011)

| ID | Requirement | Priority |
|---|---|---|
| FRS-FE-09 | The notes list shall display: note title, truncated content preview (max 150 chars), tag chips, last updated timestamp. | [M] |
| FRS-FE-10 | A sort control shall allow selecting: Last Updated, Created, Title — each with ascending/descending toggle. | [M] |
| FRS-FE-11 | A tag filter panel shall list all user tags. Selecting multiple tags filters to notes with ALL selected tags. | [M] |
| FRS-FE-12 | Pagination controls (prev/next or page numbers) shall be shown when `totalPages > 1`. | [M] |
| FRS-FE-13 | A "New Note" button navigates to the note editor with an empty state. | [M] |
| FRS-FE-14 | Each note card has a delete (trash) button. Clicking it shows a confirmation dialog before sending DELETE. | [M] |
| FRS-FE-15 | An empty state illustration and "Create your first note" CTA is shown when no notes exist. | [S] |

### 9.3 Note Editor (AB-1012)

| ID | Requirement | Priority |
|---|---|---|
| FRS-FE-16 | The editor uses TipTap with at minimum: bold, italic, underline, bullet list, ordered list, heading (H1/H2/H3), blockquote, code block. | [M] |
| FRS-FE-17 | The note title is an editable plain-text field above the TipTap editor, not part of the rich text. | [M] |
| FRS-FE-18 | Autosave fires 2 seconds after the last keystroke change (debounced). Saves title and content together. | [M] |
| FRS-FE-19 | A status indicator shows one of three states: "Saving…", "Saved", "Error saving". Visible at all times during an edit session. | [M] |
| FRS-FE-20 | Tag assignment: a multi-select combobox allows searching and selecting existing user tags (max 5). Inline "Create tag" option available. | [M] |
| FRS-FE-21 | A "Share" button in the editor toolbar opens the share modal (UC-SHARE-01). | [M] |
| FRS-FE-22 | A "History" button in the editor toolbar opens the version history drawer (UC-VER-01/02). | [M] |
| FRS-FE-23 | Navigating away from an unsaved note (edge case: manual save failed) shows a browser `beforeunload` warning. | [S] |

### 9.4 Search UI (AB-1013)

| ID | Requirement | Priority |
|---|---|---|
| FRS-FE-24 | A search bar is accessible from the notes list header. Pressing Enter or clicking the search icon submits. | [M] |
| FRS-FE-25 | Search results page shows: headline (with `<mark>` tags rendered as highlighted spans), note title, `updatedAt`. | [M] |
| FRS-FE-26 | Clicking a search result navigates to the note editor for that note. | [M] |
| FRS-FE-27 | A "No results" empty state is shown with the search query displayed. | [M] |
| FRS-FE-28 | A loading skeleton is shown while the search request is in flight. | [S] |

### 9.5 Share Modal (AB-1014)

| ID | Requirement | Priority |
|---|---|---|
| FRS-FE-29 | The share modal shows a list of all active share links for the current note (token preview, expiry, view count). | [M] |
| FRS-FE-30 | A "Generate Link" button (with optional expiry date picker) creates a new share link. | [M] |
| FRS-FE-31 | Each active link has a "Copy URL" button that copies the public URL to clipboard and shows a toast confirmation. | [M] |
| FRS-FE-32 | Each active link has a "Revoke" button with a confirmation dialog. | [M] |

### 9.6 Version History Drawer (AB-1015)

| ID | Requirement | Priority |
|---|---|---|
| FRS-FE-33 | The drawer slides in from the right and shows a list of versions with formatted timestamps. | [M] |
| FRS-FE-34 | Clicking a version shows a preview of that version's content in a read-only TipTap instance within the drawer. | [M] |
| FRS-FE-35 | A "Restore this version" button in the preview triggers UC-VER-02 after a confirmation dialog. | [M] |
| FRS-FE-36 | The current (latest) version is labeled "Current" and cannot be restored (no restore button shown). | [S] |

### 9.7 UI Polish and Visual Design (AB-1017)

| ID | Requirement | Priority |
|---|---|---|
| FRS-FE-37 | The app shall use a consistent professional color palette for backgrounds, navigation, buttons, tags, focus rings, and status indicators. | [M] |
| FRS-FE-38 | All modal, dialog, drawer, popover, dropdown, and toast surfaces shall render with opaque white backgrounds and readable foreground text. | [M] |
| FRS-FE-39 | Main pages shall use a non-transparent background color or subtle gradient so content cards and editor surfaces are visually separated. | [M] |
| FRS-FE-40 | The TipTap editor shall be styled as a clear writing surface with toolbar grouping, visible active formatting states, comfortable spacing, and accessible contrast. | [M] |
| FRS-FE-41 | Forms, note cards, empty states, search results, and share/version panels shall use consistent border radius, shadow, spacing, and hover/focus states. | [S] |
| FRS-FE-42 | UI polish shall not change API response shapes, auth token storage, autosave behavior, or existing user journey flows. | [M] |

---

## 10. Error Code Catalog

All error responses follow the shape: `{ error: { code: string, message: string, fields?: Record<string, string> } }`

| Error Code | HTTP Status | Trigger | User-Facing Message |
|---|---|---|---|
| `EMAIL_TAKEN` | 409 | Registration with an already-used email | An account with this email already exists. |
| `INVALID_CREDENTIALS` | 401 | Login with wrong email or password | Invalid email or password. |
| `REFRESH_TOKEN_INVALID` | 401 | Expired, revoked, or missing refresh token | Your session has expired. Please log in again. |
| `OTP_EXPIRED` | 400 | OTP used after 15-minute window | This reset code has expired. Please request a new one. |
| `OTP_USED` | 400 | OTP submitted a second time | This reset code has already been used. |
| `OTP_INVALID` | 400 | OTP value does not match | Invalid reset code. |
| `TITLE_REQUIRED` | 400 | Note saved without a title | Please enter a title for your note. |
| `TOO_MANY_TAGS` | 400 | More than 5 tags assigned to a note | A note can have at most 5 tags. |
| `INVALID_TAG` | 400 | Tag ID belongs to a different user | One or more selected tags are invalid. |
| `TAG_NAME_TAKEN` | 409 | Tag created with duplicate name (case-insensitive, per user) | You already have a tag with this name. |
| `QUERY_REQUIRED` | 400 | Search submitted with empty query | Please enter a search term. |
| `NOT_FOUND` | 404 | Resource not found or access denied to another user's resource | Not found. |
| `VALIDATION_ERROR` | 400 | Zod schema validation failure on request body | Invalid input. See fields for details. |
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer token on protected route | Authentication required. |

---

## 11. Acceptance Criteria Summary

Each criterion must have a corresponding named test in the test suite. The test name must include the UC or FRS ID.

| Use Case / Req ID | Acceptance Criteria | Test Type |
|---|---|---|
| UC-AUTH-01 | `POST /auth/register` with valid body → 201 + access token in body + refresh cookie set | Integration |
| UC-AUTH-01 | Duplicate email → `409 EMAIL_TAKEN` | Integration |
| UC-AUTH-01 | Password not stored as plaintext (bcrypt hash verifiable) | Unit |
| UC-AUTH-02 | Valid login → 200 + access token + refresh cookie | Integration |
| UC-AUTH-02 | Wrong password → `401 INVALID_CREDENTIALS` (no field hint) | Integration |
| UC-AUTH-03 | Expired access token + valid refresh → new access token issued transparently | Integration |
| UC-AUTH-03 | Revoked refresh token → 401 + redirect to login | Integration |
| UC-AUTH-04 | Logout → `revokedAt` set on refresh token + cookie cleared | Integration |
| UC-AUTH-05 | Forgot-password → 200 regardless of email existence | Integration |
| UC-AUTH-05 | OTP logged to stdout (not sent via email) | Unit |
| UC-AUTH-06 | Valid OTP → password updated + all refresh tokens revoked | Integration |
| UC-AUTH-06 | Expired OTP → `400 OTP_EXPIRED` | Integration |
| UC-AUTH-06 | Used OTP → `400 OTP_USED` | Integration |
| UC-NOTE-01 | Create note → 201 with tags included | Integration |
| UC-NOTE-01 | 6+ tags → `400 TOO_MANY_TAGS` | Integration |
| UC-NOTE-02 | Edit note → NoteVersion snapshot created in same transaction | Integration |
| UC-NOTE-02 | Edit note → tsvector regenerated (searchable immediately) | Integration |
| UC-NOTE-03 | Soft delete → `deletedAt` set, row not deleted | Integration |
| UC-NOTE-03 | Soft-deleted note not returned in `GET /notes` | Integration |
| UC-NOTE-04 | List → paginated, sorted, tag-filtered correctly | Integration |
| UC-TAG-01 | Create tag → 201; duplicate name (case-insensitive) → 409 | Integration |
| UC-TAG-02 | Delete tag → NoteTag rows removed; notes intact | Integration |
| UC-SRCH-01 | Search → results ordered by `ts_rank`; headline includes `<mark>` tags | Integration |
| UC-SRCH-01 | Empty query → `400 QUERY_REQUIRED` | Integration |
| UC-SHARE-01 | Generate share link → 201 with UUID token | Integration |
| UC-SHARE-02 | Access valid link → 200 + `viewCount` incremented atomically | Integration |
| UC-SHARE-02 | Access expired/revoked link → 404 | Integration |
| UC-VER-01 | List versions → `id` + `savedAt` only (no content) | Integration |
| UC-VER-02 | Restore version → new snapshot created; note content updated | Integration |
| FRS-FE-18 | Autosave fires exactly 2s after last keystroke | E2E |
| FRS-FE-19 | Saving/Saved/Error states visible during autosave lifecycle | E2E |
| FRS-FE-31 | Copy URL toast shown on clipboard copy | E2E |
| FRS-FE-38 | Modal/dialog/drawer/popover/toast surfaces render opaque white backgrounds with readable text | Component |
| FRS-FE-40 | Editor toolbar and writing surface show active formatting states and accessible contrast | Component |

---

## Appendix A — Out of Scope Features (Rejected)

| Feature | Reason for Exclusion |
|---|---|
| Real-time collaborative editing | Requires WebSocket infrastructure (Socket.io/Yjs), conflict resolution (CRDT), and operational transforms — significant architectural complexity outside MVP scope. |
| File/image attachments | Requires object storage (S3 or equivalent), multipart upload handling, and MIME type validation — out of scope. |
| Native mobile app | React Native or Flutter project; separate codebase and release pipeline. Out of scope. |
| OAuth / Social Login | Passport.js integration with provider secrets management. Deferred to v2. |
| Note folders/nesting | Requires hierarchical data model (adjacency list or nested sets), UI tree navigation. Out of scope. |
| Actual email sending | Requires SMTP or transactional email service (SendGrid, Resend). OTP is logged to stdout only for MVP. |
