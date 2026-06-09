# Design — AB-1015: Version History Drawer (Frontend)

## Architecture

Five units across three packages. No new shadcn components, no new API routes,
no DB migrations.

```
packages/shared/src/types/
  api.types.ts                    ← add VersionDetail type + re-export

apps/web/src/
  hooks/
    useVersions.ts                ← new: three TanStack Query operations
    __tests__/
      useVersions.test.ts         ← new: unit tests
  components/versions/
    VersionPreview.tsx            ← new: read-only TipTap render of one version
    VersionDrawer.tsx             ← replace stub: single-pane list → preview
```

---

## TypeScript Interfaces

### `VersionDetail` (packages/shared — ADD)

```ts
export type VersionDetail = {
  id: string;
  title: string;
  content: object | null;
  savedAt: string;
};
```

Matches `GET /notes/:id/versions/:vid` response per SDS §5 endpoint table.
`VersionListItem` (`{ id, savedAt }`) already exported from the same file.

### `hooks/useVersions.ts` exports

```ts
import type { VersionListItem, VersionDetail, NoteDetail } from 'shared';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient.js';

export function useVersionList(noteId: string): UseQueryResult<VersionListItem[]>
// queryKey: ['versions', noteId]
// queryFn: GET /notes/:id/versions → VersionListItem[]

export function useVersionDetail(noteId: string, versionId: string | null): UseQueryResult<VersionDetail>
// queryKey: ['versions', noteId, versionId]
// enabled: versionId !== null
// queryFn: GET /notes/:id/versions/:vid → VersionDetail

export function useRestoreVersion(noteId: string): UseMutationResult<NoteDetail, unknown, string>
// mutationFn: (versionId: string) => POST /notes/:id/versions/:vid/restore → NoteDetail
// onSuccess: invalidate ['notes', noteId] AND ['versions', noteId]
```

### `components/versions/VersionPreview.tsx`

```ts
interface VersionPreviewProps {
  noteId: string;
  versionId: string;
  isCurrentVersion: boolean;   // true → hide Restore button
  onBack: () => void;
  onRestored: () => void;      // called on restore success (closes drawer)
}
```

Internal state:
- `restoreOpen: boolean` — AlertDialog open/close

### `components/versions/VersionDrawer.tsx` (full)

```ts
// Props unchanged from stub:
interface VersionDrawerProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Internal state:
- `selectedVersionId: string | null` — `null` = list view, non-null = preview view
- Reset to `null` in `handleOpenChange(false)` so reopening always starts at the list

---

## Key Design Decisions

### Single-pane state machine

The drawer has two UI states keyed on `selectedVersionId`:

```
null            → list view (useVersionList, renders VersionRow items)
'<vid>'         → preview view (VersionPreview component with that versionId)
```

Transition: `setSelectedVersionId(version.id)` on row click
Back: `setSelectedVersionId(null)`
Close: `handleOpenChange(false)` → resets to `null`, then calls `onOpenChange(false)`

This avoids any router state, URL params, or `useEffect`-driven navigation. Pure
local state in the drawer component.

### `VersionPreview` owns its own TipTap instance

`NoteEditor` is coupled to `useUpdateNote`, dirty-state tracking, and autosave.
Adding a `readOnly` prop would require threading conditional logic throughout all of
that. `VersionPreview` instead calls `useEditor` directly:

```ts
const editor = useEditor({
  extensions: [StarterKit, Underline],
  content: version.content ?? '',
  editable: false,
});
```

The `editorProps.attributes.class` mirrors `NoteEditor` for visual consistency:
`'prose max-w-none p-4'` (no `focus:outline-none` needed on read-only).

### `useVersionDetail` only fetches when a version is selected

```ts
useQuery({
  queryKey: ['versions', noteId, versionId],
  queryFn: () => apiClient.get(`/notes/${noteId}/versions/${versionId}`).then(r => r.data),
  enabled: versionId !== null,
});
```

This prevents network requests while the user is on the list view. TanStack Query
caches each fetched version — navigating back and re-selecting the same version
returns the cached result instantly.

### Restore invalidation — two queries

```ts
onSuccess: () => {
  qc.invalidateQueries({ queryKey: ['notes', noteId] });    // editor refreshes
  qc.invalidateQueries({ queryKey: ['versions', noteId] }); // list shows new snapshot
}
```

`['notes', noteId]` is the scalar key pattern used by `useNote` (matches
`queryKey: ['notes', id]` in `useNotes.ts`). Invalidating it causes `NoteEditorPage`
to re-render with the restored content.

### "Current" version — index 0

API returns versions sorted `savedAt DESC`. `versions[0]` is always the latest.
No comparison with `note.updatedAt` is needed — the sort order is the source of truth.

### AlertDialog for restore (already installed)

`AlertDialog` is already in `apps/web/src/components/ui/alert-dialog.tsx` from
AB-1014. Import pattern: `from '../ui/alert-dialog.js'`.

### Drawer width unchanged (`w-80`)

Single-pane design fits `w-80` (320 px) without any layout changes. No prop changes
to `NoteEditorPage`.

---

## Version Row display

```tsx
// Non-current row
<button onClick={() => setSelectedVersionId(version.id)}>
  {new Date(version.savedAt).toLocaleString()}
</button>

// Current row (index 0)
<div className="flex items-center justify-between">
  <span>{new Date(version.savedAt).toLocaleString()}</span>
  <span className="text-xs text-gray-400 font-medium">Current</span>
</div>
```

No Restore button on any list row — Restore lives only in the preview pane.

---

## Loading / Empty states

| Location | State | Render |
|---|---|---|
| List view | `isLoading` | 3 pulse skeleton rows |
| List view | `versions.length === 0` | `<p>No version history yet.</p>` |
| Preview view | `isLoading` | 4 pulse skeleton lines (title + 3 content lines) |

---

## No Changes Required

- `packages/shared/src/index.ts` — already `export * from './types/api.types.js'`;
  adding `VersionDetail` to `api.types.ts` is automatically re-exported
- `apps/api` — version endpoints live (AB-1009)
- `App.tsx` — no new routes
- `NoteEditorPage` — already wires `<VersionDrawer noteId={note.id} ...>`;
  `VersionDrawerProps` interface is unchanged
