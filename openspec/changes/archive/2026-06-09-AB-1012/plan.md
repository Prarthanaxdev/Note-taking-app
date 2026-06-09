# Plan — AB-1012: Note Editor Page (Frontend)

## Pre-condition

**AB-1011 must be merged (or rebased) into this branch before implementation begins.**
AB-1012 imports `AppShell` from `components/layout/AppShell.tsx` which AB-1011 creates.
If AB-1011 is not yet merged: run `git merge feature/AB-1011-notes-ui` before starting T-05.

---

## File Map

| File | Action | Depends on |
|---|---|---|
| `apps/web/src/hooks/useNotes.ts` | New | — |
| `apps/web/src/hooks/useTags.ts` | New | — |
| `apps/web/src/components/editor/NoteEditor.tsx` | New | T-01, T-02, T-03 |
| `apps/web/src/components/editor/EditorToolbar.tsx` | New | T-01 |
| `apps/web/src/components/editor/SaveStatusIndicator.tsx` | New | T-01 |
| `apps/web/src/components/tags/TagCombobox.tsx` | New | T-01, T-03 |
| `apps/web/src/components/share/ShareModal.tsx` | New (stub) | T-01 |
| `apps/web/src/components/versions/VersionDrawer.tsx` | New (stub) | T-01 |
| `apps/web/src/pages/notes/NoteEditorPage.tsx` | New | All components |
| `apps/web/src/App.tsx` | Modify | AppShell (AB-1011) |
| `apps/web/src/hooks/__tests__/useNotes.test.ts` | New | T-02 |
| `apps/web/src/hooks/__tests__/useTags.test.ts` | New | T-03 |

---

## TypeScript Interfaces (Final Shapes)

### `hooks/useNotes.ts`

```typescript
// Exported types (matches SDS NoteListQuerySchema)
export type SortBy = 'createdAt' | 'updatedAt' | 'title';
export type SortOrder = 'asc' | 'desc';

export interface NoteListParams {
  page: number;
  limit: number;
  sortBy: SortBy;
  sortOrder: SortOrder;
  tags?: string;
}

// Internal — useUpdateNote mutation input
interface UpdateNoteInput {
  id: string;
  title?: string;
  content?: object | null;
  tagIds?: string[];
}

// Exports
export function useNotes(params: NoteListParams): UseQueryResult<{ data: NoteListItem[]; meta: PaginationMeta }>
export function useNote(id: string): UseQueryResult<NoteDetail>
export function useCreateNote(): UseMutationResult<NoteDetail, unknown, { title: string }>
export function useUpdateNote(): UseMutationResult<NoteDetail, unknown, UpdateNoteInput>
export function useDeleteNote(): UseMutationResult<void, unknown, string>
```

`useNote` query key: `['notes', id]` (string) — distinct from `['notes', params]` (object) so they
don't collide.

`useUpdateNote.onSuccess`: calls both `qc.setQueryData(['notes', note.id], note)` (update detail
cache immediately) and `qc.invalidateQueries({ queryKey: ['notes'] })` (invalidate list).

### `hooks/useTags.ts`

```typescript
export function useTags(): UseQueryResult<TagWithCount[]>
export function useCreateTag(): UseMutationResult<TagSummary, unknown, { name: string }>
```

`useCreateTag.onSuccess`: `qc.invalidateQueries({ queryKey: ['tags'] })`.

### `components/editor/NoteEditor.tsx`

```typescript
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface NoteEditorProps {
  noteId: string;
  initialContent: object | null;
  title: string;      // lifted from NoteEditorPage — included in autosave payload
  tagIds: string[];   // lifted from NoteEditorPage — included in autosave payload
  onStatusChange: (s: SaveStatus) => void;
  onRetry: () => void;
}
```

Autosave lifecycle owned entirely by `NoteEditor`. The `onStatusChange` callback notifies
`NoteEditorPage` so `SaveStatusIndicator` in the header can reflect it. The `onRetry` callback
is wired by `NoteEditorPage` to the retry button rendered inside `SaveStatusIndicator`.

`isDirty` detection: store initial values in `useRef`; compare title (`===`) and content
(`JSON.stringify`). On successful save, update the refs.

```typescript
const savedTitleRef   = useRef(title);         // set once from initial prop
const savedContentRef = useRef(JSON.stringify(initialContent));

// Inside NoteEditor, after TipTap onUpdate:
const contentJson = editor.getJSON();
const isDirty =
  title !== savedTitleRef.current ||
  JSON.stringify(contentJson) !== savedContentRef.current;
```

`useEffect` dep array: `[title, JSON.stringify(contentSnapshot), tagIds.join(',')]`
— stable serialization avoids object-identity re-renders.

`beforeunload` effect:
```typescript
useEffect(() => {
  if (status !== 'error') return;
  const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [status]);
```

### `components/editor/EditorToolbar.tsx`

```typescript
interface EditorToolbarProps {
  editor: Editor | null;
}
```

Uses `editor.chain().focus().<command>().run()` for each action.
Uses `editor.isActive('<mark>')` for active/inactive button state.
Buttons: Bold · Italic · Underline · H1 · H2 · H3 · BulletList · OrderedList · Blockquote · CodeBlock.

### `components/editor/SaveStatusIndicator.tsx`

```typescript
import type { SaveStatus } from './NoteEditor.js';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
  onRetry: () => void;
}
```

Renders `null` when `status === 'idle'`. Spinner when `'saving'`. Check icon when `'saved'`.
Red ✕ + "Retry" button when `'error'`. Uses `Loader2`, `Check`, `AlertCircle` from `lucide-react`.

### `components/tags/TagCombobox.tsx`

```typescript
interface TagComboboxProps {
  selectedTagIds: string[];
  onChange: (ids: string[]) => void;
}
```

Internal state: `open: boolean`, `search: string`.
Filtering: `allTags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))`.
Inline-create shown when `search.length > 0` and no exact name match (case-insensitive) exists.
Max-5 guard: when `selectedTagIds.length >= 5`, unselected items get `aria-disabled` + opacity.

### `components/share/ShareModal.tsx` (stub)

```typescript
interface ShareModalProps {
  noteId: string;   // future use by AB-1014
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

### `components/versions/VersionDrawer.tsx` (stub)

```typescript
interface VersionDrawerProps {
  noteId: string;   // future use by AB-1015
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Uses shadcn `<Sheet side="right">`.

### `pages/notes/NoteEditorPage.tsx`

```typescript
// Internal state only — no exported types
type NoteEditorPageState = {
  title: string;
  tagIds: string[];
  status: SaveStatus;
  shareOpen: boolean;
  historyOpen: boolean;
};
```

Reads `:id` from `useParams<{ id: string }>()`. Redirects to `/notes` when `isError` (404).
Does NOT render editor until `isSuccess` (avoids flicker).

---

## Architecture Decisions

### 1. NoteEditor owns autosave; NoteEditorPage owns layout state

`NoteEditor` runs the `setTimeout` / `clearTimeout` debounce internally. `NoteEditorPage`
owns `title`, `tagIds`, `status`, `shareOpen`, `historyOpen` and wires the retry handler.
Rationale: keeps the TipTap `editor` instance colocated with the autosave effect (they share
the `useEditor` scope); title and tagIds are props so changes upstream naturally re-trigger
the effect.

### 2. `useEditor` initialised once, never re-initialised

Pass `content: initialContent ?? ''` as the first argument to `useEditor` and leave `content`
out of the TipTap `extensions` options update path. TipTap manages its own internal state.
Rationale: re-initialising TipTap resets cursor position and loses undo history.

### 3. Stable serialization in `useEffect` dep array

`JSON.stringify(editor.getJSON())` inside the dep array would run every render. Instead,
listen to TipTap's `onUpdate` callback to snapshot content into a `useState` or `useRef`,
then reference that snapshot in the `useEffect`. This prevents infinite re-render loops.

The pattern:
```typescript
const [contentSnapshot, setContentSnapshot] = useState(
  () => JSON.stringify(initialContent ?? {})
);

// In useEditor extensions config:
// onUpdate: ({ editor }) => setContentSnapshot(JSON.stringify(editor.getJSON()))
```

Then the autosave effect dep array is `[title, contentSnapshot, tagIds.join(',')]` — all
primitives, no object-identity issues.

### 4. Tag changes batched into autosave — no immediate PATCH

When the user selects/deselects a tag, `NoteEditorPage` updates `tagIds`. The `NoteEditor`
autosave effect dep array includes `tagIds.join(',')`, so a 2-second timer fires. This satisfies
the spec requirement without an extra PATCH on every tag click.

One edge case: if the user changes a tag but does NOT change title/content, `isDirty` must
still fire. Solution: expand `isDirty` to also compare `tagIds`:
```typescript
const savedTagIdsRef = useRef(initialTagIds.slice().sort().join(','));
const isDirty = ... || tagIds.slice().sort().join(',') !== savedTagIdsRef.current;
```

### 5. No shared package changes

All required types (`NoteDetail`, `TagSummary`, `TagWithCount`, `PaginationMeta`) and schemas
(`UpdateNoteSchema`, `CreateTagSchema`) already exist in `packages/shared`. No new error codes.

### 6. shadcn components to add on this branch

`button`, `badge`, `dialog`, `sheet`, `popover`, `command` — via `pnpm dlx shadcn@latest add`.
`class-variance-authority` — manually via `pnpm --filter web add class-variance-authority`
(shadcn peer dep not auto-resolved by pnpm in this workspace).

---

## No DB Changes

This is a pure frontend ticket. All API endpoints used already exist.

---

## Reuse of Existing Code

| Existing | Reused in |
|---|---|
| `apiClient` (axios instance + interceptors) | All new hooks |
| `cn()` utility in `lib/utils.ts` | All components |
| `useAuthStore` | AppShell (from AB-1011) |
| `AppShell` (from AB-1011) | App.tsx `/notes/:id` route |
| `NoteListParams`, `SortBy`, `SortOrder` | `useNotes.ts` (defined here, reused by NotesListPage) |
| `vi.mock('../../lib/apiClient.js')` pattern | `useNotes.test.ts`, `useTags.test.ts` |

---

## Phase Breakdown & Checkpoints

### Phase 1 — Setup (T-01 through T-03, all parallel)

**T-01**: Install shadcn components + peer deps
```bash
cd apps/web
pnpm dlx shadcn@latest add button badge dialog sheet popover command separator
pnpm --filter web add class-variance-authority
```
Verify: `src/components/ui/` now contains `button.tsx`, `badge.tsx`, `dialog.tsx`, `sheet.tsx`,
`popover.tsx`, `command.tsx`, `separator.tsx`.

**T-02**: Create `apps/web/src/hooks/useNotes.ts`
Exports: `useNotes`, `useNote`, `useCreateNote`, `useUpdateNote`, `useDeleteNote`.
Uses `['notes', id]` for detail query key and `['notes', params]` for list.

**T-03**: Create `apps/web/src/hooks/useTags.ts`
Exports: `useTags`, `useCreateTag`.

**Phase 1 checkpoint:**
```bash
pnpm --filter web build   # must pass — 0 type errors
```

---

### Phase 2 — Components (T-04 through T-09, all parallel after Phase 1)

**T-04**: Create `apps/web/src/components/editor/SaveStatusIndicator.tsx`

**T-05**: Create `apps/web/src/components/editor/EditorToolbar.tsx`
Extensions used from `@tiptap/starter-kit`: Bold, Italic, Heading, BulletList, OrderedList,
Blockquote, CodeBlock. From `@tiptap/extension-underline`: Underline.

**T-06**: Create `apps/web/src/components/editor/NoteEditor.tsx`
Autosave pattern per SDS section 6.4. `useEditor` with `StarterKit + Underline`.
`EditorContent` from `@tiptap/react`.

**T-07**: Create `apps/web/src/components/tags/TagCombobox.tsx`
Uses `<Popover>` + `<Command>` from shadcn. Calls `useTags()` and `useCreateTag()`.

**T-08**: Create `apps/web/src/components/share/ShareModal.tsx` (stub)

**T-09**: Create `apps/web/src/components/versions/VersionDrawer.tsx` (stub)

**Phase 2 checkpoint:**
```bash
pnpm --filter web lint    # 0 errors
pnpm --filter web build   # 0 type errors
```

---

### Phase 3 — Page + Routing (sequential after Phase 2)

**T-10**: Create `apps/web/src/pages/notes/NoteEditorPage.tsx`
Reads `useParams<{ id: string }>()`. Loading skeleton. 404 redirect. Composes all editor
components. Manages `title`, `tagIds`, `status`, `shareOpen`, `historyOpen` state.

**T-11**: Update `apps/web/src/App.tsx`
Replace `/notes/:id` placeholder with `<RequireAuth><AppShell><NoteEditorPage /></AppShell></RequireAuth>`.
Also wire `/notes` and `/search` with AppShell + TODO placeholders (required on this branch
since AB-1011 hasn't merged here; merged with AB-1011 these become a clean union).

**Phase 3 checkpoint:**
```bash
pnpm -r lint    # all packages — 0 errors
pnpm -r build   # all packages — 0 type errors
```

---

### Phase 4 — Tests (T-12 + T-13, parallel)

**T-12**: Create `apps/web/src/hooks/__tests__/useNotes.test.ts`
Pattern: `vi.mock('../../lib/apiClient.js')` + `makeWrapper()` (fresh `QueryClient`).

| ID | Hook | Scenario |
|---|---|---|
| NOTE-HOOK-01 | `useNotes` | Calls `GET /notes` with params; returns list + meta |
| NOTE-HOOK-02 | `useNote` | Calls `GET /notes/:id`; returns `NoteDetail` |
| NOTE-HOOK-03 | `useCreateNote` | Calls `POST /notes`; returns new `NoteDetail` |
| NOTE-HOOK-04 | `useUpdateNote` | Calls `PATCH /notes/:id` with payload; returns updated `NoteDetail` |
| NOTE-HOOK-05 | `useDeleteNote` | Calls `DELETE /notes/:id`; 204 no content |

**T-13**: Create `apps/web/src/hooks/__tests__/useTags.test.ts`

| ID | Hook | Scenario |
|---|---|---|
| TAG-HOOK-01 | `useTags` | Calls `GET /tags`; returns `TagWithCount[]` |
| TAG-HOOK-02 | `useCreateTag` | Calls `POST /tags` with `{ name }`; returns `TagSummary` |
| TAG-HOOK-03 | `useCreateTag` | Invalidates `['tags']` query on success |

**Phase 4 checkpoint:**
```bash
pnpm --filter web test   # all tests pass (17 existing AB-1010 + 8 new = 25 total)
```

---

### Phase 5 — Final Quality Gates

```bash
pnpm -r lint           # 1. Lint — all packages clean
pnpm -r build          # 2. Type-check + build — 0 errors
pnpm --filter web test # 3. Tests — 25 tests passing
```

---

## Spec Scenario → Test Mapping

| Spec Scenario | Test ID | Type |
|---|---|---|
| Editor initialises with persisted content | Manual / E2E (AB-1016) | — |
| Autosave fires 2s after title change | NOTE-HOOK-04 (unit) | Hook |
| Autosave fires 2s after content change | NOTE-HOOK-04 (unit) | Hook |
| Status 'Saved' after successful autosave | NOTE-HOOK-04 onSuccess | Hook |
| Status 'Error saving' after failed autosave | NOTE-HOOK-04 onError | Hook |
| No autosave when content unchanged | isDirty check — unit | Hook |
| User selects existing tag | TAG-HOOK-01 (list) | Hook |
| Inline create: POST /tags + immediate add | TAG-HOOK-02/03 | Hook |
| `beforeunload` when status='error' | FRS-FE-23 / E2E (AB-1016) | E2E |
| 404 redirect | NOTE-HOOK-02 error path | Hook |

---

## Open Questions / Assumptions

- `POST /tags` returns a `TagSummary` (id, name, color). The `TagCombobox` converts it to the
  selection immediately. `useCreateTag` invalidates `['tags']` which re-fetches `GET /tags`
  (returning `TagWithCount`). Both representations are used without conflict.
- `UpdateNoteSchema` is `CreateNoteSchema.partial()` — `{ title?, content?, tagIds? }`. All
  fields sent on every autosave (no partial updates omitting unchanged fields).
- TipTap `useEditor` is not re-rendered when the component re-renders; the editor is stable
  across parent state changes for `title`/`tagIds`. Only `initialContent` feeds into TipTap init.
