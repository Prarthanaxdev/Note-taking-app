# Tasks — AB-1015: Version History Drawer (Frontend)

## Phase 0 — Foundation: Shared Type

- [x] **T-00** Add `VersionDetail` to `packages/shared/src/types/api.types.ts`
  ```ts
  export type VersionDetail = {
    id: string;
    title: string;
    content: object | null;
    savedAt: string;
  };
  ```
  Add after the existing `VersionListItem` type. No changes to `index.ts` needed
  (`export *` already picks it up).

**Checkpoint 0:**
```bash
pnpm -r build     # shared + api + web all compile — 0 errors
pnpm -r lint
```

---

## Phase 1 — Hook

- [x] **T-01** Create `apps/web/src/hooks/useVersions.ts`
  - Export `useVersionList(noteId: string)` — queryKey `['versions', noteId]`,
    queryFn `GET /notes/:id/versions` → `VersionListItem[]`
  - Export `useVersionDetail(noteId: string, versionId: string | null)` — queryKey
    `['versions', noteId, versionId]`, queryFn `GET /notes/:id/versions/:vid` →
    `VersionDetail`, **`enabled: versionId !== null`**
  - Export `useRestoreVersion(noteId: string)` — mutationFn
    `POST /notes/:id/versions/:vid/restore` → `NoteDetail`, onSuccess invalidates
    `['notes', noteId]` AND `['versions', noteId]`
  - Imports: `VersionListItem`, `VersionDetail`, `NoteDetail` from `'shared'`;
    `apiClient` from `'../lib/apiClient.js'`

**Checkpoint 1:**
```bash
pnpm --filter web build
pnpm --filter web lint
```

---

## Phase 2 — Components [PARALLEL after T-01]

- [x] **T-02** Create `apps/web/src/components/versions/VersionPreview.tsx`
  - Props: `{ noteId: string; versionId: string; isCurrentVersion: boolean; onBack: () => void; onRestored: () => void }`
  - Calls `useVersionDetail(noteId, versionId)` and `useRestoreVersion(noteId)`
  - Loading: 4 pulse skeleton lines (one taller for title, three for content)
  - Loaded: version `title` in `<h2>`, then `<EditorContent>` from a `useEditor`
    instance: `{ extensions: [StarterKit, Underline], content: version.content ?? '', editable: false }`
    with `editorProps.attributes.class: 'prose max-w-none p-4'`
  - Footer: "Restore this version" `Button` — hidden when `isCurrentVersion === true`
  - AlertDialog for restore confirmation: warns "This will replace the current note content."
    - Cancel → closes dialog, no request
    - Restore → `restoreVersion.mutate(versionId)`, `onSuccess: onRestored()`
    - While `restoreVersion.isPending`: Restore action button disabled + spinner
  - Internal state: `restoreOpen: boolean`

- [x] **T-03** Replace stub in `apps/web/src/components/versions/VersionDrawer.tsx`
  - Props unchanged: `{ noteId: string; open: boolean; onOpenChange: (open: boolean) => void }`
  - Internal state: `selectedVersionId: string | null` (initially `null`)
  - `handleOpenChange(v: boolean)`: reset `selectedVersionId` to `null` when `!v`,
    then call `onOpenChange(v)`
  - Calls `useVersionList(noteId)`
  - **List view** (`selectedVersionId === null`):
    - `SheetTitle`: "Version history"
    - While `isLoading`: 3 pulse skeleton rows
    - `versions.length === 0`: `<p className="...">No version history yet.</p>`
    - `versions.map((v, i) => ...)`:
      - `i === 0`: non-clickable row showing formatted timestamp + "Current" badge
      - `i > 0`: `<button onClick={() => setSelectedVersionId(v.id)}>` with formatted
        `new Date(v.savedAt).toLocaleString()`
  - **Preview view** (`selectedVersionId !== null`):
    - Replace `SheetTitle` with a `<button onClick={() => setSelectedVersionId(null)}>← Back</button>`
    - Render `<VersionPreview noteId={noteId} versionId={selectedVersionId} isCurrentVersion={selectedVersionId === versions?.[0]?.id} onBack={() => setSelectedVersionId(null)} onRestored={() => handleOpenChange(false)} />`

**Checkpoint 2:**
```bash
pnpm --filter web build
pnpm --filter web lint
```

---

## Phase 3 — Tests

- [x] **T-04** Create `apps/web/src/hooks/__tests__/useVersions.test.ts`
  - Setup: `vi.mock('../../lib/apiClient.js', ...)` with `get` and `post` mocks;
    `makeWrapper()` (fresh `QueryClient`, `retry: false`); `beforeEach` resets all mocks
  - Fixtures: `mockVersionList: VersionListItem[]` (2 items), `mockVersionDetail: VersionDetail`

  | Test ID | Spec scenario | Assertion |
  |---|---|---|
  | **VER-HOOK-01** | Drawer opens and lists versions | `useVersionList` calls `GET /notes/note-1/versions`, returns `VersionListItem[]` |
  | **VER-HOOK-02** | Clicking a version opens preview | `useVersionDetail('note-1', 'ver-1')` calls `GET /notes/note-1/versions/ver-1` |
  | **VER-HOOK-03** | Preview loading (disabled when null) | `useVersionDetail('note-1', null)` does NOT call GET; `isLoading === false`, `data === undefined` |
  | **VER-HOOK-04** | Confirming restore posts + invalidates notes | `useRestoreVersion.mutate('ver-1')` calls `POST /notes/note-1/versions/ver-1/restore`; `invalidateQueries` called with `{ queryKey: ['notes', 'note-1'] }` |
  | **VER-HOOK-05** | Confirming restore invalidates versions | `useRestoreVersion.onSuccess` also calls `invalidateQueries` with `{ queryKey: ['versions', 'note-1'] }` |

**Checkpoint 3 (final):**
```bash
pnpm --filter web test     # VER-HOOK-01 through VER-HOOK-05 all green
pnpm --filter web build
pnpm --filter web lint
```

---

## Spec Scenario → Task Mapping

| Spec scenario | Task |
|---|---|
| Drawer opens and lists all versions | T-01 (hook) + T-03 (list render) |
| First row labeled "Current", not clickable | T-03: `i === 0` branch |
| No Restore button in list view | T-03: Restore lives only in VersionPreview |
| Empty state | T-03: `versions.length === 0` branch |
| Loading skeleton (list) | T-03: `isLoading` branch — 3 skeleton rows |
| Clicking version opens preview | T-03: `setSelectedVersionId(v.id)` |
| Preview shows title + read-only content | T-02: `useEditor(editable: false)` + `<h2>` title |
| Back button returns to list | T-02 `onBack` + T-03: `setSelectedVersionId(null)` |
| Preview loading skeleton | T-02: `isLoading` branch — 4 skeleton lines |
| Restore requires confirmation (AlertDialog) | T-02: AlertDialogTrigger — no POST until confirm |
| Confirming restore closes drawer | T-02: `onRestored()` → `handleOpenChange(false)` |
| Confirming restore refreshes editor + list | VER-HOOK-04 + VER-HOOK-05 |
| Cancelling restore leaves note unchanged | T-02: AlertDialogCancel — no mutation |
| Restore button disabled while pending | T-02: `restoreVersion.isPending` |
| Reopening drawer starts at list | T-03: `handleOpenChange` resets `selectedVersionId` |
