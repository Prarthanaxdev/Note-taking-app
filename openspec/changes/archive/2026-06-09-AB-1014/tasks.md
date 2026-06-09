# Tasks — AB-1014: Share Modal (Frontend)

## Phase 0 — Prerequisite

- [x] **T-00** Install `alert-dialog` shadcn component
  ```bash
  pnpm dlx shadcn@latest add alert-dialog
  ```
  Verifies: `apps/web/src/components/ui/alert-dialog.tsx` exists.

**Checkpoint 0:**
```bash
pnpm --filter web build    # alert-dialog resolves, 0 errors
```

---

## Phase 1 — Hook

- [x] **T-01** Create `apps/web/src/hooks/useShares.ts`
  - Export `useShareLinks(noteId: string)` — `GET /notes/:id/shares` → `ShareLink[]`, queryKey `['shares', noteId]`
  - Export `useCreateShareLink(noteId: string)` — `POST /notes/:id/share` → `ShareLink`, invalidates `['shares', noteId]` on success
  - Export `useRevokeShareLink(noteId: string)` — `DELETE /shares/:shareId` → 204, invalidates `['shares', noteId]` on success
  - Imports: `ShareLink` from `'shared'`, `apiClient` from `'../lib/apiClient.js'`

**Checkpoint 1:**
```bash
pnpm --filter web build
pnpm --filter web lint
```

---

## Phase 2 — Components [PARALLEL after T-01]

- [x] **T-02** Create `apps/web/src/components/share/ShareLinkRow.tsx`
  - Props: `{ link: ShareLink; noteId: string }`
  - Token preview: `link.token.slice(0, 8) + '…'`
  - Expiry: `link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : 'Never'`
  - View count: `{link.viewCount} views`
  - Copy button: `navigator.clipboard.writeText(window.location.origin + '/public/' + link.token)` → `setCopied(true)` → reset after 2 s via `useRef<ReturnType<typeof setTimeout>>` (cleared in `useEffect` cleanup)
  - Revoke button: opens `AlertDialog`; `AlertDialogAction` calls `useRevokeShareLink(noteId).mutate(link.id)`
  - Internal state: `copied: boolean`, `revokeOpen: boolean`

- [x] **T-03** Replace stub in `apps/web/src/components/share/ShareModal.tsx`
  - Props: `{ noteId: string; open: boolean; onOpenChange: (open: boolean) => void }`
  - Uses `useShareLinks(noteId)` and `useCreateShareLink(noteId)`
  - Generate form: native `<input type="date" min={minDate}>` (minDate = tomorrow, computed at render), Generate button disabled + spinner while `createLink.isPending`
  - On submit: convert `expiresAt` → ISO 8601 end-of-day datetime (`new Date(\`${expiresAt}T23:59:59\`).toISOString()`) if set; omit field if blank; reset to `''` in `onSuccess`
  - Loading state: 2 pulse skeleton rows while `isLoading`
  - Empty state: `<p>No active links yet.</p>` when links is empty
  - Links list: `links.map(link => <ShareLinkRow key={link.id} link={link} noteId={noteId} />)`

**Checkpoint 2:**
```bash
pnpm --filter web build
pnpm --filter web lint
```

---

## Phase 3 — Tests

- [x] **T-04** Create `apps/web/src/hooks/__tests__/useShares.test.ts`
  - Setup: `vi.mock('../../lib/apiClient.js', ...)` with `get`, `post`, `delete` mocks; `makeWrapper()` (fresh `QueryClient` per test, `retry: false`); `beforeEach` resets all mocks
  - **SHARE-HOOK-01** (spec: "Modal opens and shows existing share links") — `useShareLinks` calls `GET /notes/:id/shares`, returns `ShareLink[]`
  - **SHARE-HOOK-02** (spec: "Generate a permanent link") — `useCreateShareLink.mutate({})` calls `POST /notes/:id/share` with body `{}`
  - **SHARE-HOOK-03** (spec: "Generate a link with an expiry date") — `useCreateShareLink.mutate({ expiresAt: '2026-12-31T23:59:59.000Z' })` passes `expiresAt` in request body
  - **SHARE-HOOK-04** (spec: "Generate button disabled while in-flight") — `useCreateShareLink.onSuccess` calls `invalidateQueries({ queryKey: ['shares', noteId] })`
  - **SHARE-HOOK-05** (spec: "Confirming revoke removes the link") — `useRevokeShareLink.mutate('share-1')` calls `DELETE /shares/share-1`
  - **SHARE-HOOK-06** (spec: "Confirming revoke removes the link") — `useRevokeShareLink.onSuccess` calls `invalidateQueries({ queryKey: ['shares', noteId] })`

**Checkpoint 3 (final):**
```bash
pnpm --filter web test     # SHARE-HOOK-01 through SHARE-HOOK-06 all green
pnpm --filter web build
pnpm --filter web lint
```

---

## Spec Scenario → Task Mapping

| Spec Scenario | Task |
|---|---|
| Modal opens and shows existing links | T-01 (hook) + T-03 (modal list render) |
| Modal shows empty state | T-03 empty-state branch |
| Modal shows loading skeleton | T-03 loading branch |
| Generate a permanent link | T-03 handleGenerate (no expiresAt) |
| Generate a link with an expiry date | T-03 handleGenerate (date conversion) |
| Generate button disabled while in-flight | T-03 `createLink.isPending` |
| Copy URL writes to clipboard + flash | T-02 handleCopy + copied state |
| Public URL is correctly constructed | T-02 `window.location.origin + '/public/' + link.token` |
| Revoke requires confirmation | T-02 AlertDialog trigger |
| Confirming revoke removes the link | T-02 AlertDialogAction → mutate |
| Cancelling revoke leaves the link | T-02 AlertDialogCancel (no mutation) |
