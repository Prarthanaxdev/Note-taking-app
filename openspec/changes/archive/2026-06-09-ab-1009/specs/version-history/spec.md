# Spec — version-history

## ADDED Requirements

### Requirement: List note versions

The system SHALL expose a `GET /notes/:id/versions` endpoint that returns all saved versions of a note, restricted to the note's owner. The response SHALL be a plain array (no pagination envelope) sorted by `savedAt` descending. Each item SHALL contain only `id` and `savedAt` — full content is not included.

#### Scenario: Owner lists versions of a note with saved history
- **WHEN** an authenticated user sends `GET /notes/:id/versions` for a note they own that has at least one version
- **THEN** the system returns `200` with a JSON array of `{ id: string, savedAt: string }` objects sorted newest-first

#### Scenario: No versions exist yet
- **WHEN** an authenticated user sends `GET /notes/:id/versions` for a note they own that has never been updated after creation
- **THEN** the system returns `200` with an empty array `[]`

#### Scenario: Unauthenticated request
- **WHEN** a request is made to `GET /notes/:id/versions` with no or invalid Authorization header
- **THEN** the system returns `401`

#### Scenario: Note belongs to another user
- **WHEN** an authenticated user sends `GET /notes/:id/versions` for a note that belongs to a different user
- **THEN** the system returns `404` (never `403`)

#### Scenario: Note does not exist
- **WHEN** an authenticated user sends `GET /notes/:id/versions` with a non-existent note ID
- **THEN** the system returns `404`

---

### Requirement: Retrieve single version content

The system SHALL expose a `GET /notes/:id/versions/:versionId` endpoint that returns the full title and content for a specific saved version. The request MUST only succeed if the requesting user owns the parent note.

#### Scenario: Owner retrieves a version's full content
- **WHEN** an authenticated user sends `GET /notes/:id/versions/:versionId` for a version that belongs to a note they own
- **THEN** the system returns `200` with `{ id, title, content, savedAt }` — `content` is the TipTap JSONB object captured at save time, or `null`

#### Scenario: Unauthenticated request
- **WHEN** a request is made to `GET /notes/:id/versions/:versionId` with no or invalid Authorization header
- **THEN** the system returns `401`

#### Scenario: Version belongs to another user's note
- **WHEN** an authenticated user sends `GET /notes/:id/versions/:versionId` where the note belongs to a different user
- **THEN** the system returns `404`

#### Scenario: Version ID does not exist under the given note
- **WHEN** an authenticated user sends `GET /notes/:id/versions/:versionId` with a non-existent versionId for an otherwise valid, owned note
- **THEN** the system returns `404`

---

### Requirement: Restore a past version

The system SHALL expose a `POST /notes/:id/versions/:versionId/restore` endpoint. Restoring a version MUST apply the version's `title` and `content` to the current note as a standard update — producing a new `NoteVersion` snapshot and triggering the auto-purge rule — all within a single transaction. The response SHALL be the full updated `NoteDetail`.

#### Scenario: Owner successfully restores a version
- **WHEN** an authenticated user sends `POST /notes/:id/versions/:versionId/restore` for a version under a note they own
- **THEN** the system returns `200` with the updated `NoteDetail`; the note's `title` and `content` match the restored version; a new `NoteVersion` snapshot is created; auto-purge runs if the count exceeds 50

#### Scenario: Restore creates a new snapshot (the restore event is itself versioned)
- **WHEN** a version is restored
- **THEN** the version history grows by one entry (`savedAt` of the new snapshot is the current time, not the restored version's `savedAt`)

#### Scenario: Unauthenticated request
- **WHEN** a request is made to `POST /notes/:id/versions/:versionId/restore` with no or invalid Authorization header
- **THEN** the system returns `401`

#### Scenario: Note belongs to another user
- **WHEN** an authenticated user sends `POST /notes/:id/versions/:versionId/restore` for a note that belongs to a different user
- **THEN** the system returns `404`

#### Scenario: Version ID does not exist under the given note
- **WHEN** an authenticated user sends `POST /notes/:id/versions/:versionId/restore` with a non-existent versionId
- **THEN** the system returns `404`

---

### Requirement: Auto-purge enforces 50-version retention limit

The system SHALL delete the oldest versions beyond 50 whenever a snapshot is created (either via a note update or a restore). The purge MUST happen in the same transaction as the snapshot creation. This behavior is already implemented in `notes.service.ts:update()`; the restore endpoint reuses it by delegating to that function.

#### Scenario: Auto-purge fires during restore when count would exceed 50
- **WHEN** a note already has 50 versions and a restore is performed (creating version 51)
- **THEN** the oldest version is deleted; after the operation the note has exactly 50 versions

---

### Requirement: Version endpoints enforce note ownership at the service layer

All three version endpoints MUST verify that the requesting user owns the parent note before performing any data access. Authorization MUST be enforced in the service layer (not route layer only) via `prisma.note.findFirst({ where: { id: noteId, userId, deletedAt: null } })`.

#### Scenario: Soft-deleted note returns 404
- **WHEN** an authenticated user requests any version endpoint for a note that has been soft-deleted (`deletedAt` is set)
- **THEN** the system returns `404`
