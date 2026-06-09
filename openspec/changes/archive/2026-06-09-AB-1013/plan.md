# Plan — AB-1013: Search UI (Frontend)

> Technical detail lives in `design.md` (required by the spec-driven schema).
> This file is a concise reference summary for quick orientation.

## Files Changed

| File | Action |
|---|---|
| `apps/web/src/hooks/useSearch.ts` | New — `useSearch(params)` hook |
| `apps/web/src/components/search/SearchResultCard.tsx` | New — result card with mark highlighting |
| `apps/web/src/pages/search/SearchPage.tsx` | New — URL-driven search page |
| `apps/web/src/pages/notes/NotesListPage.tsx` | Modified — add search form to header |
| `apps/web/src/App.tsx` | Modified — wire `/search` route to `SearchPage` |
| `apps/web/src/hooks/__tests__/useSearch.test.ts` | New — 3 hook unit tests |

**No DB migrations. No shared package changes.**

## Phase Order

1. `useSearch.ts` — hook with `enabled` guard
2. `SearchResultCard.tsx` — display component
3. `SearchPage.tsx` + `NotesListPage.tsx` + `App.tsx` — integration
4. `useSearch.test.ts` — tests

## Checkpoints

```bash
pnpm --filter web build   # after each phase
pnpm -r lint              # after Phase 3
pnpm --filter web test    # after Phase 4 — expect 31 tests passing
pnpm -r build             # final gate
```

## Key Invariants

- `useSearch` query key: `['search', { q, page, limit }]`
- `enabled: params.q.trim().length > 0` — never call API with empty q
- `dangerouslySetInnerHTML` for headline — safe, server-generated via `ts_headline()`
- `<mark>` styling via Tailwind `[&_mark]:bg-yellow-200 [&_mark]:rounded [&_mark]:px-0.5`
- `inputValue` (local state) vs `q` (URL param) — submit bridges them; `useEffect([q])` syncs on back/forward
- Pagination component reused unchanged from AB-1011
- `formatRelativeTime` reused from `lib/utils.ts`
