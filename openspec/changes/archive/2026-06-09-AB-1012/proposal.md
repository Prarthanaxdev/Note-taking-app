# Proposal — AB-1012: Note Editor Page (Frontend)

## Why

The backend note CRUD and version APIs are fully implemented. Users can create notes via the
"New Note" button (AB-1011) but are immediately dropped onto a TODO placeholder. This ticket
delivers the complete note editor experience: TipTap rich-text editing, 2-second debounce
autosave with status feedback, inline tag assignment with inline create, and stub panels for
Share (AB-1014) and Version History (AB-1015).

## What Changes

**New hooks (`apps/web/src/hooks/`):**
- `useNotes.ts` — `useNote(id)` fetches `GET /notes/:id` and `useUpdateNote()` patches
  `PATCH /notes/:id`. Also includes `useNotes`, `useCreateNote`, `useDeleteNote` so this file
  is self-contained (AB-1011 defines the same exports; the two branches reconcile on merge).
- `useTags.ts` — `useTags()` lists `GET /tags`; `useCreateTag()` posts `POST /tags`. Self-
  contained for the same merge-order reason.

**New components (`apps/web/src/components/`):**
- `editor/NoteEditor.tsx` — TipTap instance with autosave. Tracks `isDirty` (title or content
  changed from last loaded state). `useEffect([title, content])` runs a 2s `setTimeout`;
  clears timer on re-render. On fire: sets status → 'saving', calls `useUpdateNote`, resolves
  to 'saved' or 'error'. Also registers a `beforeunload` listener when status is 'error'.
- `editor/EditorToolbar.tsx` — Bubble/fixed toolbar: Bold, Italic, Underline, Heading (H1/H2/H3),
  Bullet List, Ordered List, Blockquote, Code Block. Uses TipTap `editor.chain().focus()` API.
- `editor/SaveStatusIndicator.tsx` — Small status chip: 'Saving…' (spinner), 'Saved' (check),
  'Error saving' (red ✕ + retry button).
- `tags/TagCombobox.tsx` — shadcn `<Popover>` + `<Command>` multi-select. Loads tags from
  `useTags()`. Shows selected tags as Badge chips. Inline "Create tag" option: when user types
  a name not in the list, a "Create '{name}'" item appears; selecting it calls `useCreateTag`
  (POST /tags with `{ name }`, null color) and immediately adds the new tag to the note.
  Maximum 5 tags enforced client-side.
- `share/ShareModal.tsx` — stub `<Dialog>` opened by the Share button. Content: heading "Share
  this note" + body "Share feature coming soon." Accepts `open` / `onOpenChange` props so
  AB-1014 can swap in the real implementation.
- `versions/VersionDrawer.tsx` — stub `<Sheet side="right">` opened by the History button.
  Content: heading "Version history" + body "Version history coming soon." Same open/onOpenChange
  interface for AB-1015 to replace.

**New page (`apps/web/src/pages/notes/`):**
- `NoteEditorPage.tsx` — reads `:id` from `useParams`, fetches note with `useNote(id)`.
  Renders a full-height layout: editable title `<input>` at top, `<EditorToolbar>`, `<NoteEditor>`
  content area, `<SaveStatusIndicator>` in header, `<TagCombobox>` in header, Share + History
  buttons in header that open the respective stub modals.

**Modified:**
- `apps/web/src/App.tsx` — replaces the `/notes/:id` TODO placeholder with
  `<RequireAuth><AppShell><NoteEditorPage /></AppShell></RequireAuth>`. Also adds AppShell to
  `/notes` and `/search` routes (needed on this branch since AB-1011 hasn't merged here yet;
  on merge with AB-1011 only the `/notes/:id` change will be a new delta).

**No shared package changes** — `NoteDetail`, `UpdateNoteSchema`, `CreateTagSchema` already
exist in `packages/shared`. No new error codes needed.

## Capabilities

### New Capabilities

- `note-editor`: TipTap rich-text editor with full toolbar (FRS-FE-16, FRS-FE-17), 2-second
  debounce autosave (FRS-FE-18), three-state status indicator (FRS-FE-19), and
  `beforeunload` guard on persistent save error (FRS-FE-23).
- `tag-assignment`: Multi-select tag combobox with search and inline create (FRS-FE-20).
  Maximum 5 tags enforced client-side. Inline create POSTs `/tags` immediately with null color.
- `editor-stubs`: Share button (FRS-FE-21) and History button (FRS-FE-22) are rendered and
  functional as placeholders. AB-1014 and AB-1015 will replace the stub interiors.

### Modified Capabilities

_(none — no existing spec-level behavior changes)_

## Impact

| File | Action |
|---|---|
| `apps/web/src/hooks/useNotes.ts` | New — `useNote`, `useUpdateNote`, `useNotes`, `useCreateNote`, `useDeleteNote` |
| `apps/web/src/hooks/useTags.ts` | New — `useTags`, `useCreateTag` |
| `apps/web/src/pages/notes/NoteEditorPage.tsx` | New |
| `apps/web/src/components/editor/NoteEditor.tsx` | New |
| `apps/web/src/components/editor/EditorToolbar.tsx` | New |
| `apps/web/src/components/editor/SaveStatusIndicator.tsx` | New |
| `apps/web/src/components/tags/TagCombobox.tsx` | New |
| `apps/web/src/components/share/ShareModal.tsx` | New (stub) |
| `apps/web/src/components/versions/VersionDrawer.tsx` | New (stub) |
| `apps/web/src/App.tsx` | Modified — wire `/notes/:id` with AppShell + NoteEditorPage |

**Merge note:** `useNotes.ts` and `useTags.ts` are also created in AB-1011. When both branches
are merged the duplicate exports are collapsed — no functional difference, just a union of the
two files' named exports.

**TipTap packages already installed:** `@tiptap/react`, `@tiptap/starter-kit`,
`@tiptap/extension-underline`. No new packages needed.
