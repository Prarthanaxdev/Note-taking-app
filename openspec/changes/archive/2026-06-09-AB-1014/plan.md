# Plan — AB-1014: Share Modal (Frontend)

## Overview

Replace the `ShareModal` stub with a full share-link management UI. Four units total:
`useShares.ts` hook, `ShareLinkRow.tsx`, `ShareModal.tsx` (replace stub), and
`useShares.test.ts`. No backend changes, no shared-package changes, no new routes.

---

## Phase 0 — Prerequisite: install `alert-dialog` shadcn component

```bash
pnpm dlx shadcn@latest add alert-dialog
```

Generates `apps/web/src/components/ui/alert-dialog.tsx`.
**Must complete before any component code — `ShareLinkRow` imports it.**

Checkpoint: `pnpm --filter web build` — 0 errors.

---

## Phase 1 — Hook (`useShares.ts`)

**File:** `apps/web/src/hooks/useShares.ts`

Three exports:

```ts
// 1. List
export function useShareLinks(noteId: string) {
  return useQuery<ShareLink[]>({
    queryKey: ['shares', noteId],
    queryFn: () => apiClient.get(`/notes/${noteId}/shares`).then(r => r.data),
  });
}

// 2. Create
export function useCreateShareLink(noteId: string) {
  const qc = useQueryClient();
  return useMutation<ShareLink, unknown, { expiresAt?: string }>({
    mutationFn: (body) => apiClient.post(`/notes/${noteId}/share`, body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares', noteId] }),
  });
}

// 3. Revoke
export function useRevokeShareLink(noteId: string) {
  const qc = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (shareId) => apiClient.delete(`/shares/${shareId}`).then(() => undefined),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shares', noteId] }),
  });
}
```

---

## Phase 2 — `ShareLinkRow` component

**File:** `apps/web/src/components/share/ShareLinkRow.tsx`

- Props: `{ link: ShareLink; noteId: string }`
- Local state: `copied: boolean`, `revokeOpen: boolean`
- `useRef<ReturnType<typeof setTimeout>>` for copy timeout — cleared on unmount via `useEffect` cleanup
- Uses `useRevokeShareLink(noteId)` internally (not passed as prop)
- Public URL: `${window.location.origin}/public/${link.token}`
- Token preview: `link.token.slice(0, 8) + '…'`
- Expiry: `link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'Never'`
- AlertDialog wraps the Revoke button; `AlertDialogAction` triggers `revokeLink.mutate(link.id)` and closes dialog

---

## Phase 3 — `ShareModal` full implementation

**File:** `apps/web/src/components/share/ShareModal.tsx` (replace stub entirely)

- Props: `{ noteId: string; open: boolean; onOpenChange: (open: boolean) => void }`
- Uses `useShareLinks(noteId)` and `useCreateShareLink(noteId)`
- Local state: `expiresAt: string` (initially `''`), for the date input
- `minDate` computed at render: `new Date()` + 1 day → `.toISOString().split('T')[0]`
- On generate submit: convert `expiresAt` to ISO datetime (end-of-day local) if set, POST, reset `expiresAt` to `''` in `onSuccess`
- Loading skeleton: 2 pulse rows (same height as a `ShareLinkRow`)
- Empty state: `<p>No active links yet.</p>`

---

## Phase 4 — Tests

**File:** `apps/web/src/hooks/__tests__/useShares.test.ts`

Same pattern as `useSearch.test.ts` and `useTags.test.ts`:
- `vi.mock('../../lib/apiClient.js', ...)` with `get`, `post`, `delete` mocks
- `makeWrapper()` — fresh `QueryClient` per test
- `beforeEach` resets all mocks

| Test ID | Spec scenario | What it verifies |
|---|---|---|
| SHARE-HOOK-01 | Listing active links | `useShareLinks` calls `GET /notes/:id/shares`, returns `ShareLink[]` |
| SHARE-HOOK-02 | Generate permanent link | `useCreateShareLink` calls `POST /notes/:id/share` with no `expiresAt` |
| SHARE-HOOK-03 | Generate with expiry | `useCreateShareLink` passes `expiresAt` field in body |
| SHARE-HOOK-04 | Invalidation after create | `useCreateShareLink.onSuccess` invalidates `['shares', noteId]` |
| SHARE-HOOK-05 | Revoke link | `useRevokeShareLink` calls `DELETE /shares/:shareId` |
| SHARE-HOOK-06 | Invalidation after revoke | `useRevokeShareLink.onSuccess` invalidates `['shares', noteId]` |

---

## Phase Checkpoints

```bash
# After Phase 0
pnpm --filter web build         # alert-dialog component resolves

# After Phase 1
pnpm --filter web build         # useShares compiles
pnpm --filter web lint

# After Phase 2 + 3
pnpm --filter web build         # ShareLinkRow + ShareModal compile
pnpm --filter web lint

# After Phase 4
pnpm --filter web test          # all SHARE-HOOK tests green
pnpm --filter web build
pnpm --filter web lint
```

---

## Spec Scenario Coverage

| Spec scenario | Implementation location |
|---|---|
| Modal shows existing links | `ShareModal` → `useShareLinks` → `ShareLinkRow` map |
| Modal shows empty state | `ShareModal` empty-state branch |
| Modal shows loading skeleton | `ShareModal` `isLoading` branch |
| Generate permanent link | `ShareModal` handleGenerate — omits `expiresAt` |
| Generate link with expiry | `ShareModal` handleGenerate — converts date to ISO datetime |
| Generate button disabled while pending | `createLink.isPending` disables button |
| Copy URL writes to clipboard + flash | `ShareLinkRow` `handleCopy` + `copied` state |
| Public URL construction | `ShareLinkRow` `window.location.origin + '/public/' + link.token` |
| Revoke requires confirmation | `ShareLinkRow` AlertDialog trigger (no DELETE until confirmed) |
| Confirming revoke removes link | `ShareLinkRow` AlertDialogAction → `revokeLink.mutate` → invalidate |
| Cancelling revoke leaves link | `ShareLinkRow` AlertDialogCancel — no mutation called |

---

## Files Summary

| File | Action |
|---|---|
| `apps/web/src/components/ui/alert-dialog.tsx` | Create (via shadcn CLI) |
| `apps/web/src/hooks/useShares.ts` | Create |
| `apps/web/src/components/share/ShareLinkRow.tsx` | Create |
| `apps/web/src/components/share/ShareModal.tsx` | Replace stub |
| `apps/web/src/hooks/__tests__/useShares.test.ts` | Create |

No changes to `packages/shared`, `apps/api`, or `App.tsx`.
