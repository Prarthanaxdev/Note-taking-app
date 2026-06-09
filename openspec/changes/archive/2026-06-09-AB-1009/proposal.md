# Proposal — AB-1009: Version History Endpoints

## Why

Note version snapshots have been written since AB-1004 (every `PATCH /notes/:id` creates a `NoteVersion` row in the same transaction), but no endpoints expose them to clients. Users cannot yet list, preview, or restore previous versions of their notes.

## What Changes

- Add `VersionListItem` type (`{ id, savedAt }`) to `packages/shared/src/types/api.types.ts`
- Implement `apps/api/src/services/versions.service.ts` with three exported functions:
  - `listVersions(userId, noteId)` → `VersionListItem[]` sorted by `savedAt DESC`
  - `getVersion(userId, noteId, versionId)` → `{ id, title, content, savedAt }` (full content)
  - `restoreVersion(userId, noteId, versionId)` → `NoteDetail` (delegates to `notesService.update()` to reuse snapshot + auto-purge transaction)
- Implement `apps/api/src/routes/versions.routes.ts` (currently an empty scaffold) with three routes, using `Router({ mergeParams: true })` so `req.params.id` from the parent path is available
- Mount `versionsRouter` inside `notesRouter` at `/:id/versions` (no change to `index.ts` required)

## Capabilities

### New Capabilities

- `version-history`: List all saved versions (`id`+`savedAt` only), retrieve full content for a single version, and restore a past version as the current note state

### Modified Capabilities

_(none — snapshot creation and auto-purge behavior are unchanged from AB-1004)_

## Impact

| File | Change |
|---|---|
| `packages/shared/src/types/api.types.ts` | Add `VersionListItem` type |
| `apps/api/src/routes/versions.routes.ts` | Implement all three routes |
| `apps/api/src/services/versions.service.ts` | New file — all business logic |
| `apps/api/src/routes/notes.routes.ts` | Add `notesRouter.use('/:id/versions', versionsRouter)` |

**No DB migration needed** — `NoteVersion` table and auto-purge already exist.  
**No new error codes needed** — all errors use existing `NOT_FOUND`.  
**No new Zod schemas needed** — all inputs are path params only (no request body).
