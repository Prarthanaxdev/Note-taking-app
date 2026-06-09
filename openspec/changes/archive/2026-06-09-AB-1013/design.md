# Design — AB-1013: Search UI (Frontend)

## Overview

Pure frontend work. The backend `GET /notes/search` endpoint (AB-1007) is already live.
No changes to `packages/shared`, no DB migrations, no API changes.

---

## Files to Create / Modify

| File | Action |
|---|---|
| `apps/web/src/hooks/useSearch.ts` | New — TanStack Query hook wrapping `GET /notes/search` |
| `apps/web/src/components/search/SearchResultCard.tsx` | New — single result card with `dangerouslySetInnerHTML` headline |
| `apps/web/src/pages/search/SearchPage.tsx` | New — full search page: URL-driven state, 4 render states |
| `apps/web/src/pages/notes/NotesListPage.tsx` | Modified — add search form to header row |
| `apps/web/src/App.tsx` | Modified — replace `TODO: SearchPage` with `<SearchPage />` |
| `apps/web/src/hooks/__tests__/useSearch.test.ts` | New — 3 unit tests for `useSearch` hook |

No new shadcn/ui components required — `Button`, `Search` icon from `lucide-react`, and the
existing `Pagination` component from AB-1011 cover all UI needs.

---

## TypeScript Interfaces (Final Shapes)

### `hooks/useSearch.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import type { SearchResult, PaginationMeta } from 'shared';
import { apiClient } from '../lib/apiClient.js';

export interface SearchParams {
  q: string;
  page: number;
  limit: number;
}

export function useSearch(params: SearchParams) {
  return useQuery<{ data: SearchResult[]; meta: PaginationMeta }>({
    queryKey: ['search', params],
    queryFn: () =>
      apiClient
        .get<{ data: SearchResult[]; meta: PaginationMeta }>('/notes/search', { params })
        .then((r) => r.data),
    enabled: params.q.trim().length > 0,
  });
}
```

**Query key:** `['search', params]` — full params object in the key so each unique
`(q, page, limit)` tuple is cached independently. Consistent with `['notes', params]` pattern.

**`enabled` guard:** `params.q.trim().length > 0` — prevents any API call when the user
navigates to `/search` with no query. TanStack Query won't run the `queryFn` at all.

### `components/search/SearchResultCard.tsx`

```typescript
import { useNavigate } from 'react-router-dom';
import type { SearchResult } from 'shared';
import { formatRelativeTime } from '../../lib/utils.js';

interface SearchResultCardProps {
  result: SearchResult; // { id, title, headline, updatedAt }
}

export function SearchResultCard({ result }: SearchResultCardProps) {
  const navigate = useNavigate();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/notes/${result.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/notes/${result.id}`)}
      className="..."
    >
      <h3>{result.title || 'Untitled'}</h3>
      <p
        className="[&_mark]:bg-yellow-200 [&_mark]:rounded [&_mark]:px-0.5"
        dangerouslySetInnerHTML={{ __html: result.headline }}
      />
      <span>{formatRelativeTime(result.updatedAt)}</span>
    </div>
  );
}
```

**`dangerouslySetInnerHTML`:** The `headline` is generated server-side by PostgreSQL
`ts_headline()` using `StartSel=<mark>, StopSel=</mark>`. It is not user-controlled HTML.
AGENTS.md §11 explicitly permits this: *"No raw `dangerouslySetInnerHTML` except search
headlines (HTML comes from our own server via `ts_headline`)"*.

**`<mark>` styling:** Tailwind arbitrary variant `[&_mark]:bg-yellow-200` scopes the yellow
highlight to `<mark>` children of the container `<p>`. No global CSS added.

**Keyboard navigation:** follows the same pattern as `NoteCard` — `role="button"` +
`tabIndex={0}` + `onKeyDown` Enter handler.

### `pages/search/SearchPage.tsx`

```typescript
// State model:
//   q       = URL param 'q' (committed, drives API call)
//   page    = URL param 'page', default 1
//   inputValue = controlled input (local state, initialised from q, synced on back/forward)
//
// Submit: e.preventDefault() → if inputValue.trim() → setSearchParams({ q: trimmed, page:'1' })
// Page change: setSearchParams(prev => { ...prev, page: String(n) })
//
// Render tree:
//   <form>  — search input + Search icon + Submit button
//   if (!q)            → idle prompt ("Enter a search term to find your notes.")
//   if (isLoading)     → <SearchSkeleton />  (inline component, 4 pulse rows)
//   if (empty results) → <SearchEmpty query={q} />  (inline, "No notes found for '…'")
//   else               → results list + optional <Pagination />
```

`SearchSkeleton` and `SearchEmpty` are small enough to be defined inline in `SearchPage.tsx`
(not separate files). The proposal lists `SearchResultCard` as the only new component file.

**Input sync on URL change:**
```typescript
// When the user hits browser back/forward, q changes; sync the visible input.
useEffect(() => {
  setInputValue(q);
}, [q]);
```

### Modified: `pages/notes/NotesListPage.tsx`

```typescript
// Add at top of component:
const navigate = useNavigate();
const [searchQuery, setSearchQuery] = useState('');

// Add handler:
function handleSearchSubmit(e: React.FormEvent) {
  e.preventDefault();
  const trimmed = searchQuery.trim();
  if (!trimmed) return;
  navigate(`/search?q=${encodeURIComponent(trimmed)}`);
}
```

**Header JSX** (current `justify-between` row expanded to three items):
```tsx
<div className="flex items-center gap-3">
  <h1 className="shrink-0 text-xl font-bold text-gray-900">My Notes</h1>
  <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-sm">
    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
    <input
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      placeholder="Search notes…"
      className="w-full rounded-md border bg-white py-1.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      aria-label="Search notes"
    />
  </form>
  <div className="ml-auto">
    <SortControl ... />
  </div>
</div>
```

---

## Architecture Decisions

### 1. URL-driven state with `useSearchParams`

Both `q` and `page` live in the URL. Rationale:
- Back button returns to previous query/page without re-implementing history manually
- Shareable/bookmarkable search URLs
- TanStack Query uses `queryKey: ['search', { q, page, limit }]` — distinct cache entries per
  unique URL state, no cross-contamination between searches

### 2. Local `inputValue` decoupled from URL `q`

`inputValue` is the live text box value. It is **not** committed to the URL until the user
submits. This prevents a query firing on every keystroke while keeping the URL stable.
A `useEffect([q])` syncs `inputValue` when `q` changes externally (back/forward navigation).

This is the only `useEffect` in the feature — it handles the external-change sync case that
cannot be handled in the submit handler.

### 3. Single file for page + inline sub-components

`SearchSkeleton` and `SearchEmpty` are pure presentational with no reuse outside `SearchPage`.
They are defined inline in `SearchPage.tsx` as unexported functions. This avoids creating
`components/search/SearchEmpty.tsx` and `components/search/SearchSkeleton.tsx` for components
that are 5–10 lines each and have no other callers.

### 4. No staleTime override for search

Search results use the global queryClient config (`staleTime: 60_000`). A 1-minute stale time
is correct — the user expects the same query to return cached results during a session.
The `enabled` guard already prevents unnecessary calls when `q` is empty.

### 5. `SearchResultCard` is a standalone component

It has a clear single responsibility (render one search result) and will eventually be used
if SearchPage gets more complex (e.g., faceted search, virtual scrolling). Keeps `SearchPage`
readable. Follows the `NoteCard` precedent.

### 6. Headline XSS safety

PostgreSQL `ts_headline()` output contains only `<mark>content</mark>` wrappers around the
matched tokens. No user-authored HTML is rendered. The server never exposes user content via
`headline` without PostgreSQL processing it first through a fixed template
(`StartSel=<mark>, StopSel=</mark>`). Using `dangerouslySetInnerHTML` here is explicitly
permitted and documented in AGENTS.md.

---

## Reused Existing Code

| Existing asset | How reused |
|---|---|
| `components/notes/Pagination.tsx` | Drop-in on `SearchPage` — same `{ meta, onPageChange }` interface |
| `lib/utils.ts: formatRelativeTime` | Formats `result.updatedAt` in `SearchResultCard` (same as `NoteCard`) |
| `components/ui/button.tsx` | Submit button in search form |
| `shared: SearchResult, PaginationMeta` | Type imports in `useSearch.ts` and `SearchPage.tsx` |
| `lib/apiClient.ts` | HTTP client in `useSearch.ts` |

---

## Test Plan

File: `apps/web/src/hooks/__tests__/useSearch.test.ts`

Uses the same mock + wrapper pattern as `useNotes.test.ts`:
```typescript
vi.mock('../../lib/apiClient.js', () => ({ apiClient: { get: vi.fn() } }))
function makeWrapper() { /* fresh QueryClient per test */ }
```

| ID | Scenario | Assertion |
|---|---|---|
| SRCH-HOOK-01 | `q` is non-empty → fires `GET /notes/search` with correct params | `mockGet` called with `('/notes/search', { params: { q, page, limit } })` |
| SRCH-HOOK-02 | `q` is empty string → hook is disabled, no API call | `mockGet` NOT called; `isLoading` stays false |
| SRCH-HOOK-03 | Successful response → returns `{ data, meta }` | `result.current.data.data` has correct items |

**Test count after AB-1013:** existing 28 + 3 new = **31 tests passing**.

---

## Phase Breakdown

### Phase 1 — Hook (no UI deps)
- T-01: Create `apps/web/src/hooks/useSearch.ts`

Checkpoint: `pnpm --filter web build` — 0 type errors

### Phase 2 — Components
- T-02: Create `apps/web/src/components/search/SearchResultCard.tsx`

Checkpoint: `pnpm --filter web build` — 0 type errors

### Phase 3 — Page + Integration
- T-03: Create `apps/web/src/pages/search/SearchPage.tsx`
- T-04: Modify `apps/web/src/pages/notes/NotesListPage.tsx` — add search form to header
- T-05: Modify `apps/web/src/App.tsx` — wire `<SearchPage />`

Checkpoint: `pnpm -r lint && pnpm -r build` — 0 errors across all packages

### Phase 4 — Tests
- T-06: Create `apps/web/src/hooks/__tests__/useSearch.test.ts`

Checkpoint: `pnpm --filter web test` — 31 tests passing

### Phase 5 — Final quality gates
- T-07: `pnpm -r lint && pnpm -r build && pnpm --filter web test`

---

## DB / Shared Package Changes

**None.** This ticket is frontend-only.
- `SearchResult` type already in `packages/shared/src/types/api.types.ts` (line 34–38)
- `SearchQuerySchema` already in `packages/shared/src/schemas/search.schemas.ts`
- Both already exported from `packages/shared/src/index.ts`
