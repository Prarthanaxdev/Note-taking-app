# Proposal — AB-1015: Version History Drawer (Frontend)

## Summary

Replace the `VersionDrawer` stub (added in AB-1012) with a full version history
implementation:

1. **`VersionDetail` type** — add to `packages/shared/src/types/api.types.ts` to match
   the `GET /notes/:id/versions/:vid` API response shape.
2. **`useVersions` hook** — three TanStack Query operations: `useVersionList`,
   `useVersionDetail`, `useRestoreVersion`.
3. **`VersionPreview` component** — reads a single version and renders its content in a
   standalone read-only TipTap editor (no autosave, no toolbar).
4. **`VersionDrawer` full implementation** — replaces the stub; single-pane drill-down:
   list view → click to preview → Back returns to list.

The backend version endpoints (`GET /notes/:id/versions`,
`GET /notes/:id/versions/:vid`, `POST /notes/:id/versions/:vid/restore`) were
implemented in AB-1009 and are already live.

---

## Capabilities

| Capability | Spec file |
|---|---|
| `version-history-drawer` | `specs/version-history-drawer/spec.md` |

---

## Files Changed

### Modified files

| File | Change |
|---|---|
| `packages/shared/src/types/api.types.ts` | Add `VersionDetail` type |
| `apps/web/src/components/versions/VersionDrawer.tsx` | Replace stub with full implementation |

### New files

| File | Purpose |
|---|---|
| `apps/web/src/hooks/useVersions.ts` | `useVersionList`, `useVersionDetail`, `useRestoreVersion` hooks |
| `apps/web/src/components/versions/VersionPreview.tsx` | Read-only TipTap render of a single version |
| `apps/web/src/hooks/__tests__/useVersions.test.ts` | Unit tests for all three hooks |

---

## Key Design Decisions

### Single-pane drill-down UX
The drawer shows either the version list OR the preview, never both simultaneously.
This fits the existing `w-80` (320px) drawer width without layout changes.

- **List state**: `selectedVersionId === null` — renders scrollable list of version rows
- **Preview state**: `selectedVersionId !== null` — renders `VersionPreview` with a
  "← Back" header button and "Restore this version" footer button

State is local to `VersionDrawer` (`useState<string | null>(null)`), reset to `null`
when the drawer closes (`onOpenChange(false)`).

### `VersionPreview` — standalone read-only TipTap
`NoteEditor` is tightly coupled to autosave (`useUpdateNote`, debounce, dirty-state
tracking). Adding a `readOnly` prop would require conditional logic throughout.
Instead, `VersionPreview` calls `useEditor` directly with `editable: false` and
renders only `<EditorContent>` — no toolbar, no status, no save logic.

```tsx
const editor = useEditor({
  extensions: [StarterKit, Underline],
  content: version.content ?? '',
  editable: false,
});
```

### `useVersionDetail` — fetch only when previewing
`useVersionDetail(noteId, versionId)` is enabled only when `versionId` is non-null.
This avoids fetching the full version content until the user clicks a list item.

### Query key strategy
| Operation | Query key |
|---|---|
| List | `['versions', noteId]` |
| Detail | `['versions', noteId, versionId]` |
| Invalidate after restore | `['notes', noteId]` + `['versions', noteId]` |

Restore invalidates both `['notes', noteId]` (so the editor refreshes with restored
content) and `['versions', noteId]` (so the drawer list refreshes with the new
snapshot created by the restore).

### "Current" version identification
The API returns versions sorted `savedAt DESC`. The first item (`versions[0]`) is
always the most recent save — labeled "Current", no Restore button shown
(FRS-FE-36).

### Restore confirmation
Uses `AlertDialog` (shadcn, already installed from AB-1014). Consistent with the
revoke confirmation pattern in `ShareLinkRow`.

### `VersionDetail` type location
Added to `packages/shared/src/types/api.types.ts`, consistent with all other API
response types. `VersionListItem` already lives there.

---

## Interface Contracts

```typescript
// packages/shared/src/types/api.types.ts (ADD)
export type VersionDetail = {
  id: string;
  title: string;
  content: object | null;
  savedAt: string;
};
```

```typescript
// hooks/useVersions.ts
export function useVersionList(noteId: string)
// GET /notes/:id/versions → VersionListItem[]
// queryKey: ['versions', noteId]

export function useVersionDetail(noteId: string, versionId: string | null)
// GET /notes/:id/versions/:vid → VersionDetail
// queryKey: ['versions', noteId, versionId]
// enabled: versionId !== null

export function useRestoreVersion(noteId: string)
// POST /notes/:id/versions/:vid/restore → NoteDetail
// mutationFn: (versionId: string) => ...
// onSuccess: invalidate ['notes', noteId] + ['versions', noteId]
```

```typescript
// components/versions/VersionPreview.tsx
interface VersionPreviewProps {
  noteId: string;
  versionId: string;
  isCurrentVersion: boolean;
  onBack: () => void;
  onRestored: () => void;  // called after successful restore (closes drawer or returns to list)
}
```

```typescript
// components/versions/VersionDrawer.tsx (full)
interface VersionDrawerProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
// Internal state: selectedVersionId: string | null
// Reset to null when onOpenChange(false) is called
```

---

## Dependencies

- AB-1009 (backend versions): `GET /notes/:id/versions`, `GET /notes/:id/versions/:vid`,
  `POST /notes/:id/versions/:vid/restore` — already implemented
- AB-1012 (VersionDrawer stub): already in the component tree; this ticket replaces its body
- `packages/shared`: `VersionListItem` already exported; `VersionDetail` to be added
- shadcn `AlertDialog`: already installed (AB-1014)
- TipTap packages (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-underline`):
  already installed (used by `NoteEditor`)

---

## Out of Scope

- `PublicNotePage` (`/public/:token`) — separate ticket
- Version diff / side-by-side comparison — not in FRS
- Auto-purge UI (FRS is silent on surfacing the 50-version limit to the user)
