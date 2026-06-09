# Tasks — AB-1012: Note Editor Page (Frontend)

| Field | Value |
|---|---|
| Ticket | AB-1012 |
| Total tasks | 14 |
| Status | Complete |

---

## Pre-condition

Before starting **T-05**, AB-1011 must be merged into this branch:
```bash
git merge feature/AB-1011-notes-ui
```
This makes `AppShell` available at `components/layout/AppShell.tsx`. T-01 through T-04 can
run before the merge since they do not depend on AppShell.

---

## Phase 1 — Foundation

> All three tasks are independent — [PARALLEL].
> Checkpoint: `pnpm --filter web build` → 0 type errors.

- [x] **T-01 — Install shadcn/ui components + peer dep** [PARALLEL]
  - Run from `apps/web/`:
    ```bash
    pnpm dlx shadcn@latest add button badge dialog sheet popover command separator
    pnpm --filter web add class-variance-authority
    ```
  - Verify `src/components/ui/` contains: `button.tsx`, `badge.tsx`, `dialog.tsx`, `sheet.tsx`,
    `popover.tsx`, `command.tsx`, `separator.tsx`
  - Run `pnpm --filter web build` to confirm 0 type errors

- [x] **T-02 — Create `apps/web/src/hooks/useNotes.ts`** [PARALLEL]
  - Exports (all from this single file):
    ```typescript
    export type SortBy = 'createdAt' | 'updatedAt' | 'title';
    export type SortOrder = 'asc' | 'desc';
    export interface NoteListParams { page: number; limit: number; sortBy: SortBy; sortOrder: SortOrder; tags?: string; }

    export function useNotes(params: NoteListParams)  // GET /notes — queryKey: ['notes', params]
    export function useNote(id: string)               // GET /notes/:id — queryKey: ['notes', id]
    export function useCreateNote()                   // POST /notes — returns NoteDetail
    export function useUpdateNote()                   // PATCH /notes/:id — mutationFn: ({ id, title?, content?, tagIds? })
    export function useDeleteNote()                   // DELETE /notes/:id
    ```
  - `useNote` query key is `['notes', id]` (string scalar) — distinct from `['notes', params]` (object)
  - `useUpdateNote.onSuccess`: `qc.setQueryData(['notes', note.id], note)` AND `qc.invalidateQueries({ queryKey: ['notes'] })`
  - `useCreateNote.onSuccess` + `useDeleteNote.onSuccess`: `qc.invalidateQueries({ queryKey: ['notes'] })`
  - All return types: `NoteListItem`, `NoteDetail`, `PaginationMeta`, `TagSummary` from `'shared'`

- [x] **T-03 — Create `apps/web/src/hooks/useTags.ts`** [PARALLEL]
  - Exports:
    ```typescript
    export function useTags()       // GET /tags — queryKey: ['tags'] — returns TagWithCount[]
    export function useCreateTag()  // POST /tags — mutationFn: ({ name: string }) — returns TagSummary
    ```
  - `useCreateTag.onSuccess`: `qc.invalidateQueries({ queryKey: ['tags'] })`

**Phase 1 checkpoint:**
```bash
pnpm --filter web build   # 0 type errors
```

---

## Phase 2 — Components

> T-04 through T-09 each depend on Phase 1 but are independent of each other — [PARALLEL].
> T-04 and T-05 can also start before T-01 if shadcn is already installed separately.
>
> Checkpoint: `pnpm --filter web lint` → 0 errors, `pnpm --filter web build` → 0 type errors.

- [x] **T-04 — Create `apps/web/src/components/editor/SaveStatusIndicator.tsx`** [PARALLEL]
  - Export `SaveStatus` type: `'idle' | 'saving' | 'saved' | 'error'`
  - Props: `{ status: SaveStatus; onRetry: () => void }`
  - Render:
    - `'idle'` → `null`
    - `'saving'` → `<Loader2 className="animate-spin" />` + "Saving…" text
    - `'saved'` → `<Check />` + "Saved" text (green)
    - `'error'` → `<AlertCircle />` + "Error saving" text (red) + `<Button size="sm" onClick={onRetry}>Retry</Button>`
  - Icons from `lucide-react`: `Loader2`, `Check`, `AlertCircle`

- [x] **T-05 — Create `apps/web/src/components/editor/EditorToolbar.tsx`** [PARALLEL, depends on T-01]
  - Props: `{ editor: Editor | null }` — `Editor` imported from `@tiptap/react`
  - Returns `null` when `editor` is null
  - Render a flex row of icon buttons. For each:
    - `onClick`: `editor.chain().focus().<command>().run()`
    - `data-active` / `aria-pressed`: `editor.isActive('<mark>')` for visual feedback
    - Use `<Button variant="ghost" size="sm">` from shadcn
  - Commands and their TipTap method:
    | Button | Method | Active check |
    |---|---|---|
    | Bold | `toggleBold()` | `isActive('bold')` |
    | Italic | `toggleItalic()` | `isActive('italic')` |
    | Underline | `toggleUnderline()` | `isActive('underline')` |
    | H1 | `toggleHeading({ level: 1 })` | `isActive('heading', { level: 1 })` |
    | H2 | `toggleHeading({ level: 2 })` | `isActive('heading', { level: 2 })` |
    | H3 | `toggleHeading({ level: 3 })` | `isActive('heading', { level: 3 })` |
    | Bullet list | `toggleBulletList()` | `isActive('bulletList')` |
    | Ordered list | `toggleOrderedList()` | `isActive('orderedList')` |
    | Blockquote | `toggleBlockquote()` | `isActive('blockquote')` |
    | Code block | `toggleCodeBlock()` | `isActive('codeBlock')` |
  - Use `<Separator orientation="vertical" />` to group (Bold/Italic/Underline | Headings | Lists | Block)

- [x] **T-06 — Create `apps/web/src/components/editor/NoteEditor.tsx`** [PARALLEL, depends on T-01, T-02, T-04, T-05]
  - Props:
    ```typescript
    interface NoteEditorProps {
      noteId: string;
      initialContent: object | null;
      title: string;       // from NoteEditorPage — included in every autosave PATCH
      tagIds: string[];    // from NoteEditorPage — included in every autosave PATCH
      onStatusChange: (s: SaveStatus) => void;
      onRetry: () => void;
    }
    ```
  - TipTap setup:
    ```typescript
    const [contentSnapshot, setContentSnapshot] = useState(
      () => JSON.stringify(initialContent ?? {})
    );
    const editor = useEditor({
      extensions: [StarterKit, Underline],
      content: initialContent ?? '',
      onUpdate: ({ editor }) => setContentSnapshot(JSON.stringify(editor.getJSON())),
    });
    ```
  - `isDirty` refs (set once on mount from initial props):
    ```typescript
    const savedTitleRef   = useRef(title);
    const savedContentRef = useRef(JSON.stringify(initialContent));
    const savedTagIdsRef  = useRef(tagIds.slice().sort().join(','));
    const isDirty =
      title !== savedTitleRef.current ||
      contentSnapshot !== savedContentRef.current ||
      tagIds.slice().sort().join(',') !== savedTagIdsRef.current;
    ```
  - Autosave effect (dep array all primitives):
    ```typescript
    useEffect(() => {
      if (!isDirty) return;
      const timer = setTimeout(() => {
        onStatusChange('saving');
        updateNote(
          { id: noteId, title, content: editor?.getJSON() ?? null, tagIds },
          {
            onSuccess: (note) => {
              savedTitleRef.current = note.title;
              savedContentRef.current = JSON.stringify(note.content);
              savedTagIdsRef.current = note.tags.map(t => t.id).sort().join(',');
              onStatusChange('saved');
            },
            onError: () => onStatusChange('error'),
          }
        );
      }, 2000);
      return () => clearTimeout(timer);
    }, [title, contentSnapshot, tagIds.join(',')]);
    ```
  - `beforeunload` effect: register when `status === 'error'`, deregister on cleanup
    (status passed down via `onStatusChange`; track locally with a `statusRef` or a local state)
  - Render:
    ```tsx
    <div className="flex flex-col h-full">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} className="flex-1 overflow-y-auto prose max-w-none p-4" />
    </div>
    ```
  - Note: `onRetry` prop is forwarded to `SaveStatusIndicator` via `NoteEditorPage` — `NoteEditor`
    does NOT render `SaveStatusIndicator` directly. The retry logic: `NoteEditorPage` calls
    `updateNote` imperatively via a callback.

- [x] **T-07 — Create `apps/web/src/components/tags/TagCombobox.tsx`** [PARALLEL, depends on T-01, T-03]
  - Props: `{ selectedTagIds: string[]; onChange: (ids: string[]) => void }`
  - Internal state: `open: boolean`, `search: string`
  - Data: `const { data: allTags = [] } = useTags()`
  - Filtered list: `allTags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()))`
  - Inline-create item: shown when `search.trim().length > 0` AND no exact case-insensitive match exists
    - Label: `Create "${search}"`
    - On select: call `useCreateTag().mutate({ name: search }, { onSuccess: (tag) => onChange([...selectedTagIds, tag.id]) })`
    - Reset `search` to `''` after create
  - Toggle tag: if already selected → remove; else if `selectedTagIds.length < 5` → add
  - Max-5 guard: unselected items at 5 selected get `aria-disabled` class + pointer-events-none
  - Trigger button: shows Badge chips for each selected tag (name + color dot) or "Add tags…" placeholder
  - Use shadcn `<Popover>`, `<PopoverTrigger>`, `<PopoverContent>`, `<Command>`, `<CommandInput>`,
    `<CommandList>`, `<CommandEmpty>`, `<CommandGroup>`, `<CommandItem>`
  - "No tags yet" shown via `<CommandEmpty>` when `allTags.length === 0` and no search

- [x] **T-08 — Create `apps/web/src/components/share/ShareModal.tsx`** [PARALLEL, depends on T-01]
  - Props: `{ noteId: string; open: boolean; onOpenChange: (open: boolean) => void }`
  - Render a shadcn `<Dialog>`:
    ```tsx
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share this note</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-500">Share feature coming soon.</p>
      </DialogContent>
    </Dialog>
    ```

- [x] **T-09 — Create `apps/web/src/components/versions/VersionDrawer.tsx`** [PARALLEL, depends on T-01]
  - Props: `{ noteId: string; open: boolean; onOpenChange: (open: boolean) => void }`
  - Render a shadcn `<Sheet side="right">`:
    ```tsx
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
        </SheetHeader>
        <p className="text-sm text-gray-500 mt-4">Version history coming soon.</p>
      </SheetContent>
    </Sheet>
    ```

**Phase 2 checkpoint:**
```bash
pnpm --filter web lint    # 0 errors
pnpm --filter web build   # 0 type errors
```

---

## Phase 3 — Integration

> T-10 then T-11 in sequence. T-11 depends on AppShell from AB-1011 (pre-condition above).
>
> Checkpoint: `pnpm -r lint` + `pnpm -r build` → 0 errors across all packages.

- [x] **T-10 — Create `apps/web/src/pages/notes/NoteEditorPage.tsx`** (depends on T-04 – T-09)
  - Reads `const { id } = useParams<{ id: string }>()`
  - Fetches: `const { data: note, isLoading, isError } = useNote(id!)`
  - Redirect on 404: `if (isError) return <Navigate to="/notes" replace />`
  - Loading state: render a skeleton (full-height div with pulse animation) until `isSuccess`
  - Local state:
    ```typescript
    const [title, setTitle] = useState('');
    const [tagIds, setTagIds] = useState<string[]>([]);
    const [status, setStatus] = useState<SaveStatus>('idle');
    const [shareOpen, setShareOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    ```
  - Initialise `title` + `tagIds` from `note` once it loads (use `useEffect([note])` or initialise
    inside the `isSuccess` guard before returning JSX):
    ```typescript
    // Pattern: only render editor after isSuccess so initial state is set from loaded note
    if (!note) return <LoadingSkeleton />;
    // title/tagIds can be initialised as useState with note.title / note.tags.map(t=>t.id)
    ```
  - `handleRetry`: calls `updateNote({ id: note.id, title, content: /* via ref */ null, tagIds })`
    — pass a `retryRef` or use a callback; simplest: expose a `triggerSave` callback from
    `NoteEditor` via `useImperativeHandle` on a forwarded ref, OR just re-call `updateNote`
    with the current page state (title + tagIds) and accept that content from last snapshot
    is used. Simplest approach: `handleRetry` calls the same `updateNote` mutation used
    by autosave — wire it as a shared mutation instance, or pass down via prop.
  - Layout:
    ```tsx
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="flex-1 text-xl font-bold bg-transparent outline-none"
          placeholder="Untitled"
        />
        <SaveStatusIndicator status={status} onRetry={handleRetry} />
        <TagCombobox selectedTagIds={tagIds} onChange={setTagIds} />
        <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>Share</Button>
        <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>History</Button>
      </div>
      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <NoteEditor
          noteId={note.id}
          initialContent={note.content}
          title={title}
          tagIds={tagIds}
          onStatusChange={setStatus}
          onRetry={handleRetry}
        />
      </div>
      {/* Modals */}
      <ShareModal noteId={note.id} open={shareOpen} onOpenChange={setShareOpen} />
      <VersionDrawer noteId={note.id} open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
    ```

- [x] **T-11 — Update `apps/web/src/App.tsx`** (depends on AppShell from AB-1011 pre-condition)
  - Add imports: `AppShell`, `NoteEditorPage` (and `NotesListPage` if AB-1011 is merged)
  - Replace `/notes/:id` route:
    ```tsx
    <Route path="/notes/:id" element={
      <RequireAuth><AppShell><NoteEditorPage /></AppShell></RequireAuth>
    } />
    ```
  - If AB-1011 is merged, also replace `/notes` and `/search` routes with their AppShell wrappers
    (will be a no-op diff if AB-1011 already set them up)
  - If AB-1011 is NOT yet merged, also add AppShell to `/notes` and `/search` with TODO placeholders

**Phase 3 checkpoint:**
```bash
pnpm -r lint    # all packages — 0 errors
pnpm -r build   # all packages — 0 type errors
```

---

## Phase 4 — Tests

> T-12 and T-13 are independent — [PARALLEL].
> Pattern: `vi.mock('../../lib/apiClient.js', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))`
> Wrapper: `makeWrapper()` returning a fresh `QueryClient` per test — same pattern as `useAuth.test.ts`.
>
> Checkpoint: `pnpm --filter web test` → all tests pass.

- [x] **T-12 — Create `apps/web/src/hooks/__tests__/useNotes.test.ts`** [PARALLEL]
  - Mock: `apiClient.get`, `apiClient.post`, `apiClient.patch`, `apiClient.delete`
  - **NOTE-HOOK-01**: `useNotes` — `mockGet` returns `{ data: { data: [mockNote], meta: mockMeta } }`;
    assert `result.current.data.data` has length 1 and `mockGet` was called with `('/notes', { params })`
  - **NOTE-HOOK-02**: `useNote` — `mockGet` returns `{ data: mockNoteDetail }`;
    assert `result.current.data.id === 'note-1'` and `mockGet` called with `'/notes/note-1'`
  - **NOTE-HOOK-03**: `useCreateNote` — `mockPost` returns `{ data: mockNoteDetail }`;
    `mutate({ title: 'Test' })`; assert `mockPost` called with `('/notes', { title: 'Test' })`
  - **NOTE-HOOK-04**: `useUpdateNote` — `mockPatch` returns `{ data: updatedNote }`;
    `mutate({ id: 'note-1', title: 'Updated', tagIds: ['t1'] })`;
    assert `mockPatch` called with `('/notes/note-1', { title: 'Updated', tagIds: ['t1'] })`
  - **NOTE-HOOK-05**: `useDeleteNote` — `mockDelete` returns `{}`;
    `mutate('note-1')`; assert `mockDelete` called with `'/notes/note-1'`

- [x] **T-13 — Create `apps/web/src/hooks/__tests__/useTags.test.ts`** [PARALLEL]
  - Mock: `apiClient.get`, `apiClient.post`
  - **TAG-HOOK-01**: `useTags` — `mockGet` returns `{ data: [{ id: 't1', name: 'Work', color: null, noteCount: 3 }] }`;
    assert `result.current.data` has length 1 and `mockGet` called with `'/tags'`
  - **TAG-HOOK-02**: `useCreateTag` — `mockGet` returns `{ data: [] }` (for useTags background fetch);
    `mockPost` returns `{ data: { id: 't2', name: 'Personal', color: null } }`;
    `mutate({ name: 'Personal' })`; assert `mockPost` called with `('/tags', { name: 'Personal' })`
  - **TAG-HOOK-03**: `useCreateTag` invalidates `['tags']` — after successful mutate, spy on
    `qc.invalidateQueries` (or check that `useTags` refetches by seeing `mockGet` called again)

**Phase 4 checkpoint:**
```bash
pnpm --filter web test   # 17 existing + 8 new = 25 tests passing
```

---

## Phase 5 — Final Quality Gates

- [x] **T-14 — All quality gates pass**
  ```bash
  pnpm -r lint           # 1. Lint — all packages clean
  pnpm -r build          # 2. Type-check + build — 0 errors
  pnpm --filter web test # 3. Tests — 25 tests passing
  ```
