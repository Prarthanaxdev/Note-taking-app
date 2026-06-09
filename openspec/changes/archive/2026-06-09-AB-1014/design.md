# Design — AB-1014: Share Modal (Frontend)

## Architecture

Three new units — one hook file, two components — plus tests. No changes to
`packages/shared`, no new routes, no DB migrations. The stub `ShareModal` is replaced
in-place; the component tree wiring (already in `NoteEditorPage`) is unchanged.

```
apps/web/src/
  hooks/
    useShares.ts                     ← new: three TanStack Query operations
    __tests__/
      useShares.test.ts              ← new: unit tests (no MSW, direct mock)
  components/share/
    ShareLinkRow.tsx                 ← new: one row per active link
    ShareModal.tsx                   ← replace stub with full implementation
```

---

## TypeScript Interfaces

### `hooks/useShares.ts` exports

```ts
import type { ShareLink } from 'shared';
import { apiClient } from '../lib/apiClient.js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Query
export function useShareLinks(noteId: string): UseQueryResult<ShareLink[]>
// queryKey: ['shares', noteId]
// queryFn: GET /notes/:id/shares → ShareLink[]

// Create mutation
export function useCreateShareLink(noteId: string): UseMutationResult<ShareLink, unknown, { expiresAt?: string }>
// mutationFn: POST /notes/:id/share → ShareLink (201)
// onSuccess: invalidate ['shares', noteId]

// Revoke mutation
export function useRevokeShareLink(noteId: string): UseMutationResult<void, unknown, string>
// mutationFn: (shareId: string) => DELETE /shares/:shareId → 204
// onSuccess: invalidate ['shares', noteId]
```

### `components/share/ShareLinkRow.tsx`

```ts
interface ShareLinkRowProps {
  link: ShareLink;   // from 'shared'
  noteId: string;    // passed to useRevokeShareLink
}
```

Internal state:
- `copied: boolean` — flash "✓ Copied!" for 2 s; controlled by `setTimeout` (cleared on unmount)
- `revokeOpen: boolean` — AlertDialog open/close; each row owns its own

### `components/share/ShareModal.tsx`

```ts
interface ShareModalProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

Internal state:
- `expiresAt: string` — controlled value for `<input type="date">`, initially `''`

---

## Key Design Decisions

### AlertDialog for revoke confirmation (shadcn `alert-dialog`)
The `alert-dialog` shadcn component is **not yet installed**. Must be added as the first
task before any component code:
```bash
pnpm dlx shadcn@latest add alert-dialog
```
This generates `apps/web/src/components/ui/alert-dialog.tsx`. All imports use the `.js`
extension alias (`../ui/alert-dialog.js`) consistent with the rest of the codebase.

### Inline "Copied!" state — no external dependency
```tsx
const [copied, setCopied] = useState(false);
const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

function handleCopy() {
  const url = `${window.location.origin}/public/${link.token}`;
  navigator.clipboard.writeText(url);
  setCopied(true);
  clearTimeout(timeoutRef.current);
  timeoutRef.current = setTimeout(() => setCopied(false), 2000);
}

useEffect(() => () => clearTimeout(timeoutRef.current), []);
```
`useRef` for the timeout handle avoids stale closures and ensures cleanup on unmount.

### Date input → ISO 8601 datetime conversion
The native `<input type="date">` yields `"YYYY-MM-DD"`. API expects ISO 8601 datetime:
```ts
// In ShareModal handleGenerate
const body: { expiresAt?: string } = {};
if (expiresAt) body.expiresAt = new Date(`${expiresAt}T23:59:59`).toISOString();
```
End-of-day (23:59:59 local time) matches user intent: the link stays valid throughout
the selected day. `new Date(...)` uses the browser's local timezone, which is appropriate
for a date picker.

### `min` for date picker
Tomorrow in `"YYYY-MM-DD"` format — computed at render time (not module load, to avoid
stale values when the modal stays open overnight):
```ts
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const minDate = tomorrow.toISOString().split('T')[0];
```

### Query key strategy
| Query | Key |
|---|---|
| List share links for a note | `['shares', noteId]` |
| Invalidate after create | `{ queryKey: ['shares', noteId] }` |
| Invalidate after revoke | `{ queryKey: ['shares', noteId] }` |

Both mutations invalidate the same key, so the list re-fetches automatically with no
optimistic update needed (share links are rarely more than a handful).

### Token preview
`link.token.slice(0, 8) + '…'` — first 8 chars of the UUID (format: `xxxxxxxx-...`).

### Expiry display
```ts
link.expiresAt
  ? new Date(link.expiresAt).toLocaleDateString()
  : 'Never'
```

### `ShareModal` loading states
- `isLoading`: skeleton (2 pulse rows, matching link row height)
- empty array: "No active links yet." paragraph
- links present: `ShareLinkRow` list

---

## Component Layout Sketch

```
<Dialog>                          ShareModal
  <DialogHeader>
    <DialogTitle>Share this note</DialogTitle>
  </DialogHeader>

  <form onSubmit={handleGenerate}>   ← Generate form
    <input type="date" min={minDate} value={expiresAt} onChange={...} />
    <Button type="submit" disabled={createLink.isPending}>
      {createLink.isPending ? <spinner /> : 'Generate'}
    </Button>
  </form>

  <Separator />

  {isLoading && <ShareLinkSkeleton />}
  {!isLoading && links.length === 0 && <p>No active links yet.</p>}
  {!isLoading && links.map(link =>
    <ShareLinkRow key={link.id} link={link} noteId={noteId} />
  )}
</Dialog>

<ShareLinkRow>
  <span>{link.token.slice(0,8)}…</span>
  <span>{expiry}</span>
  <span>{link.viewCount} views</span>
  <Button onClick={handleCopy}>{copied ? '✓ Copied!' : 'Copy URL'}</Button>
  <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
    <AlertDialogTrigger asChild>
      <Button variant="destructive">Revoke</Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>...</AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={handleRevoke}>Revoke</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</ShareLinkRow>
```

---

## No Changes Required

- `packages/shared` — `ShareLink` type + `CreateShareSchema` already exported
- `apps/api` — share endpoints already live (AB-1008)
- `App.tsx` — no new routes
- `NoteEditorPage` — already wires `<ShareModal noteId={note.id} ...>`; interface unchanged
