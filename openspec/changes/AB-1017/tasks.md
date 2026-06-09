# Tasks — AB-1017: UI Polish and Visual Design

## Phase 0 — Foundation

- [x] **T-00** Update color tokens in `apps/web/src/index.css`
  - Change `--primary` from `222.2 47.4% 11.2%` to `221.2 83.2% 53.3%` (blue-600)
  - Change `--ring` from `222.2 84% 4.9%` to `221.2 83.2% 53.3%` (match primary)
  - Add `--page-bg: 210 20% 97%;` in `:root`
  - Add `--sidebar-bg: 0 0% 100%;` in `:root`
  - Remove the `.dark` block (both lines) — it was never wired up
  - In `apps/web/tailwind.config.ts`, extend `theme.colors` with:
    ```ts
    'page-bg': 'hsl(var(--page-bg) / <alpha-value>)',
    sidebar: 'hsl(var(--sidebar-bg) / <alpha-value>)',
    ```

- [x] **T-01** Mount `<Toaster>` in `apps/web/src/App.tsx`
  - `pnpm --filter web add sonner`
  - Add `import { Toaster } from 'sonner';`
  - Mount `<Toaster position="bottom-right" richColors />` inside `<QueryClientProvider>`
    (after `<RouterProvider>` or wrapping it — the Toaster must be inside the React
    tree root but does not need access to query context)

**Checkpoint 0:** ✓ Build clean

---

## Phase 1 — Shell & Auth

- [x] **T-02** Update `apps/web/src/components/layout/AppShell.tsx`
  - Brand mark: replace `<div className="mb-6 px-2 text-lg font-bold...">NoteApp</div>` with:
    ```tsx
    <div className="mb-6 px-2 flex items-center gap-2 text-primary">
      <PenLine className="h-5 w-5" />
      <span className="text-lg font-bold tracking-tight">NoteApp</span>
    </div>
    ```
    Add `PenLine` to the lucide-react import.
  - AppShell wrapper: `bg-gray-50` → `bg-page-bg`
  - Sidebar: `bg-white` → `bg-sidebar`
  - Active nav: `bg-gray-100 text-gray-900` → `bg-primary/10 text-primary font-semibold`
  - Inactive nav hover: `hover:bg-gray-50 hover:text-gray-900` → `hover:bg-muted hover:text-foreground`
  - User menu trigger button: `text-gray-600 hover:bg-gray-50` → `text-muted-foreground hover:bg-muted`
  - Avatar bubble: `bg-blue-100 text-blue-700` → `bg-primary/10 text-primary`

- [x] **T-03** Update `apps/web/src/components/layout/AuthLayout.tsx`
  - Outer div: `bg-gray-50` → `bg-gradient-to-b from-blue-50 to-white`
  - Inner card: `shadow-sm` → `shadow-md`; add explicit `border-border` class

- [x] **T-04** Auth pages — token swap (all 4 pages: `LoginPage`, `RegisterPage`,
  `ForgotPasswordPage`, `ResetPasswordPage`)
  - Submit buttons: `bg-blue-600 hover:bg-blue-700` → `bg-primary text-primary-foreground hover:bg-primary/90`
  - Input focus rings: `focus:ring-2 focus:ring-blue-500` → `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none`
  - Links: `text-blue-600` → `text-primary`

**Checkpoint 1:** ✓ Build clean

---

## Phase 2 — Editor Surface

- [x] **T-05** Wrap editor in paper card in `apps/web/src/pages/notes/NoteEditorPage.tsx`
  - In `NoteEditorPageInner`, wrap the outer `<div className="flex flex-col h-full">` so it becomes:
    ```tsx
    <div className="flex flex-col h-full rounded-xl border bg-white shadow-sm overflow-hidden">
      {/* existing title bar div */}
      {/* existing flex-1 overflow-hidden div */}
    </div>
    ```
  - Also wrap `LoadingSkeleton`'s outer div with the same card class for consistency

- [x] **T-06** Update `apps/web/src/components/editor/EditorToolbar.tsx`
  - Active state class on each button: `bg-gray-100` → `bg-primary/10 text-primary`
  - Add `hover:bg-muted` to all buttons (add to the `className` passed to each `<Button>`)
  - Toolbar container: `border-b` → `border-b border-border`

- [x] **T-07** Update `apps/web/src/components/editor/NoteEditor.tsx`
  - `editorProps.attributes.class`:
    `'prose max-w-none focus:outline-none min-h-full p-4'`
    →
    `'prose max-w-none focus:outline-none min-h-full p-4 prose-headings:text-foreground'`

**Checkpoint 2:** ✓ Build clean

---

## Phase 3 — Lists & Search

- [x] **T-08** Update `apps/web/src/components/notes/NoteCard.tsx`
  - Focus ring: `focus:ring-2 focus:ring-blue-500` → `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`

- [x] **T-09** Update `apps/web/src/pages/notes/NotesListPage.tsx`
  - Search input focus ring: same swap as T-08
  - Heading: `text-gray-900` → `text-foreground`

- [x] **T-10** Update empty state in `apps/web/src/components/notes/NoteList.tsx`
  - Find the existing empty state render (when `notes.length === 0` and not loading)
  - Replace with:
    ```tsx
    <div className="flex flex-col items-center py-16 text-center text-muted-foreground">
      <FileText className="mb-3 h-10 w-10 opacity-30" />
      <p className="font-medium">No notes yet</p>
      <p className="mt-1 text-sm">Create your first note using the button in the sidebar.</p>
    </div>
    ```
  - Add `FileText` to lucide-react import

- [x] **T-11** Update `apps/web/src/pages/search/SearchPage.tsx`
  - Search input focus ring: same swap as T-08
  - Replace `SearchEmpty` component with:
    ```tsx
    function SearchEmpty({ query }: { query: string }) {
      return (
        <div className="flex flex-col items-center py-16 text-center text-muted-foreground">
          <SearchX className="mb-3 h-10 w-10 opacity-30" />
          <p className="font-medium">No notes found</p>
          <p className="mt-1 text-sm">
            No results for{' '}
            <strong className="text-foreground">&ldquo;{query}&rdquo;</strong>.
          </p>
        </div>
      );
    }
    ```
  - Add `SearchX` to lucide-react import

- [x] **T-12** Update `apps/web/src/components/search/SearchResultCard.tsx`
  - Confirm card uses `bg-white border shadow-sm rounded-lg hover:shadow-md`
  - Focus ring: swap to `focus-visible:ring-ring` pattern

**Checkpoint 3:** ✓ Build clean

---

## Phase 4 — Share & Version Toasts

- [x] **T-13** Update `apps/web/src/components/share/ShareModal.tsx`
  - Date input focus ring: `focus:ring-2 focus:ring-blue-500` → `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none`

- [x] **T-14** Update `apps/web/src/components/share/ShareLinkRow.tsx`
  - Add `import { toast } from 'sonner';`
  - In the copy-link handler, after `navigator.clipboard.writeText(...)` resolves:
    `toast.success('Link copied to clipboard')`
  - In the revoke mutation's `onSuccess` callback:
    `toast.success('Link revoked')`

- [x] **T-15** Update `apps/web/src/components/versions/VersionPreview.tsx`
  - Add `import { toast } from 'sonner';`
  - In the restore mutation's `onSuccess` callback, before or alongside `onRestored()`:
    `toast.success('Version restored')`

**Checkpoint 4:** ✓ Build clean, web 42/42 tests pass, api 133/133 tests pass

---

## Phase 5 — Quality Gates

- [x] **T-16** Run full quality gates
  ```bash
  pnpm -r lint    ✓
  pnpm -r build   ✓
  pnpm -r test    ✓ (web + api pass; packages/shared T45-b failure is pre-existing on HEAD, unrelated to AB-1017)
  ```

- [ ] **T-17** Manual responsive check
  - Open the app in a browser at 375px viewport width
  - Verify: Notes list, Search page, Auth pages, Editor page — nothing overflows,
    all text is readable, no horizontally scrolling content

- [ ] **T-18** E2E regression check
  ```bash
  npx playwright test
  ```
  All existing journey tests must remain green. This is a pure UI polish pass —
  no behaviour was changed, so regressions here indicate an unintended side-effect.

---

## Spec Scenario → Task Mapping

| Spec scenario (from spec.md) | Task |
|---|---|
| POL-01: No hardcoded blue-600 in components | T-02, T-03, T-04 |
| POL-02: All focus rings use ring-ring | T-08, T-09, T-11, T-12, T-13, T-04 |
| POL-03: Auth buttons use bg-primary | T-04 |
| POL-04: Editor wraps in white card | T-05 |
| POL-05: Toolbar active = bg-primary/10 | T-06 |
| POL-06: Toast fires on copy/revoke/restore | T-01, T-14, T-15 |
| POL-07: Auth gradient background + shadow-md | T-03 |
| POL-08: Brand mark icon + primary color | T-02 |
| POL-09: Empty states have icon + text | T-10, T-11 |
| POL-10: pnpm build/lint/test green | T-16 |
| POL-11: Playwright E2E green | T-18 |
