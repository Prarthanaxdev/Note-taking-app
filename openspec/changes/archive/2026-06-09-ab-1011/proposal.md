# Proposal — AB-1011: Notes List Page (Frontend)

## Why

Auth UI is complete (AB-1010). Users can log in but land on a `TODO: NotesListPage` placeholder. This ticket delivers the primary post-login screen: a paginated, sortable, tag-filtered notes list inside a proper application shell.

## What Changes

### shadcn/ui Installation

shadcn/ui was not installed in AB-1010. AB-1011 requires accessible Dialog (delete confirm), Select (sort control), Badge (tag chips), Button, and Checkbox (tag filter). Installing shadcn now makes all remaining frontend tickets cleaner.

- `pnpm dlx shadcn@latest init` in `apps/web`
- Add components: `button`, `dialog`, `select`, `badge`, `checkbox`, `dropdown-menu`, `separator`

### New Files

- `apps/web/src/hooks/useNotes.ts` — TanStack Query hooks: `useNotes(params)`, `useCreateNote()`, `useDeleteNote()`
- `apps/web/src/hooks/useTags.ts` — TanStack Query hook: `useTags()` (list all user tags with noteCount)
- `apps/web/src/components/layout/AppShell.tsx` — Sidebar layout: logo, "New Note" button, nav links (Notes, Search), user menu (Logout)
- `apps/web/src/components/notes/NoteCard.tsx` — Single note card: title, content preview, tag chips, `updatedAt`, delete button
- `apps/web/src/components/notes/NoteList.tsx` — Renders `NoteCard` list or empty state; handles loading skeleton
- `apps/web/src/components/notes/SortControl.tsx` — shadcn `Select` for sort field; toggle button for asc/desc
- `apps/web/src/components/notes/TagFilter.tsx` — shadcn `Checkbox` list of all user tags; AND-logic multi-select
- `apps/web/src/pages/notes/NotesListPage.tsx` — Composes all above; reads/writes URL state via `useSearchParams`

### Modified Files

- `apps/web/src/App.tsx` — Replace `<div>TODO: NotesListPage</div>` with `<AppShell><NotesListPage /></AppShell>`; also pre-wrap `/search` in `<AppShell>` (prevents layout thrash when AB-1013 lands)

## Capabilities

### New Capabilities

- `app-shell` — Persistent sidebar navigation shared by all protected pages
- `notes-list` — Paginated, sortable, tag-filtered notes list with delete

### Modified Capabilities

_(none — no existing spec-level behavior changes; backend notes and tags APIs are unchanged)_

## Key Design Decisions

### New Note = POST immediately, navigate to editor

Clicking "New Note" in the sidebar calls `POST /notes` with title `"Untitled"` and `tagIds: []`, then navigates to `/notes/:newId`. This means the TipTap autosave in AB-1012 always works against a real note ID — no special "new" route handling needed.

### URL-driven state via `useSearchParams`

`NotesListPage` reads `?page`, `?sortBy`, `?sortOrder`, `?tags` (comma-separated tag IDs) from the URL. Mutations navigate via `setSearchParams`. This makes pagination survives browser back/forward and URLs are shareable.

### Tag filter layout — left panel within main content

`TagFilter` is a fixed-width left column within `NotesListPage`'s main content area (not inside `AppShell`). `AppShell` sidebar only contains navigation. This separates concerns: the tag filter is note-list-specific and would not appear on the search or editor pages.

### Delete flow

`NoteCard` delete button opens a shadcn `Dialog` asking "Delete this note?" with "Cancel" and "Delete" (destructive). On confirm, `useDeleteNote()` fires `DELETE /notes/:id`. On success, `queryClient.invalidateQueries(['notes'])` refreshes the list.

## Impact

| File | Action |
|---|---|
| `apps/web/src/hooks/useNotes.ts` | New |
| `apps/web/src/hooks/useTags.ts` | New |
| `apps/web/src/components/layout/AppShell.tsx` | New |
| `apps/web/src/components/notes/NoteCard.tsx` | New |
| `apps/web/src/components/notes/NoteList.tsx` | New |
| `apps/web/src/components/notes/SortControl.tsx` | New |
| `apps/web/src/components/notes/TagFilter.tsx` | New |
| `apps/web/src/pages/notes/NotesListPage.tsx` | New |
| `apps/web/src/App.tsx` | Modified — mount NotesListPage + AppShell |
| `apps/web/src/components/ui/*` | New (shadcn auto-generated) |

**No API changes. No shared type changes.** All required types (`NoteListItem`, `NoteDetail`, `TagWithCount`, `PaginationMeta`) already exist in `packages/shared`. All required Zod schemas (`NoteListQuerySchema`, `CreateNoteSchema`) already exist.
