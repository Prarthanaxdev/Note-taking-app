# Proposal — AB-1017: UI Polish and Visual Design

## Summary

A full-app visual polish pass that brings consistency, professionalism, and clarity
to every screen without touching API shapes, auth storage, autosave behaviour, or
user-journey flows.

Five concrete outcomes:

1. **Unified color tokens** — Blue-600 (#2563EB) becomes the single primary brand
   accent, expressed exclusively through shadcn CSS variables (`--primary`,
   `--primary-foreground`, `--ring`). All hardcoded `blue-600` / `bg-blue-700` /
   `focus:ring-blue-500` class references are replaced by CSS-variable–backed
   Tailwind tokens (`bg-primary`, `ring-ring`, etc.).

2. **Opaque surfaces** — Every modal, dialog, drawer, popover, dropdown, and toast
   is confirmed opaque white (`bg-background`). The shadcn `--background` variable
   already maps to white; any component that bypasses it is corrected.

3. **Visible page background** — Main authenticated pages use `bg-slate-50` (via a
   custom `--page-bg` token) so white cards and the editor surface are visually
   elevated. Auth pages gain a subtle two-stop blue-to-white gradient.

4. **Editor as paper card** — `NoteEditorPage` wraps the full editing surface (title
   bar + toolbar + TipTap content) in a white `rounded-xl shadow-sm` card that sits
   on the `bg-slate-50` main area, giving it a "document you're editing" feel.

5. **Toast feedback** — Install `sonner` and wire success toasts into three actions
   that currently give zero visual feedback: copy share link, revoke share link, and
   restore version.

Plus: brand mark upgrade (PenLine icon + primary color), responsive no-break checks,
consistent spacing/radius/hover/focus states across cards, empty states, and forms.

---

## Capabilities

| Capability | Spec file |
|---|---|
| `ui-polish` | `specs/ui-polish/spec.md` |

---

## Files Changed

### `apps/web/package.json`

| Change | Detail |
|---|---|
| Add dependency | `sonner` (toast library; shadcn-recommended) |

### `apps/web/src/index.css`

| Change | Detail |
|---|---|
| Redefine `--primary` | `222.2 84.0% 47.1%` → HSL equivalent of blue-600 (`221.2 83.2% 53.3%`) |
| Redefine `--primary-foreground` | Keep `210 40% 98%` (white-ish — already correct) |
| Redefine `--ring` | Match `--primary` HSL value (was: `222.2 84% 4.9%` — very dark) |
| Add `--page-bg` | `210 20% 97%` (slate-50 equivalent — page canvas color) |
| Add `--sidebar-bg` | `0 0% 100%` (pure white sidebar) |
| Add auth gradient vars | `--auth-from`, `--auth-to` for the auth page background |
| Remove `.dark` stub | Remove the two-line `.dark` block that was never wired up |

### `apps/web/tailwind.config.ts`

| Change | Detail |
|---|---|
| Extend `colors` | Add `page-bg`, `sidebar` color tokens backed by the CSS variables above |

### `apps/web/src/App.tsx`

| Change | Detail |
|---|---|
| Add `<Toaster />` | Import from `sonner`; mount inside `<QueryClientProvider>` at app root |

### `apps/web/src/components/layout/AppShell.tsx`

| Change | Detail |
|---|---|
| Brand mark | Add `PenLine` icon (lucide-react) before "NoteApp"; apply `text-primary` to both |
| Sidebar bg | `bg-white` → `bg-sidebar` (CSS-var–backed; same visual, token-consistent) |
| Main bg | `bg-gray-50` → `bg-page-bg` |
| Active nav | Replace `bg-gray-100 text-gray-900` with `bg-primary/10 text-primary font-semibold` |
| Hover nav | Replace `hover:bg-gray-50 hover:text-gray-900` with `hover:bg-muted hover:text-foreground` |
| User menu trigger | Replace hardcoded `text-gray-600 hover:bg-gray-50` with `text-muted-foreground hover:bg-muted` |
| Avatar bubble | `bg-blue-100 text-blue-700` → `bg-primary/10 text-primary` |
| New Note button | Already uses `variant="default"` (maps to `--primary`) — no change |

### `apps/web/src/components/layout/AuthLayout.tsx`

| Change | Detail |
|---|---|
| Page background | `bg-gray-50` → `bg-gradient-to-b from-blue-50 to-white` |
| Card | Keep `bg-white shadow-sm`; increase shadow to `shadow-md`; border → `border-border` |
| Title | `text-gray-900` → `text-foreground` |

### `apps/web/src/pages/notes/NoteEditorPage.tsx`

| Change | Detail |
|---|---|
| Editor wrapper | Wrap `<div className="flex flex-col h-full">` with an outer `<div className="flex h-full p-4 bg-page-bg">` and an inner `<div className="flex flex-col flex-1 overflow-hidden rounded-xl border bg-white shadow-sm">` |
| Title bar bg | Transparent → `bg-white` (the card provides it) |
| Title input | `bg-transparent` → explicitly `bg-transparent` (inherits card white — no change) |
| Skeleton | Update skeleton to use the same card wrapper for consistency |

### `apps/web/src/components/editor/EditorToolbar.tsx`

| Change | Detail |
|---|---|
| Toolbar border | `border-b` → `border-b border-border` (CSS-var) |
| Active state | `bg-gray-100` → `bg-primary/10 text-primary` for all active buttons |
| Hover state | Add `hover:bg-muted` to all buttons (currently none specified) |

### `apps/web/src/components/editor/NoteEditor.tsx`

| Change | Detail |
|---|---|
| TipTap prose | `prose max-w-none focus:outline-none min-h-full p-4` → add `prose-headings:text-foreground prose-p:text-foreground prose-strong:text-foreground` to ensure consistent foreground colors |

### `apps/web/src/components/notes/NoteCard.tsx`

| Change | Detail |
|---|---|
| Focus ring | `focus:ring-blue-500` → `focus:ring-ring` |
| Hover shadow | `hover:shadow-md` — already present; keep |
| Tag badge active color | No change (tags use user-defined color or `bg-secondary`) |

### `apps/web/src/pages/notes/NotesListPage.tsx`

| Change | Detail |
|---|---|
| Search input focus ring | `focus:ring-blue-500` → `focus:ring-ring` |
| Page heading | `text-gray-900` → `text-foreground` |

### `apps/web/src/pages/search/SearchPage.tsx`

| Change | Detail |
|---|---|
| Search input focus ring | `focus:ring-blue-500` → `focus:ring-ring` |
| `SearchEmpty` | Replace plain `<p>` with a centered empty-state card: icon (`SearchX`), heading, subtext |

### `apps/web/src/components/search/SearchResultCard.tsx`

| Change | Detail |
|---|---|
| Focus ring | Confirm uses `focus:ring-ring` |
| Consistent hover | Match `NoteCard` hover shadow pattern |

### `apps/web/src/components/share/ShareModal.tsx`

| Change | Detail |
|---|---|
| Expiry input focus ring | `focus:ring-blue-500` → `focus:ring-ring` |

### `apps/web/src/components/share/ShareLinkRow.tsx`

| Change | Detail |
|---|---|
| Copy-link toast | After clipboard write succeeds: `toast.success('Link copied to clipboard')` |
| Revoke-link toast | After revoke mutation succeeds: `toast.success('Link revoked')` |

### `apps/web/src/components/versions/VersionPreview.tsx`

| Change | Detail |
|---|---|
| Restore toast | After restore mutation succeeds: `toast.success('Version restored')` |

### `apps/web/src/pages/auth/LoginPage.tsx` / `RegisterPage.tsx` / `ForgotPasswordPage.tsx` / `ResetPasswordPage.tsx`

| Change | Detail |
|---|---|
| Submit button | Replace hardcoded `bg-blue-600 hover:bg-blue-700` with `bg-primary hover:bg-primary/90 text-primary-foreground` |
| Input focus rings | `focus:ring-blue-500` → `focus:ring-ring` |
| Link colors | `text-blue-600` → `text-primary` |

---

## Key Design Decisions

### Tokens over hardcoded classes

Every color reference in the app today is a hardcoded Tailwind class (`blue-600`,
`gray-50`, `gray-100`, `gray-400`). This proposal migrates them to shadcn CSS
variables (`--primary`, `--ring`, `--muted`, `--border`, `--foreground`). The
rationale: a single change to `index.css` will update every component consistently,
and the app is ready for a future dark-mode or theme pass without touching components.

### Paper card editor — why the outer padding

`NoteEditorPage` currently mounts directly as the `<main>` content of `AppShell`
with no padding. Padding is added at the page level (not AppShell) so the editor
card page is the only page with this visual treatment. `NotesListPage` and
`SearchPage` already have their own content padding via `p-6` on `<main>`.

Wait — AppShell applies `p-6` to `<main>` already. The editor card needs to use
that space. The wrapper approach: remove `p-6` from `<main>` and push padding to
each page, OR keep `p-6` and the card wrapper just uses `h-full` inside it.

**Decision**: Keep `p-6` on AppShell's `<main>`. `NoteEditorPage` wraps its content
in a `flex flex-col h-full rounded-xl border bg-white shadow-sm overflow-hidden` div
that fills the available space. This means the card sits 24px inset from the main
area edges — exactly right.

### Sonner toast placement

`<Toaster position="bottom-right" richColors />` is mounted in `App.tsx`. The
`richColors` prop maps `toast.success()` to a green-tinted surface and
`toast.error()` to a red-tinted surface — both with opaque white backgrounds
(FRS-FE-38 compliance).

### No dark mode

The `.dark` stub in `index.css` is removed. Dark mode is listed as "Deferred to v2"
in the FRS (Section 12, Future Work). The stub adds no value and can mislead.

### Auth pages: gradient vs. plain color

A `bg-gradient-to-b from-blue-50 to-white` gradient (Tailwind utility) is used on
auth pages rather than a plain flat color. This adds depth without introducing a new
CSS variable. It uses Tailwind's built-in blue-50 (`#eff6ff`) which is visually
coherent with the blue-600 primary.

### Responsive no-break

All layout uses Tailwind's `min-w-0` + `truncate` / `flex-1` pattern already, so
overflow is unlikely. Verification at 375px width is a manual check step in tasks.
No structural changes (hamburger, collapse) are in scope.

---

## Out of Scope

- Dark mode implementation
- Mobile sidebar collapse / hamburger menu
- Loading skeleton improvements beyond what is already present
- Animation / transition effects beyond existing `transition-shadow`
- Any changes to `apps/api`, `packages/shared`, or DB schema
- Any changes to API response shapes, auth token storage, or autosave behaviour
