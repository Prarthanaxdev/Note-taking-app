# Spec — UI Polish and Visual Design (AB-1017)

**FRS requirements:** FRS-FE-37, FRS-FE-38, FRS-FE-39, FRS-FE-40, FRS-FE-41, FRS-FE-42  
**SDS reference:** AB-1017 row in Section 8.2 of SDS

---

## 1. Color Token System

### 1.1 CSS Variable Definitions (`index.css`)

| Token | HSL value | Visual |
|---|---|---|
| `--primary` | `221.2 83.2% 53.3%` | Blue-600 (#2563EB) |
| `--primary-foreground` | `210 40% 98%` | Near-white for text on primary bg |
| `--ring` | `221.2 83.2% 53.3%` | Focus ring = primary color |
| `--background` | `0 0% 100%` | White (unchanged) |
| `--foreground` | `222.2 84% 4.9%` | Near-black text (unchanged) |
| `--border` | `214.3 31.8% 91.4%` | Light gray border (unchanged) |
| `--muted` | `210 40% 96.1%` | Subtle hover/inactive bg (unchanged) |
| `--muted-foreground` | `215.4 16.3% 46.9%` | Secondary text (unchanged) |
| `--secondary` | `210 40% 96.1%` | Badge/chip background (unchanged) |
| `--secondary-foreground` | `222.2 47.4% 11.2%` | Badge/chip text (unchanged) |

### 1.2 Custom Page Tokens

| Token | HSL value | Usage |
|---|---|---|
| `--page-bg` | `210 20% 97%` | Main content area canvas (slate-50 equivalent) |
| `--sidebar-bg` | `0 0% 100%` | Sidebar background (pure white) |

### 1.3 Tailwind Config Extension

```ts
// tailwind.config.ts — theme.extend.colors additions
'page-bg': 'hsl(var(--page-bg) / <alpha-value>)',
'sidebar': 'hsl(var(--sidebar-bg) / <alpha-value>)',
```

### 1.4 Removal

- Remove the `.dark` stub block in `index.css` (two lines; unimplemented and misleading).

---

## 2. Surface Rules (FRS-FE-38)

All the following surfaces **must** render with an opaque white background and
readable (≥ 4.5:1 contrast ratio) foreground text:

| Surface | Implementation | Compliant today? |
|---|---|---|
| `Dialog` (`DialogContent`) | shadcn uses `bg-background` → white via CSS var | Yes |
| `Sheet` (`SheetContent`) | shadcn uses `bg-background` | Yes |
| `DropdownMenuContent` | shadcn uses `bg-popover` → white | Yes |
| `Popover` | shadcn uses `bg-popover` | Yes |
| Toast (new) | `sonner` with `richColors`: success = green-tinted white; error = red-tinted white | Added by this ticket |
| Auth form card | `bg-white shadow-md` in `AuthLayout` | Confirmed by this ticket |

Any component that overrides surface background with a hardcoded non-white class must
be corrected to use `bg-background` or `bg-white`.

---

## 3. Page Backgrounds (FRS-FE-39)

### 3.1 Authenticated pages (inside AppShell)

```
AppShell main area: bg-page-bg  (hsl(210 20% 97%) = very light slate)
AppShell sidebar:   bg-sidebar  (hsl(0 0% 100%) = white)
```

Cards (`NoteCard`, `SearchResultCard`) use `bg-white` with `border` and `shadow-sm`
to visually separate from the `bg-page-bg` canvas.

### 3.2 Auth pages

```css
AuthLayout background: bg-gradient-to-b from-blue-50 to-white
AuthLayout card: bg-white border border-border rounded-lg shadow-md
```

### 3.3 Public note page

No change — not in scope for this ticket.

---

## 4. AppShell Navigation (FRS-FE-37)

### 4.1 Brand mark

```tsx
<div className="mb-6 px-2 flex items-center gap-2 text-primary">
  <PenLine className="h-5 w-5" />
  <span className="text-lg font-bold tracking-tight">NoteApp</span>
</div>
```

### 4.2 Active nav link style

```
Active:   bg-primary/10  text-primary  font-semibold
Inactive: text-muted-foreground  hover:bg-muted  hover:text-foreground
```

### 4.3 User avatar bubble

```
bg-primary/10  text-primary  (was: bg-blue-100 text-blue-700)
```

---

## 5. Editor Surface — Paper Card (FRS-FE-39, FRS-FE-40)

### 5.1 Card wrapper in `NoteEditorPage`

The `NoteEditorPageInner` top-level `<div className="flex flex-col h-full">` is
wrapped with:

```tsx
<div className="flex flex-col h-full rounded-xl border bg-white shadow-sm overflow-hidden">
  {/* title bar */}
  {/* NoteEditor (toolbar + TipTap) */}
</div>
```

The outer `<main>` already provides `p-6`, so the card sits 24px inset from all
edges. The card must use `overflow-hidden` so that `rounded-xl` clips the toolbar's
`border-b` and TipTap's content area correctly.

### 5.2 Title bar

No background change needed — inherits the white card background.

### 5.3 EditorToolbar active states (FRS-FE-40)

| State | Class |
|---|---|
| Active formatting | `bg-primary/10 text-primary` |
| Hover | `hover:bg-muted` |
| No state | `text-foreground` ghost button |

Separator (`<Separator orientation="vertical" />`) already uses `bg-border` from
shadcn — no change needed.

### 5.4 TipTap prose contrast

`editorProps.attributes.class` in `NoteEditor`:

```
'prose max-w-none focus:outline-none min-h-full p-4 prose-headings:text-foreground'
```

---

## 6. Consistent Component States (FRS-FE-41)

### 6.1 Focus ring token

All `focus:ring-*` class references are replaced with `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`.

Affected locations:
- `NoteCard` — `focus:ring-2 focus:ring-blue-500` → `focus-visible:ring-2 focus-visible:ring-ring`
- `NotesListPage` search input — `focus:ring-2 focus:ring-blue-500` → same
- `SearchPage` search input — same
- `ShareModal` date input — same
- `LoginPage`, `RegisterPage`, `ForgotPasswordPage`, `ResetPasswordPage` — all form inputs

### 6.2 Form input baseline style

All `<input>` elements use a consistent base:

```
rounded-md border border-input bg-background px-3 py-2 text-sm
ring-offset-background
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
placeholder:text-muted-foreground
```

### 6.3 Auth submit button

Replace hardcoded `bg-blue-600 hover:bg-blue-700` with:

```
bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50
```

### 6.4 Auth link colors

`text-blue-600 hover:underline` → `text-primary hover:underline`

### 6.5 NoteCard

No layout changes. Focus ring corrected per §6.1.

### 6.6 SearchResultCard

Confirm consistent `bg-white border shadow-sm rounded-lg hover:shadow-md` pattern
matching `NoteCard`. Focus ring corrected per §6.1.

### 6.7 Empty states

**Notes list empty state** (in `NoteList`): If currently a plain `<p>`, replace with:

```tsx
<div className="flex flex-col items-center py-16 text-center text-muted-foreground">
  <FileText className="mb-3 h-10 w-10 opacity-30" />
  <p className="font-medium">No notes yet</p>
  <p className="mt-1 text-sm">Create your first note using the button in the sidebar.</p>
</div>
```

**Search empty state** (in `SearchPage`): Replace plain `<p>` with:

```tsx
<div className="flex flex-col items-center py-16 text-center text-muted-foreground">
  <SearchX className="mb-3 h-10 w-10 opacity-30" />
  <p className="font-medium">No notes found</p>
  <p className="mt-1 text-sm">No results for <strong className="text-foreground">"{query}"</strong>.</p>
</div>
```

---

## 7. Toast Integration (FRS-FE-38)

### 7.1 Setup

```tsx
// apps/web/src/App.tsx
import { Toaster } from 'sonner';
// Inside the JSX tree (inside QueryClientProvider):
<Toaster position="bottom-right" richColors />
```

### 7.2 Toast triggers

| User action | Component | Call |
|---|---|---|
| Copy share link button clicked (clipboard write succeeds) | `ShareLinkRow` | `toast.success('Link copied to clipboard')` |
| Revoke share link confirmed (mutation succeeds) | `ShareLinkRow` | `toast.success('Link revoked')` |
| Restore version confirmed (mutation succeeds) | `VersionPreview` | `toast.success('Version restored')` |

### 7.3 Toast surface

`sonner` with `richColors` prop:
- Success: green-tinted opaque surface, white background base. Complies with FRS-FE-38.
- Error: red-tinted opaque surface. No error toasts wired in this ticket — handled by inline form errors and error boundaries.

---

## 8. Responsive No-Break (FRS-FE-42 context)

No structural changes to layout. Verification:

- All `<input>` and `<button>` elements use `min-w-0` or `shrink-0` appropriately
  so text truncation occurs before overflow.
- `NotesListPage` filter sidebar: already `hidden lg:block` — correct.
- `AppShell` sidebar: always visible (per agreed scope: no hamburger).
- Minimum test width: 375px (iPhone SE).

---

## 9. Invariants (FRS-FE-42 — must not change)

| Invariant | Verification |
|---|---|
| API response shapes unchanged | No changes to `packages/shared`, `apps/api`, or any hook query/mutation functions |
| Access token not in localStorage | No changes to `authStore.ts` or `apiClient.ts` |
| Autosave behaviour unchanged | No changes to `NoteEditor` autosave logic; only `editorProps.attributes.class` updated |
| User journey flows unchanged | Navigation, form submission, and redirect logic untouched |
| E2E tests still pass | `npx playwright test` must remain green |

---

## 10. Acceptance Criteria

| ID | Criterion | Test type |
|---|---|---|
| POL-01 | Primary color is blue-600 (#2563EB) via CSS variable; no hardcoded `blue-600` in any component | Component / lint |
| POL-02 | All focus rings use `ring-ring` CSS variable | Code review |
| POL-03 | All auth submit buttons use `bg-primary text-primary-foreground` | Component |
| POL-04 | NoteEditorPage editor wraps in white rounded card on slate-50 background | Component / visual |
| POL-05 | EditorToolbar active buttons show `bg-primary/10 text-primary` | Component |
| POL-06 | `<Toaster>` mounted in App.tsx; copy-link, revoke-link, restore-version each fire `toast.success(...)` | Component |
| POL-07 | Auth pages use gradient background, white card with shadow-md | Component / visual |
| POL-08 | AppShell brand mark shows PenLine icon + "NoteApp" in `text-primary` | Component |
| POL-09 | Empty states (notes list, search) show icon + heading + subtext | Component |
| POL-10 | `pnpm -r build`, `pnpm -r lint`, `pnpm -r test` all pass | CI |
| POL-11 | `npx playwright test` remains green (no journey regressions) | E2E |
