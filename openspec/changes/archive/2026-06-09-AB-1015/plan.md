# Plan — AB-1015: Version History Drawer (Frontend)

## Overview

Full implementation of the version history drawer. Five units: add `VersionDetail` type
to `packages/shared`, create `useVersions.ts` hook, create `VersionPreview.tsx`,
replace the `VersionDrawer` stub, and write `useVersions.test.ts`. No new shadcn
components, no API changes, no DB migrations.

---

## Phase 0 — Shared Type

**File:** `packages/shared/src/types/api.types.ts` (modify)

Add `VersionDetail` after `VersionListItem`:

```ts
export type VersionDetail = {
  id: string;
  title: string;
  content: object | null;
  savedAt: string;
};
```

`index.ts` already `export *`s from `api.types.js` — no further changes needed.

**Checkpoint 0:**
```bash
pnpm -r build     # shared + api + web all compile with the new type
pnpm -r lint
```

---

## Phase 1 — Hook

**File:** `apps/web/src/hooks/useVersions.ts` (new)

```ts
export function useVersionList(noteId: string)         // GET /notes/:id/versions
export function useVersionDetail(noteId, versionId)    // GET /notes/:id/versions/:vid — enabled only when versionId != null
export function useRestoreVersion(noteId: string)      // POST /notes/:id/versions/:vid/restore
                                                       // onSuccess: invalidate ['notes', noteId] + ['versions', noteId]
```

All imports from `'shared'`, `'@tanstack/react-query'`, `'../lib/apiClient.js'`.

**Checkpoint 1:**
```bash
pnpm --filter web build
pnpm --filter web lint
```

---

## Phase 2 — Components [PARALLEL after Phase 1]

### T-02a: `VersionPreview.tsx` (new)

**File:** `apps/web/src/components/versions/VersionPreview.tsx`

- Props: `{ noteId, versionId, isCurrentVersion, onBack, onRestored }`
- Calls `useVersionDetail(noteId, versionId)` and `useRestoreVersion(noteId)`
- While loading: skeleton (4 pulse lines — one for title, three for content)
- Loaded: version title in `<h2>`, then `<EditorContent>` with a `useEditor` instance
  (`editable: false`, `extensions: [StarterKit, Underline]`, `content: version.content ?? ''`)
- Footer: "Restore this version" button (hidden when `isCurrentVersion === true`) that
  opens an `AlertDialog`
- AlertDialog: warns "This will replace the current note content."
  - Cancel: closes dialog, no request
  - Restore: calls `restoreVersion.mutate(versionId)`, on success: calls `onRestored()`
  - While `restoreVersion.isPending`: button disabled with spinner

### T-02b: `VersionDrawer.tsx` (replace stub)

**File:** `apps/web/src/components/versions/VersionDrawer.tsx`

- Props unchanged: `{ noteId, open, onOpenChange }`
- Internal state: `selectedVersionId: string | null` (initially `null`)
- `handleOpenChange(v: boolean)`: if `!v` reset `selectedVersionId` to `null`, then
  call `onOpenChange(v)` — ensures reopen always starts at list view
- Calls `useVersionList(noteId)` only in list view
- **List view** (`selectedVersionId === null`):
  - `SheetTitle`: "Version history"
  - Loading: 3 skeleton rows
  - Empty: `<p>No version history yet.</p>`
  - Rows: `versions.map((v, i) => <VersionRow>)` where index 0 = current (labeled
    "Current", not clickable for preview); index 1+ = clickable buttons
    `onClick={() => setSelectedVersionId(v.id)}`
- **Preview view** (`selectedVersionId !== null`):
  - `SheetTitle`: `<button onClick={handleBack}>← Back</button>` replacing the title
  - Renders `<VersionPreview noteId={noteId} versionId={selectedVersionId}
      isCurrentVersion={selectedVersionId === versions?.[0]?.id}
      onBack={() => setSelectedVersionId(null)}
      onRestored={() => onOpenChange(false)} />`

**Checkpoint 2:**
```bash
pnpm --filter web build
pnpm --filter web lint
```

---

## Phase 3 — Tests

**File:** `apps/web/src/hooks/__tests__/useVersions.test.ts` (new)

Pattern: same as `useShares.test.ts` — `vi.mock('../../lib/apiClient.js', ...)` with
`get`, `post` mocks; `makeWrapper()` (fresh `QueryClient`, `retry: false`);
`beforeEach` resets all mocks.

| Test ID | Spec scenario | What it verifies |
|---|---|---|
| VER-HOOK-01 | Drawer opens and lists versions | `useVersionList` calls `GET /notes/:id/versions`, returns `VersionListItem[]` |
| VER-HOOK-02 | Clicking a version opens preview | `useVersionDetail` calls `GET /notes/:id/versions/:vid` when versionId non-null |
| VER-HOOK-03 | `useVersionDetail` disabled when null | Query does NOT fire when `versionId === null` |
| VER-HOOK-04 | Confirming restore posts + invalidates notes | `useRestoreVersion.mutate('ver-1')` calls `POST .../restore`, invalidates `['notes', noteId]` |
| VER-HOOK-05 | Confirming restore invalidates versions | `useRestoreVersion.onSuccess` also invalidates `['versions', noteId]` |

**Checkpoint 3 (final):**
```bash
pnpm --filter web test     # VER-HOOK-01 through VER-HOOK-05 all green
pnpm --filter web build
pnpm --filter web lint
```

---

## Spec Scenario → Implementation Coverage

| Spec scenario | Implementation location |
|---|---|
| Drawer opens and lists versions | VersionDrawer list view + VER-HOOK-01 |
| First row labeled "Current", no Restore | VersionDrawer: `index === 0` → non-clickable "Current" label |
| Empty state | VersionDrawer: `versions.length === 0` branch |
| Loading skeleton (list) | VersionDrawer: `isLoading` branch (3 skeleton rows) |
| Clicking version opens preview | VersionDrawer: `setSelectedVersionId(v.id)` + VER-HOOK-02 |
| Back button returns to list | VersionPreview `onBack` → `setSelectedVersionId(null)` |
| Preview loading skeleton | VersionPreview: `isLoading` branch (4 skeleton lines) |
| Restore requires confirmation | VersionPreview: AlertDialog trigger — no POST until confirm |
| Confirming restore invalidates queries | VER-HOOK-04 + VER-HOOK-05 |
| Confirming restore closes drawer | VersionPreview `onRestored` → `onOpenChange(false)` |
| Cancelling restore leaves note unchanged | AlertDialogCancel — no mutation |
| Restore button shows loading state | `restoreVersion.isPending` disables button + spinner |
| Reopening drawer starts at list | VersionDrawer `handleOpenChange`: resets `selectedVersionId` to `null` |

---

## Files Summary

| File | Action |
|---|---|
| `packages/shared/src/types/api.types.ts` | Modify — add `VersionDetail` |
| `apps/web/src/hooks/useVersions.ts` | Create |
| `apps/web/src/components/versions/VersionPreview.tsx` | Create |
| `apps/web/src/components/versions/VersionDrawer.tsx` | Replace stub |
| `apps/web/src/hooks/__tests__/useVersions.test.ts` | Create |

No changes to `App.tsx`, `NoteEditorPage.tsx`, `packages/shared/src/index.ts`,
`apps/api`, or any other file.
