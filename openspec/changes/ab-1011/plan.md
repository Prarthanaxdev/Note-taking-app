# Plan — AB-1011: Notes List Page (Frontend)

## Files to Create / Modify

| File | Action |
|---|---|
| `apps/web/src/hooks/useNotes.ts` | New — `useNotes`, `useCreateNote`, `useDeleteNote` |
| `apps/web/src/hooks/useTags.ts` | New — `useTags` |
| `apps/web/src/components/layout/AppShell.tsx` | New — sidebar layout for all protected pages |
| `apps/web/src/components/notes/NoteCard.tsx` | New — single note card with delete dialog |
| `apps/web/src/components/notes/NoteList.tsx` | New — list + empty state + loading skeleton |
| `apps/web/src/components/notes/SortControl.tsx` | New — sort field Select + direction toggle |
| `apps/web/src/components/notes/TagFilter.tsx` | New — checkbox list for tag filtering |
| `apps/web/src/components/notes/Pagination.tsx` | New — prev/next controls |
| `apps/web/src/pages/notes/NotesListPage.tsx` | New — composes all above, owns URL state |
| `apps/web/src/lib/utils.ts` | Modified — add `formatRelativeTime` helper |
| `apps/web/src/App.tsx` | Modified — wrap `/notes` and `/search` in `<AppShell>` |
| `apps/web/src/hooks/__tests__/useNotes.test.ts` | New — 4 unit tests |
| `apps/web/src/hooks/__tests__/useTags.test.ts` | New — 2 unit tests |
| `apps/web/src/components/ui/*` | New (shadcn add: button, dialog, select, badge, checkbox, dropdown-menu, separator) |

**No DB changes. No API changes. No shared type changes.** All required types and schemas exist.

---

## Architecture Decisions

### 1. shadcn components to add (init is already done)

`components.json` is present with the correct config. Only add the components needed:

```bash
pnpm dlx shadcn@latest add button dialog select badge checkbox dropdown-menu separator
```

This generates files under `apps/web/src/components/ui/`. The `cn()` utility in `lib/utils.ts` is already set up and is what shadcn uses.

### 2. `useNotes` query key strategy

The notes list is parameterized by `page`, `sortBy`, `sortOrder`, and `tags`. TanStack Query uses the full params object as the query key so any change triggers a refetch.

```typescript
// hooks/useNotes.ts
export function useNotes(params: NoteListParams) {
  return useQuery({
    queryKey: ['notes', params],
    queryFn: () =>
      apiClient
        .get<{ data: NoteListItem[]; meta: PaginationMeta }>('/notes', { params })
        .then((r) => r.data),
  });
}
```

`NoteListParams` is `z.infer<typeof NoteListQuerySchema>` which has `page`, `limit`, `sortBy`, `sortOrder`, `tags` (comma-separated string). These match exactly what the API's `NoteListQuerySchema` validates.

### 3. Mutations with cache invalidation

```typescript
export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string }) =>
      apiClient.post<NoteDetail>('/notes', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/notes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
  });
}
```

`onSuccess` in the hook invalidates `['notes']`. Navigation after `useCreateNote` happens in the component's `mutate()` callback (not the hook), because `useNavigate` is a hook and can only be called in a component.

### 4. URL-driven state in `NotesListPage`

`useSearchParams()` is the single source of truth. Helper functions convert between string params and typed values:

```typescript
// Reading from URL
const [searchParams, setSearchParams] = useSearchParams();
const page   = Number(searchParams.get('page') ?? '1');
const sortBy = (searchParams.get('sortBy') ?? 'updatedAt') as SortBy;
const sortOrder = (searchParams.get('sortOrder') ?? 'desc') as SortOrder;
const tags   = searchParams.get('tags') ?? undefined;  // comma-separated CUIDs or undefined

// Writing — replace the param, keep others
function setSortBy(value: SortBy) {
  setSearchParams((prev) => {
    prev.set('sortBy', value);
    prev.set('page', '1');  // reset page on sort change
    return prev;
  });
}
```

`tags` is passed directly to `useNotes` as-is — the API expects a comma-separated string.

### 5. Tag filter — `TagFilter` manages its own checked state from the URL

`TagFilter` receives `selectedIds: string[]` and `onChange(ids: string[])` as props. `NotesListPage` derives `selectedIds` from the URL's `?tags=` param and writes back to `setSearchParams` on change. This keeps URL as the single source of truth.

```typescript
// NotesListPage
const selectedTagIds = tags ? tags.split(',') : [];

function handleTagFilterChange(ids: string[]) {
  setSearchParams((prev) => {
    if (ids.length > 0) prev.set('tags', ids.join(','));
    else prev.delete('tags');
    prev.set('page', '1');
    return prev;
  });
}
```

### 6. Delete confirmation — local state in NoteCard

Each `NoteCard` maintains its own `deleteOpen: boolean` state (no Zustand, no lifting to parent). The Dialog is rendered inside `NoteCard`. When the user confirms, the mutation is called. The Dialog closes on success or cancel.

```typescript
// NoteCard.tsx
const [deleteOpen, setDeleteOpen] = useState(false);
const { mutate: deleteNote, isPending } = useDeleteNote();

// Delete button: e.stopPropagation() prevents card navigation click
<Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteOpen(true); }}>
  <Trash2 className="h-4 w-4" />
</Button>

<Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
  <DialogContent>
    <DialogHeader><DialogTitle>Delete this note?</DialogTitle></DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
      <Button
        variant="destructive"
        disabled={isPending}
        onClick={() => deleteNote(note.id, { onSuccess: () => setDeleteOpen(false) })}
      >
        Delete
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

`e.stopPropagation()` is critical — without it, clicking the trash icon would also trigger the card's `onClick` navigation.

### 7. AppShell layout

Fixed sidebar (240px), scrollable main content:

```tsx
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r bg-white px-3 py-4">
        <div className="mb-6 px-2 text-lg font-bold">NoteApp</div>
        <NewNoteButton />
        <nav className="mt-4 flex flex-col gap-1">
          <NavLink to="/notes">Notes</NavLink>
          <NavLink to="/search">Search</NavLink>
        </nav>
        <div className="mt-auto">
          <UserMenu />  {/* shows email + Logout */}
        </div>
      </aside>
      {/* Main */}
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
```

`NavLink` uses React Router's `<NavLink>` which adds `aria-current="page"` on the active route — style with `[aria-current='page']:bg-gray-100`.

`NewNoteButton` calls `useCreateNote().mutate({ title: 'Untitled' }, { onSuccess: (note) => navigate('/notes/' + note.id) })`. The `useNavigate` hook lives in this sub-component (not in `AppShell` directly, to avoid the hook being called on every render unnecessarily).

### 8. `formatRelativeTime` utility

Added to `apps/web/src/lib/utils.ts` using `Intl.RelativeTimeFormat` — no extra dependency:

```typescript
export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (seconds < 60)   return rtf.format(-seconds, 'second');
  if (seconds < 3600) return rtf.format(-Math.floor(seconds / 60), 'minute');
  if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), 'hour');
  return rtf.format(-Math.floor(seconds / 86400), 'day');
}
```

### 9. `App.tsx` wrapping

```tsx
// Replace the /notes and /search routes:
<Route path="/notes" element={
  <RequireAuth>
    <AppShell><NotesListPage /></AppShell>
  </RequireAuth>
} />
<Route path="/notes/:id" element={
  <RequireAuth>
    <AppShell><div>TODO: NoteEditorPage</div></AppShell>
  </RequireAuth>
} />
<Route path="/search" element={
  <RequireAuth>
    <AppShell><div>TODO: SearchPage</div></AppShell>
  </RequireAuth>
} />
```

---

## TypeScript Interfaces

### `useNotes` params type

```typescript
import type { NoteListQuerySchema } from 'shared';
import { z } from 'zod';

type NoteListParams = z.infer<typeof NoteListQuerySchema>;
// { page: number; limit: number; sortBy: 'createdAt'|'updatedAt'|'title'; sortOrder: 'asc'|'desc'; tags?: string }
// All fields have defaults in the schema — still pass them explicitly for a stable query key
```

### `NoteCard` props

```typescript
import type { NoteListItem } from 'shared';

interface NoteCardProps {
  note: NoteListItem;
}
```

### `TagFilter` props

```typescript
import type { TagWithCount } from 'shared';

interface TagFilterProps {
  tags: TagWithCount[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}
```

### `SortControl` props

```typescript
type SortBy = 'createdAt' | 'updatedAt' | 'title';
type SortOrder = 'asc' | 'desc';

interface SortControlProps {
  sortBy: SortBy;
  sortOrder: SortOrder;
  onSortByChange: (value: SortBy) => void;
  onSortOrderChange: (value: SortOrder) => void;
}
```

### `NoteList` props

```typescript
import type { NoteListItem } from 'shared';

interface NoteListProps {
  notes: NoteListItem[];
  isLoading: boolean;
  onCreateNote: () => void;  // passed from NotesListPage for empty state CTA
}
```

### `Pagination` props

```typescript
interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}
```

---

## Implementation Details

### `useTags`

```typescript
import { useQuery } from '@tanstack/react-query';
import type { TagWithCount } from 'shared';
import { apiClient } from '../lib/apiClient.js';

export function useTags() {
  return useQuery({
    queryKey: ['tags'],
    queryFn: () => apiClient.get<TagWithCount[]>('/tags').then((r) => r.data),
  });
}
```

### `NotesListPage` structure

```tsx
export default function NotesListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page     = Number(searchParams.get('page') ?? '1');
  const sortBy   = (searchParams.get('sortBy') ?? 'updatedAt') as SortBy;
  const sortOrder = (searchParams.get('sortOrder') ?? 'desc') as SortOrder;
  const tagsParam = searchParams.get('tags') ?? undefined;

  const { data: notesData, isLoading } = useNotes({
    page, limit: 20, sortBy, sortOrder, tags: tagsParam,
  });
  const { data: tags = [] } = useTags();
  const createNote = useCreateNote();
  const navigate = useNavigate();

  const selectedTagIds = tagsParam ? tagsParam.split(',') : [];
  const notes = notesData?.data ?? [];
  const meta  = notesData?.meta;

  function handleNewNote() {
    createNote.mutate({ title: 'Untitled' }, {
      onSuccess: (note) => navigate(`/notes/${note.id}`),
    });
  }

  return (
    <div className="flex h-full gap-6">
      {/* Left: tag filter */}
      <aside className="w-48 shrink-0">
        <TagFilter tags={tags} selectedIds={selectedTagIds} onChange={handleTagFilterChange} />
      </aside>
      {/* Right: sort + list + pagination */}
      <div className="flex flex-1 flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Notes</h1>
          <SortControl sortBy={sortBy} sortOrder={sortOrder}
            onSortByChange={setSortBy} onSortOrderChange={setSortOrder} />
        </div>
        <NoteList notes={notes} isLoading={isLoading} onCreateNote={handleNewNote} />
        {meta && meta.totalPages > 1 && (
          <Pagination page={page} totalPages={meta.totalPages} onPageChange={setPage} />
        )}
      </div>
    </div>
  );
}
```

### `NoteList` — loading skeleton and empty state

```tsx
export function NoteList({ notes, isLoading, onCreateNote }: NoteListProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center text-gray-500">
        <FileText className="h-12 w-12 opacity-30" />
        <p className="text-lg font-medium">No notes yet</p>
        <Button onClick={onCreateNote}>Create your first note</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {notes.map((note) => <NoteCard key={note.id} note={note} />)}
    </div>
  );
}
```

---

## Test Plan

> `src/hooks/**` and `src/components/**` are excluded from the coverage gate. Tests run and must pass but do not affect the threshold.

### `useNotes.test.ts` (4 tests)

| ID | Scenario |
|---|---|
| NOTES-HOOK-01 | `useNotes` sends GET `/notes` with correct params |
| NOTES-HOOK-02 | `useCreateNote` sends POST `/notes` and returns `NoteDetail` |
| NOTES-HOOK-03 | `useDeleteNote` sends DELETE `/notes/:id` |
| NOTES-HOOK-04 | `useDeleteNote` calls `invalidateQueries(['notes'])` on success |

### `useTags.test.ts` (2 tests)

| ID | Scenario |
|---|---|
| TAGS-HOOK-01 | `useTags` sends GET `/tags` and returns `TagWithCount[]` |
| TAGS-HOOK-02 | `useTags` uses query key `['tags']` (stable cache) |

All 6 hook tests use `vi.mock('../../lib/apiClient.js')` — same pattern as `useAuth.test.ts`.

---

## Checkpoints

```bash
# After adding shadcn components:
pnpm -r build     # 0 type errors

# After hooks + AppShell + NotesListPage (before tests):
pnpm -r lint      # 0 errors
pnpm -r build     # 0 type errors

# Final gate:
pnpm -r lint && pnpm -r build && pnpm --filter web test
```
