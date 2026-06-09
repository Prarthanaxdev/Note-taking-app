# Proposal — AB-1014: Share Modal (Frontend)

## Summary

Replace the `ShareModal` stub (added in AB-1012) with a full implementation:

1. **`useShares` hook** — three TanStack Query operations wrapping the share API:
   `useShareLinks` (list), `useCreateShareLink` (generate), `useRevokeShareLink` (delete).
2. **`ShareLinkRow` component** — renders one active share link: token preview, expiry,
   view count, inline "Copied!" copy feedback, and a "Revoke" button with confirmation dialog.
3. **`ShareModal` full implementation** — replaces the stub; loads links via `useShareLinks`,
   renders each as a `ShareLinkRow`, and provides a "Generate Link" form with an optional
   native `<input type="date">` expiry picker.

The backend share endpoints (`POST /notes/:id/share`, `GET /notes/:id/shares`,
`DELETE /shares/:shareId`) were implemented in AB-1008 and are already live.
No changes to `packages/shared` are required — `ShareLink` type and `CreateShareSchema`
already exist.

---

## Capabilities

| Capability | Spec file |
|---|---|
| `share-modal` | `specs/share-modal/spec.md` |

---

## Files Changed

### Modified files

| File | Change |
|---|---|
| `apps/web/src/components/share/ShareModal.tsx` | Replace stub with full implementation |

### New files

| File | Purpose |
|---|---|
| `apps/web/src/hooks/useShares.ts` | `useShareLinks`, `useCreateShareLink`, `useRevokeShareLink` hooks |
| `apps/web/src/components/share/ShareLinkRow.tsx` | Single link row: token + expiry + viewCount + copy + revoke |
| `apps/web/src/hooks/__tests__/useShares.test.ts` | Unit tests for all three hooks |

---

## Key Design Decisions

### Public URL construction
`window.location.origin + '/public/' + shareLink.token` — constructed at render time in
`ShareLinkRow`. No env var required; works correctly in dev and prod.

### Inline "Copied!" feedback (no toast dependency)
The "Copy URL" button uses a local `copied: boolean` state. On click:
1. `navigator.clipboard.writeText(url)` is called.
2. `setCopied(true)` shows "✓ Copied!" for 2 seconds, then `setCopied(false)` resets.
No new npm dependency required.

### `useShares` query key strategy
- `useShareLinks(noteId)`: queryKey `['shares', noteId]`
- After `useCreateShareLink` or `useRevokeShareLink` succeeds: `invalidateQueries({ queryKey: ['shares', noteId] })`
  so the list auto-refreshes.

### Expiry date picker
Native `<input type="date">` with `min` set to tomorrow's date (ISO string). The value is
converted to an ISO 8601 datetime string before sending to `POST /notes/:id/share`.
If no date is selected, `expiresAt` is omitted from the request body (permanent link).

### Revoke confirmation
Inline `AlertDialog` (shadcn) inside `ShareLinkRow`. No external state needed — each row
owns its own confirm open/close state. Destructive action: permanently revokes the link
(BR-SHARE-07: no re-activate).

### `ShareModal` loading states
- While `useShareLinks` is loading: show a subtle spinner/skeleton inside the dialog.
- If `useShareLinks` returns an empty array: show "No active links yet." empty state.
- New link appears optimistically after `useCreateShareLink.onSuccess` invalidates the query.

---

## Interface Contracts

```typescript
// hooks/useShares.ts
export function useShareLinks(noteId: string)
// GET /notes/:id/shares → ShareLink[]
// queryKey: ['shares', noteId]

export function useCreateShareLink(noteId: string)
// POST /notes/:id/share → ShareLink (201)
// mutationFn: ({ expiresAt?: string }) => ...
// onSuccess: invalidate ['shares', noteId]

export function useRevokeShareLink(noteId: string)
// DELETE /shares/:shareId → 204
// mutationFn: (shareId: string) => ...
// onSuccess: invalidate ['shares', noteId]
```

```typescript
// components/share/ShareLinkRow.tsx
interface ShareLinkRowProps {
  link: ShareLink;  // from 'shared'
  noteId: string;   // needed to pass to useRevokeShareLink
}
// Public URL: `${window.location.origin}/public/${link.token}`
// copy: navigator.clipboard.writeText(url) + setCopied(true) → reset after 2s
// revoke: AlertDialog confirm → useRevokeShareLink.mutate(link.id)
```

```typescript
// components/share/ShareModal.tsx (full)
interface ShareModalProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
// Uses useShareLinks(noteId) and useCreateShareLink(noteId)
// Generate form: expiresAt input (optional) + Submit button
// List: map over active links → <ShareLinkRow />
```

---

## Dependencies

- AB-1008 (backend shares): `POST /notes/:id/share`, `GET /notes/:id/shares`,
  `DELETE /shares/:shareId` — already implemented
- AB-1012 (ShareModal stub): already in the component tree; this ticket replaces its body
- `packages/shared`: `ShareLink` type, `CreateShareSchema` — already exported
- shadcn `AlertDialog` component needed for revoke confirmation — must be added via
  `pnpm dlx shadcn@latest add alert-dialog`

---

## Out of Scope

- Public share page (`PublicNotePage`) — AB-1016 (E2E tests)
- Expired link display (links with `expiresAt < now()`) — backend filters these out of
  `GET /notes/:id/shares`; frontend only shows what the API returns
- Editing an existing share link's expiry — not in the FRS; revoke + re-generate is the flow
