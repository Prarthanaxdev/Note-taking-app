# Tasks — AB-1011: Notes List Page (Frontend)

| Field | Value |
|---|---|
| Ticket | AB-1011 |
| Total tasks | 15 |
| Status | Complete |

---

## Phase 1 — Foundation

> All four tasks are independent — [PARALLEL].
> Checkpoint: `pnpm -r build` → 0 errors

- [x] **T-01 — Add shadcn/ui components**
  - `components.json` already exists (shadcn already initialized)
  - Run from `apps/web/`: `pnpm dlx shadcn@latest add button dialog select badge checkbox dropdown-menu separator`
  - Verify: `apps/web/src/components/ui/` now contains `button.tsx`, `dialog.tsx`, `select.tsx`, `badge.tsx`, `checkbox.tsx`, `dropdown-menu.tsx`, `separator.tsx`
  - Run `pnpm -r build` to confirm 0 type errors

- [x] **T-02 — Add `formatRelativeTime` to `lib/utils.ts`** [PARALLEL]
  - File: `apps/web/src/lib/utils.ts` (modify existing)
  - Append after `cn()`:
    ```typescript
    export function formatRelativeTime(isoString: string): string {
      const diff = Date.now() - new Date(isoString).getTime();
      const seconds = Math.floor(diff / 1000);
      const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
      if (seconds < 60)    return rtf.format(-seconds, 'second');
      if (seconds < 3600)  return rtf.format(-Math.floor(seconds / 60), 'minute');
      if (seconds < 86400) return rtf.format(-Math.floor(seconds / 3600), 'hour');
      return rtf.format(-Math.floor(seconds / 86400), 'day');
    }
    ```

- [x] **T-03 — Create `useNotes.ts`** [PARALLEL]
  - File: `apps/web/src/hooks/useNotes.ts` (new)
  - Imports: `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`; `apiClient`; types `NoteListItem`, `NoteDetail`, `PaginationMeta` from `'shared'`; `NoteListQuerySchema` from `'shared'` for the param type
  - `NoteListParams` type: `{ page: number; limit: number; sortBy: 'createdAt' | 'updatedAt' | 'title'; sortOrder: 'asc' | 'desc'; tags?: string }`
  - Export `useNotes(params: NoteListParams)`:
    ```typescript
    return useQuery({
      queryKey: ['notes', params],
      queryFn: () =>
        apiClient
          .get<{ data: NoteListItem[]; meta: PaginationMeta }>('/notes', { params })
          .then((r) => r.data),
    });
    ```
  - Export `useCreateNote()`:
    ```typescript
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (data: { title: string }) =>
        apiClient.post<NoteDetail>('/notes', data).then((r) => r.data),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
    });
    ```
  - Export `useDeleteNote()`:
    ```typescript
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => apiClient.delete(`/notes/${id}`),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['notes'] }),
    });
    ```

- [x] **T-04 — Create `useTags.ts`** [PARALLEL]
  - File: `apps/web/src/hooks/useTags.ts` (new)
  - Imports: `useQuery` from `@tanstack/react-query`; `apiClient`; `TagWithCount` from `'shared'`
  - Export `useTags()`:
    ```typescript
    return useQuery({
      queryKey: ['tags'],
      queryFn: () => apiClient.get<TagWithCount[]>('/tags').then((r) => r.data),
    });
    ```

---

## Phase 2 — Components

> T-05 through T-09 each depend on Phase 1 but are independent of each other — [PARALLEL].
> T-10 depends on T-09. T-11 depends on T-03 through T-10. T-12 depends on T-05 + T-11.
>
> Checkpoint: `pnpm -r lint` → 0 errors, `pnpm -r build` → 0 type errors

- [x] **T-05 — Create `AppShell.tsx`** [PARALLEL, depends on T-01 + T-03]
  - File: `apps/web/src/components/layout/AppShell.tsx` (new)
  - Imports: `ReactNode`, `NavLink`, `useNavigate` from `react-router-dom`, `useAuthStore`, `useCreateNote` from hooks, `useQueryClient` from `@tanstack/react-query`, `Button`, `DropdownMenu*` from shadcn ui
  - `NewNoteButton` internal component:
    - Calls `useCreateNote()` and `useNavigate()`
    - `onClick`: `createNote.mutate({ title: 'Untitled' }, { onSuccess: (note) => navigate('/notes/' + note.id) })`
    - `disabled={createNote.isPending}`, shows "New Note" or spinner
  - `UserMenu` internal component:
    - Shows user email from `useAuthStore().user?.email`
    - Logout button: calls `useAuthStore.getState().clearAuth()`, `qc.clear()`, `navigate('/login')`
  - AppShell layout:
    ```tsx
    <div className="flex h-screen bg-gray-50">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-white px-3 py-4">
        <div className="mb-6 px-2 text-lg font-bold tracking-tight">NoteApp</div>
        <NewNoteButton />
        <nav className="mt-4 flex flex-col gap-1">
          <NavLink
            to="/notes"
            className={({ isActive }) =>
              cn('rounded-md px-3 py-2 text-sm font-medium transition-colors',
                 isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900')
            }
          >Notes</NavLink>
          <NavLink to="/search" className={/* same */}>Search</NavLink>
        </nav>
        <div className="mt-auto"><UserMenu /></div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
    ```
  - Props: `{ children: ReactNode }`

- [x] **T-06 — Create `SortControl.tsx`** [PARALLEL, depends on T-01]
  - File: `apps/web/src/components/notes/SortControl.tsx` (new — create `components/notes/` dir)
  - Props:
    ```typescript
    interface SortControlProps {
      sortBy: 'createdAt' | 'updatedAt' | 'title';
      sortOrder: 'asc' | 'desc';
      onSortByChange: (v: 'createdAt' | 'updatedAt' | 'title') => void;
      onSortOrderChange: (v: 'asc' | 'desc') => void;
    }
    ```
  - Render: shadcn `<Select>` with options "Last Updated" / "Created" / "Title"; a toggle `<Button variant="ghost" size="icon">` that switches between `ArrowUp` and `ArrowDown` icons (from `lucide-react`)
  - Changing sort field resets direction to the field's natural default: `title` → `asc`, others → `desc`

- [x] **T-07 — Create `TagFilter.tsx`** [PARALLEL, depends on T-01]
  - File: `apps/web/src/components/notes/TagFilter.tsx` (new)
  - Props:
    ```typescript
    interface TagFilterProps {
      tags: TagWithCount[];
      selectedIds: string[];
      onChange: (ids: string[]) => void;
    }
    ```
  - Render: heading "Filter by tag", then for each tag a row with:
    - shadcn `<Checkbox>` checked when `selectedIds.includes(tag.id)`
    - Tag name label
    - shadcn `<Badge>` showing `tag.noteCount` with background color derived from `tag.color ?? '#6b7280'`
  - `onChange` called with updated ID array on each checkbox toggle
  - "Clear" link shown when `selectedIds.length > 0` — calls `onChange([])`
  - Empty state: "No tags yet" if `tags.length === 0`

- [x] **T-08 — Create `Pagination.tsx`** [PARALLEL, depends on T-01]
  - File: `apps/web/src/components/notes/Pagination.tsx` (new)
  - Props:
    ```typescript
    interface PaginationProps {
      page: number;
      totalPages: number;
      onPageChange: (page: number) => void;
    }
    ```
  - Render: "← Previous" button (disabled when `page === 1`), "Page N of M" text, "Next →" button (disabled when `page === totalPages`)
  - Use shadcn `<Button variant="outline" size="sm">` for prev/next
  - Only rendered by parent when `totalPages > 1`

- [x] **T-09 — Create `NoteCard.tsx`** [PARALLEL, depends on T-01 + T-02 + T-03]
  - File: `apps/web/src/components/notes/NoteCard.tsx` (new)
  - Props: `{ note: NoteListItem }`
  - Imports: `NoteListItem`, `TagSummary` from `'shared'`; `useDeleteNote` from hooks; `formatRelativeTime` from `lib/utils`; shadcn `Button`, `Badge`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`; `Trash2` from `lucide-react`; `useNavigate`
  - Local state: `const [deleteOpen, setDeleteOpen] = useState(false)`
  - Card `onClick`: `navigate('/notes/' + note.id)` — the whole card is clickable
  - Delete button: `<Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteOpen(true); }}>` — `e.stopPropagation()` is required to prevent triggering card navigation
  - Tag chips: `note.tags.map(tag => <Badge style={{ backgroundColor: tag.color ?? undefined }}>{ tag.name }</Badge>)`
  - Timestamp: `<span className="text-xs text-gray-400">{formatRelativeTime(note.updatedAt)}</span>`
  - Delete Dialog:
    ```tsx
    <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Delete this note?</DialogTitle></DialogHeader>
        <p className="text-sm text-gray-500">This action cannot be undone.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="destructive" disabled={deleteNote.isPending}
            onClick={() => deleteNote.mutate(note.id, { onSuccess: () => setDeleteOpen(false) })}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    ```

- [x] **T-10 — Create `NoteList.tsx`** (depends on T-09)
  - File: `apps/web/src/components/notes/NoteList.tsx` (new)
  - Props:
    ```typescript
    interface NoteListProps {
      notes: NoteListItem[];
      isLoading: boolean;
      onCreateNote: () => void;
    }
    ```
  - Loading state: 3× skeleton `<div className="h-28 animate-pulse rounded-lg bg-gray-100" />`
  - Empty state (`!isLoading && notes.length === 0`):
    ```tsx
    <div className="flex flex-col items-center gap-4 py-20 text-center text-gray-500">
      <FileText className="h-12 w-12 opacity-30" />
      <p className="text-lg font-medium">No notes yet</p>
      <Button onClick={onCreateNote}>Create your first note</Button>
    </div>
    ```
  - Default: `<div className="flex flex-col gap-3">{notes.map(n => <NoteCard key={n.id} note={n} />)}</div>`

- [x] **T-11 — Create `NotesListPage.tsx`** (depends on T-03, T-04, T-05, T-06, T-07, T-08, T-10)
  - File: `apps/web/src/pages/notes/NotesListPage.tsx` (new — create `pages/notes/` dir)
  - Imports: `useSearchParams`, `useNavigate`; all hooks and components above
  - URL state derivation:
    ```typescript
    const [searchParams, setSearchParams] = useSearchParams();
    const page      = Number(searchParams.get('page') ?? '1');
    const sortBy    = (searchParams.get('sortBy') ?? 'updatedAt') as SortBy;
    const sortOrder = (searchParams.get('sortOrder') ?? 'desc') as SortOrder;
    const tagsParam = searchParams.get('tags') ?? undefined;
    const selectedTagIds = tagsParam ? tagsParam.split(',') : [];
    ```
  - URL update helpers — each resets `page` to `'1'`:
    ```typescript
    function setSortBy(v: SortBy) {
      setSearchParams(p => { p.set('sortBy', v); p.set('sortOrder', v === 'title' ? 'asc' : 'desc'); p.set('page', '1'); return p; });
    }
    function setSortOrder(v: SortOrder) {
      setSearchParams(p => { p.set('sortOrder', v); p.set('page', '1'); return p; });
    }
    function setPage(n: number) {
      setSearchParams(p => { p.set('page', String(n)); return p; });
    }
    function handleTagFilterChange(ids: string[]) {
      setSearchParams(p => { ids.length > 0 ? p.set('tags', ids.join(',')) : p.delete('tags'); p.set('page', '1'); return p; });
    }
    ```
  - Data fetching:
    ```typescript
    const { data: notesData, isLoading } = useNotes({ page, limit: 20, sortBy, sortOrder, tags: tagsParam });
    const { data: tags = [] } = useTags();
    const createNote = useCreateNote();
    ```
  - `handleNewNote`: `createNote.mutate({ title: 'Untitled' }, { onSuccess: (note) => navigate('/notes/' + note.id) })`
  - Layout: two-column flex within the main content area — left `w-48 shrink-0` column for `<TagFilter>`, right `flex-1` column for heading + `<SortControl>` + `<NoteList>` + `<Pagination>`
  - `<Pagination>` rendered only when `meta && meta.totalPages > 1`

- [x] **T-12 — Update `App.tsx`** (depends on T-05 + T-11)
  - File: `apps/web/src/App.tsx` (modify)
  - Add imports: `AppShell`, `NotesListPage`
  - Replace `/notes` route:
    ```tsx
    <Route path="/notes" element={
      <RequireAuth><AppShell><NotesListPage /></AppShell></RequireAuth>
    } />
    ```
  - Replace `/notes/:id` route:
    ```tsx
    <Route path="/notes/:id" element={
      <RequireAuth><AppShell><div>TODO: NoteEditorPage</div></AppShell></RequireAuth>
    } />
    ```
  - Replace `/search` route:
    ```tsx
    <Route path="/search" element={
      <RequireAuth><AppShell><div>TODO: SearchPage</div></AppShell></RequireAuth>
    } />
    ```

---

## Phase 3 — Lint + Build Checkpoint

- [x] **T-13 — Lint + build gate**
  - `pnpm -r lint` → 0 errors across all packages
  - `pnpm -r build` → 0 TypeScript errors across all packages
  - Fix any issues before writing tests

---

## Phase 4 — Tests

> **Coverage note:** `src/hooks/**` and `src/components/**` are excluded from the coverage gate.
> Tests run and must pass; they do not affect the threshold.
>
> Pattern: `vi.mock('../../lib/apiClient.js')` — same as `useAuth.test.ts`.

- [x] **T-14 — `useNotes.test.ts`** (4 tests) [PARALLEL with T-15]
  - File: `apps/web/src/hooks/__tests__/useNotes.test.ts` (new)
  - Mock `apiClient` via `vi.mock('../../lib/apiClient.js', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }))`
  - Wrapper: `makeWrapper()` using fresh `QueryClient` — same pattern as `useAuth.test.ts`
  - **NOTES-HOOK-01**: `useNotes` calls `apiClient.get('/notes', { params: { page:1, limit:20, sortBy:'updatedAt', sortOrder:'desc' } })`
    - Mock returns `{ data: [], meta: { total:0, page:1, limit:20, totalPages:0 } }`
    - Assert `mockGet` called with correct args; query resolves to the mock value
  - **NOTES-HOOK-02**: `useCreateNote` calls `apiClient.post('/notes', { title: 'Untitled' })` and resolves with the returned `NoteDetail`
    - Mock returns `{ data: { id: 'n1', title: 'Untitled', content: null, tags: [], shareLinksCount: 0, createdAt: '', updatedAt: '' } }`
    - Assert resolved data has `id: 'n1'`
  - **NOTES-HOOK-03**: `useDeleteNote` calls `apiClient.delete('/notes/n1')` when mutated with `'n1'`
    - Mock returns `undefined` (204 no content)
    - Assert `mockDelete` called with `'/notes/n1'`
  - **NOTES-HOOK-04**: `useDeleteNote` calls `invalidateQueries({ queryKey: ['notes'] })` on success
    - Spy on `queryClient.invalidateQueries`; assert it is called after a successful delete

- [x] **T-15 — `useTags.test.ts`** (2 tests) [PARALLEL with T-14]
  - File: `apps/web/src/hooks/__tests__/useTags.test.ts` (new)
  - Same mock + wrapper pattern as T-14
  - **TAGS-HOOK-01**: `useTags` calls `apiClient.get('/tags')` and returns the `TagWithCount[]` result
    - Mock: `[{ id: 't1', name: 'Work', color: null, noteCount: 3 }]`
    - Assert resolved data equals mock value
  - **TAGS-HOOK-02**: `useTags` uses query key `['tags']` — assert by checking that a second `renderHook` call with a spied `apiClient.get` does NOT refetch (cache hit within the same `QueryClient`)

---

## Phase 5 — Final Quality Gates

- [x] **T-16 — All quality gates pass**
  - `pnpm -r lint` → 0 errors
  - `pnpm -r build` → 0 type errors
  - `pnpm --filter web test` → all 23 tests pass (17 existing + 6 new hook tests)
