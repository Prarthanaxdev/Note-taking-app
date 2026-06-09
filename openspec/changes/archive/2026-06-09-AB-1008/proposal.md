# Implementation Proposal — AB-1008: Note Sharing

| Field | Value |
|---|---|
| Ticket | AB-1008 |
| Status | **Awaiting Approval** |
| Scope | Backend — `apps/api` + one shared schema update |
| Depends on | AB-1004 (Note CRUD + soft-delete; `ShareLink` model and migrations in place) |
| Unblocks | AB-1014 (Share Modal frontend) |

---

## 1. Goal

Implement four endpoints for note sharing:

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/notes/:id/share` | Required | Create a new share link for a note |
| `GET` | `/api/v1/notes/:id/shares` | Required | List all share links for a note (all statuses) |
| `DELETE` | `/api/v1/shares/:shareId` | Required | Revoke a share link |
| `GET` | `/api/v1/public/notes/:token` | None | Read a shared note (public) |

The `ShareLink` Prisma model, `ShareLink` TypeScript type, and `shares.routes.ts` scaffold already exist. `shares.service.ts` does not exist yet.

---

## 2. Clarifying Decisions (recorded)

| Question | Decision |
|---|---|
| Route file for `POST /notes/:id/share` and `GET /notes/:id/shares` | Added to `notes.routes.ts` — they are sub-paths of `/notes/:id`. `shares.routes.ts` handles `DELETE /:shareId` and `GET /notes/:token` only. No change to `index.ts` needed. |
| `GET /notes/:id/shares` filter | Return ALL share links (including revoked and expired). Frontend renders status visually. |
| Public URL in `POST /notes/:id/share` response | Return raw `ShareLink` (token only). Frontend constructs the URL as `{CLIENT_ORIGIN}/public/notes/{token}`. No new type field needed. |
| `expiresAt` validation | Add `.refine()` to reject past dates — prevents creating immediately-inaccessible links. |
| Token generation | DB-generated via `@default(uuid())` in Prisma. Service reads token from the created record. |
| Auth on `GET /public/notes/:token` | No `authenticate` middleware — route is public by design. Auth is applied per-route in this codebase (not at Router level), so the dual-mount of `sharesRouter` at both `/api/v1/shares` and `/api/v1/public` is safe. |

---

## 3. Files to Create or Modify

### 3.1 Shared Package

| File | Change |
|---|---|
| `packages/shared/src/schemas/shares.schemas.ts` | Add `.refine()` on `expiresAt` to reject past datetimes |

No new shared types — `ShareLink` is already exported from `api.types.ts`.

### 3.2 API

| File | Change |
|---|---|
| `apps/api/src/services/shares.service.ts` | **Create** — `createShareLink`, `listShareLinks`, `revokeShareLink`, `getPublicNote` |
| `apps/api/src/routes/notes.routes.ts` | Add `POST /:id/share` and `GET /:id/shares` with imports |
| `apps/api/src/routes/shares.routes.ts` | Add `DELETE /:shareId` and `GET /notes/:token` (public, no auth) |
| `apps/api/src/services/__tests__/shares.service.test.ts` | **Create** — unit tests |
| `apps/api/src/routes/__tests__/shares.routes.integration.ts` | **Create** — integration tests |

### 3.3 Already Correct (no changes needed)

| File | Why |
|---|---|
| `packages/shared/src/types/api.types.ts` | `ShareLink` type already exported |
| `packages/shared/src/types/errors.types.ts` | `NOT_FOUND` and `VALIDATION_ERROR` already in `AppErrorCode` union |
| `packages/shared/src/index.ts` | `CreateShareSchema` already re-exported |
| `apps/api/src/index.ts` | `sharesRouter` already mounted at `/api/v1/shares` AND `/api/v1/public` |

---

## 4. Detailed Design

### 4.1 Shared Schema Change

**`packages/shared/src/schemas/shares.schemas.ts`**

```typescript
// Before (already exists)
export const CreateShareSchema = z.object({
  expiresAt: z.string().datetime().optional(),
});

// After
export const CreateShareSchema = z.object({
  expiresAt: z
    .string()
    .datetime()
    .refine(d => new Date(d) > new Date(), {
      message: 'Expiry date must be in the future',
    })
    .optional(),
});
```

`.datetime()` validates format first; `.refine()` rejects past timestamps; `.optional()` wraps the entire chain so the field is not required. When `expiresAt` is omitted, the refine never runs — correct.

### 4.2 `shares.service.ts`

```typescript
import type { z } from 'zod';
import type { ShareLink } from 'shared';
import { CreateShareSchema } from 'shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

function toShareLink(link: {
  id: string; noteId: string; userId: string; token: string;
  expiresAt: Date | null; revokedAt: Date | null;
  viewCount: number; createdAt: Date;
}): ShareLink {
  return {
    id: link.id,
    noteId: link.noteId,
    userId: link.userId,
    token: link.token,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    viewCount: link.viewCount,
    createdAt: link.createdAt.toISOString(),
  };
}

export async function createShareLink(
  userId: string,
  noteId: string,
  dto: z.infer<typeof CreateShareSchema>,
): Promise<ShareLink> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
  });
  if (!note) throw new AppError('NOT_FOUND', 'Not found.', 404);

  const link = await prisma.shareLink.create({
    data: {
      noteId,
      userId,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    },
  });
  return toShareLink(link);
}

export async function listShareLinks(
  userId: string,
  noteId: string,
): Promise<ShareLink[]> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, userId, deletedAt: null },
  });
  if (!note) throw new AppError('NOT_FOUND', 'Not found.', 404);

  const links = await prisma.shareLink.findMany({
    where: { noteId },
    orderBy: { createdAt: 'desc' },
  });
  return links.map(toShareLink);
}

export async function revokeShareLink(
  userId: string,
  shareId: string,
): Promise<void> {
  const link = await prisma.shareLink.findFirst({
    where: { id: shareId, userId },
  });
  if (!link) throw new AppError('NOT_FOUND', 'Not found.', 404);

  await prisma.shareLink.update({
    where: { id: shareId },
    data: { revokedAt: new Date() },
  });
}

export async function getPublicNote(
  token: string,
): Promise<{ title: string; content: object | null }> {
  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { note: true },
  });

  const now = new Date();
  const isActive =
    link !== null &&
    link.revokedAt === null &&
    (link.expiresAt === null || link.expiresAt > now);
  const noteAccessible = isActive && link!.note.deletedAt === null;

  if (!noteAccessible) throw new AppError('NOT_FOUND', 'Not found.', 404);

  await prisma.shareLink.update({
    where: { token },
    data: { viewCount: { increment: 1 } },
  });

  return {
    title: link!.note.title,
    content: link!.note.content as object | null,
  };
}
```

Key points:
- `findFirst({ where: { id, userId } })` pattern for authorization (NOT_FOUND over 403 — AGENTS.md)
- Note ownership and `deletedAt` checks for create and list
- `revokedAt` ownership check for revoke: only the link creator can revoke
- `viewCount: { increment: 1 }` atomic update — never read-modify-write (AGENTS.md)
- `getPublicNote` uses `findUnique` (unique token index) then validates in application code — single query with include
- `toShareLink` helper maps all `Date` → ISO string for API response consistency

### 4.3 Route Changes — `notes.routes.ts`

Add two imports:
```typescript
import { CreateNoteSchema, UpdateNoteSchema, NoteListQuerySchema, SearchQuerySchema, CreateShareSchema } from 'shared';
import * as sharesService from '../services/shares.service.js';
```

Add before `GET /:id`:
```typescript
notesRouter.post(
  '/:id/share',
  authenticate,
  validate(CreateShareSchema),
  async (req, res, next) => {
    try {
      const link = await sharesService.createShareLink(req.user.id, req.params.id, req.body);
      res.status(201).json(link);
    } catch (err) { next(err); }
  },
);

notesRouter.get(
  '/:id/shares',
  authenticate,
  async (req, res, next) => {
    try {
      const links = await sharesService.listShareLinks(req.user.id, req.params.id);
      res.json(links);
    } catch (err) { next(err); }
  },
);
```

Route order note: `/:id/share` and `/:id/shares` have two path segments, so they cannot conflict with `/:id` (one segment). Ordering relative to `/:id` is not critical here — unlike `/search` vs `/:id`.

### 4.4 Route Changes — `shares.routes.ts`

```typescript
import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as sharesService from '../services/shares.service.js';

export const sharesRouter: IRouter = Router();

// DELETE /api/v1/shares/:shareId — revoke a share link (auth required)
sharesRouter.delete(
  '/:shareId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await sharesService.revokeShareLink(req.user.id, req.params.shareId);
      res.status(204).send();
    } catch (err) { next(err); }
  },
);

// GET /api/v1/public/notes/:token — public read (no auth)
// Mounted via app.use('/api/v1/public', sharesRouter) in index.ts
sharesRouter.get(
  '/notes/:token',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await sharesService.getPublicNote(req.params.token);
      res.json(result);
    } catch (err) { next(err); }
  },
);
```

Dual-mount effect:
- `DELETE /api/v1/shares/:shareId` ✓ (auth-protected)
- `GET /api/v1/public/notes/:token` ✓ (public — no auth middleware)

---

## 5. Security Invariants

| Invariant | Implementation |
|---|---|
| `userId` from JWT only | `req.user.id` passed to service; never from body or params |
| Authorization in service layer | `findFirst({ where: { id, userId } })` for create, list, revoke |
| 404 over 403 | Cross-user access to notes/links returns NOT_FOUND |
| Public endpoint exposes no user data | `getPublicNote` returns only `{ title, content }` — no `userId`, no tags, no share metadata |
| Atomic viewCount | `{ increment: 1 }` — never read-modify-write |
| Revoke is permanent | No re-activate operation; `revokedAt` is write-once |
| Soft-deleted notes inaccessible | `link.note.deletedAt === null` check in `getPublicNote` |
| No auth on public route | `GET /notes/:token` handler has no `authenticate` middleware |

---

## 6. Implementation Order

| Step | Task |
|---|---|
| 1 | Update `CreateShareSchema` — add `.refine()` for future date |
| 2 | Create `shares.service.ts` with all four functions |
| 3 | Update `notes.routes.ts` — add `POST /:id/share` and `GET /:id/shares` |
| 4 | Update `shares.routes.ts` — add `DELETE /:shareId` and `GET /notes/:token` |
| 5 | Write unit tests — `shares.service.test.ts` |
| 6 | Write integration tests — `shares.routes.integration.ts` |
| 7 | Quality gates: lint → build → test |

---

## 7. Quality Gate Checkpoints

```bash
pnpm -r lint          # 0 errors
pnpm -r build         # 0 type errors
pnpm --filter api test  # all unit tests pass
```

---

## 8. Out of Scope

| Item | Ticket |
|---|---|
| Share Modal frontend (generate/copy/revoke UI) | AB-1014 |
| Version history endpoints | AB-1009 |
| Unauthenticated search | Not in FRS |
| Share link listing for anonymous visitors | Not in FRS |
