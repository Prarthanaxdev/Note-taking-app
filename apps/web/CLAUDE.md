# CLAUDE.md — apps/web

@../../AGENTS.md

---

## Frontend-Specific Commands

```bash
pnpm dev                        # Vite dev server on :5173
pnpm build                      # Vite production build
pnpm preview                    # Preview production build locally
pnpm test                       # Vitest + React Testing Library
pnpm test:coverage              # Coverage report (gate: ≥80%)
pnpm lint                       # ESLint
```

---

## Component & State Management Patterns

**Server state lives in hooks/** — use TanStack Query. Never fetch directly in a component.
```ts
// hooks/useNotes.ts — owns all notes server state
export const useNotes = (params) => useQuery({ queryKey: ['notes', params], queryFn: ... });
```

**Client state lives in store/** — Zustand only for: `accessToken`, `user`, modal/drawer open flags. Nothing else.

**After any mutation:** call `queryClient.invalidateQueries({ queryKey: ['notes'] })` in `onSuccess` to keep list/detail views consistent.

**TanStack Query config (queryClient.ts):** `staleTime: 60_000`, `gcTime: 300_000`, `retry: 1`, `refetchOnWindowFocus: true`. Don't override per-query without a reason.

**Auth guard:** check `authStore.accessToken` in `App.tsx` on mount → attempt silent refresh → redirect to `/login` on failure. Never protect routes any other way.

**Silent refresh:** handled by the response interceptor in `lib/apiClient.ts`. Do not add 401 handling anywhere else — it will double-trigger refreshes.

**TipTap autosave:** debounce with `setTimeout` / `clearTimeout` inside `useEffect`. Dep array = `[title, content]`. Fire `PATCH /notes/:id` after 2 000 ms of no changes.

**Forms:** shadcn/ui `<Form>` + `react-hook-form` + `zodResolver`. Zod schema always comes from `packages/shared` — never inline a validation schema.

---

## Anti-Patterns

- No `localStorage` or `sessionStorage` for the access token — Zustand memory only
- No direct `axios`/`fetch` calls in components — go through a hook in `hooks/`
- No inline Zod schemas — import from `packages/shared`
- No server state in Zustand — TanStack Query owns it
- No raw `dangerouslySetInnerHTML` except search headlines (HTML comes from our own server via `ts_headline`)
- No auth logic scattered across pages — silent refresh lives only in `apiClient.ts`
- No `useEffect` for data fetching — use TanStack Query hooks
