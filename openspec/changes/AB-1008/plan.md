# Technical Plan — AB-1008: Note Sharing

| Field | Value |
|---|---|
| Ticket | AB-1008 |
| Branch | `feature/AB-1008-shares-service` |
| Status | **Awaiting Approval** |
| Depends on | AB-1004 (`ShareLink` Prisma model + migration already applied) |
| Unblocks | AB-1014 (Share Modal frontend) |

---

## 1. Summary

Implement four share-link endpoints on top of the already-migrated `ShareLink` schema. One schema refinement in `packages/shared`; one new service; route additions to two existing files; two new test files. No DB migrations needed.

**Endpoint map:**

| Method | Path | Router file | Auth |
|---|---|---|---|
| `POST` | `/api/v1/notes/:id/share` | `notes.routes.ts` | JWT required |
| `GET` | `/api/v1/notes/:id/shares` | `notes.routes.ts` | JWT required |
| `DELETE` | `/api/v1/shares/:shareId` | `shares.routes.ts` | JWT required |
| `GET` | `/api/v1/public/notes/:token` | `shares.routes.ts` | **None** |

---

## 2. Files to Change

| File | Action | Notes |
|---|---|---|
| `packages/shared/src/schemas/shares.schemas.ts` | **Edit** | Add `.refine()` for future-date check on `expiresAt` |
| `apps/api/src/services/shares.service.ts` | **Create** | 4 functions: `createShareLink`, `listShareLinks`, `revokeShareLink`, `getPublicNote` |
| `apps/api/src/routes/notes.routes.ts` | **Edit** | Add `POST /:id/share` and `GET /:id/shares`; add imports |
| `apps/api/src/routes/shares.routes.ts` | **Edit** | Add `DELETE /:shareId` and `GET /notes/:token` to empty router |
| `apps/api/src/services/__tests__/shares.service.test.ts` | **Create** | 15 unit tests (SHARE-UT-01 through SHARE-UT-15) |
| `apps/api/src/routes/__tests__/shares.routes.integration.ts` | **Create** | 23 integration tests (SHARE-IT-01 through SHARE-IT-23) |

**Already correct — no changes:**

| File | Why |
|---|---|
| `packages/shared/src/types/api.types.ts` | `ShareLink` type already exported |
| `packages/shared/src/types/errors.types.ts` | `NOT_FOUND`, `VALIDATION_ERROR`, `UNAUTHORIZED` already in union |
| `packages/shared/src/index.ts` | `CreateShareSchema` already re-exported |
| `apps/api/src/index.ts` | `sharesRouter` already mounted at `/api/v1/shares` AND `/api/v1/public` |
| Prisma schema / migrations | `ShareLink` model + token `@default(uuid())` already present |

---

## 3. TypeScript Shapes

All types sourced from `packages/shared` — no new types needed.

```typescript
// packages/shared/src/types/api.types.ts — already exists, unchanged
type ShareLink = {
  id: string;
  noteId: string;
  userId: string;
  token: string;
  expiresAt: string | null;   // ISO 8601 string, null if never expires
  revokedAt: string | null;   // ISO 8601 string, null if still active
  viewCount: number;
  createdAt: string;           // ISO 8601 string
};

// Public endpoint response — not in shared (inline type in service)
type PublicNoteResponse = { title: string; content: object | null };
```

---

## 4. Schema Change (packages/shared)

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

**Why:** `.datetime()` validates format. `.refine()` rejects past timestamps — prevents creating links that are immediately inaccessible (BR-SHARE-04). `.optional()` wraps the chain: when `expiresAt` is absent, the refine never runs.

---

## 5. Service Implementation — `apps/api/src/services/shares.service.ts`

### Prisma model reminder

```
ShareLink: { id, noteId, note, userId, user, token (uuid, unique, @default(uuid())),
             expiresAt?, revokedAt?, viewCount (default 0), createdAt }
```

### Helper: `toShareLink`

```typescript
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
```

Same `Date → .toISOString()` pattern as `toNoteDetail` in `notes.service.ts`.

### `createShareLink(userId, noteId, dto)`

```typescript
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
    data: { noteId, userId, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null },
  });
  return toShareLink(link);
}
```

- `findFirst({ where: { id, userId, deletedAt: null } })` — ownership + soft-delete check in one query (matches `notes.service.ts` pattern exactly)
- Token generated by DB `@default(uuid())` — no `crypto.randomUUID()` needed
- `expiresAt` coerced to `Date` only if provided; otherwise `null`

### `listShareLinks(userId, noteId)`

```typescript
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
```

- Returns ALL links (active + revoked + expired) — decision recorded
- Note ownership verified before listing (prevents cross-user discovery)

### `revokeShareLink(userId, shareId)`

```typescript
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
```

- Authorization via `{ id: shareId, userId }` — matches `tags.service.ts: deleteTag` pattern
- `revokedAt` set to current time — permanent, no re-activate (BR-SHARE-07)

### `getPublicNote(token)`

```typescript
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
  const accessible = isActive && link!.note.deletedAt === null;

  if (!accessible) throw new AppError('NOT_FOUND', 'Not found.', 404);

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

- `findUnique` on the `token` unique index — single DB query with `include: { note: true }`
- All validation in application code after the query (no extra round-trips)
- `{ increment: 1 }` — atomic UPDATE, never read-modify-write (AGENTS.md constraint)
- Returns ONLY `title` + `content` — no tags, userId, or share metadata (BR-SHARE-06)

---

## 6. Route Changes

### `apps/api/src/routes/notes.routes.ts`

**New imports** (extend existing import line):
```typescript
import { CreateNoteSchema, UpdateNoteSchema, NoteListQuerySchema, SearchQuerySchema, CreateShareSchema } from 'shared';
import * as sharesService from '../services/shares.service.js';
```

**Two new handlers — add after `GET /search`, before `GET /:id`:**

```typescript
notesRouter.post(
  '/:id/share',
  authenticate,
  validate(CreateShareSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const link = await sharesService.createShareLink(req.user.id, req.params.id, req.body);
      res.status(201).json(link);
    } catch (err) { next(err); }
  },
);

notesRouter.get(
  '/:id/shares',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const links = await sharesService.listShareLinks(req.user.id, req.params.id);
      res.json(links);
    } catch (err) { next(err); }
  },
);
```

**Route order note:** `/:id/share` and `/:id/shares` have **two** path segments — Express will not confuse them with `/:id` (one segment). Ordering relative to `/:id` is not critical, but placing them before `/:id` maintains consistent top-down readability.

### `apps/api/src/routes/shares.routes.ts`

Replace the empty scaffold with full implementations:

```typescript
import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import * as sharesService from '../services/shares.service.js';

export const sharesRouter: IRouter = Router();

// DELETE /api/v1/shares/:shareId — revoke (auth required)
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
// Resolved via app.use('/api/v1/public', sharesRouter) in index.ts
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

**Dual-mount safety explained:**

`index.ts` mounts `sharesRouter` at both `/api/v1/shares` AND `/api/v1/public`. This produces:

| Defined route | Via `/api/v1/shares` mount | Via `/api/v1/public` mount |
|---|---|---|
| `DELETE /:shareId` | `DELETE /api/v1/shares/:shareId` ✓ | `DELETE /api/v1/public/:shareId` (harmless — 404 from findFirst) |
| `GET /notes/:token` | `GET /api/v1/shares/notes/:token` (harmless — 404 from findUnique) | `GET /api/v1/public/notes/:token` ✓ |

The "harmless" unintended routes still hit the service but return NOT_FOUND (no matching token/shareId). Auth middleware is per-route (not per-router), so the public `GET /notes/:token` remains unauthenticated regardless of which mount resolves it.

---

## 7. Architecture Decisions

| Decision | Rationale |
|---|---|
| `findFirst({ where: { id, userId } })` for auth | Matches existing `notes.service.ts` and `tags.service.ts` pattern exactly — eliminates separate ownership check |
| `findUnique` in `getPublicNote` (not `findFirst`) | Token has a unique index — `findUnique` is semantically correct and Prisma can optimize it via the index |
| Single query + `include: { note: true }` in `getPublicNote` | Avoids a second DB round-trip to fetch the note after finding the link |
| Validation in app code, not SQL | All active/expired/revoked checks run after the DB query — no complex WHERE clause needed |
| `{ increment: 1 }` for viewCount | AGENTS.md constraint; prevents read-modify-write race condition |
| No URL in response | Token-only response keeps service env-agnostic. Frontend constructs `{CLIENT_ORIGIN}/public/notes/{token}` |
| `createShareLink` in `notes.routes.ts` | Both create and list are sub-paths of `/notes/:id`; putting them in `notes.routes.ts` avoids a third mount in `index.ts` and keeps note-related handlers together |

---

## 8. DB Impact

No migrations. The `ShareLink` model with `@default(uuid())` token and `viewCount @default(0)` was created in AB-1004 and is already applied.

---

## 9. Implementation Order

```
Task 1 → packages/shared schema change (shares.schemas.ts)
Task 2 → shares.service.ts (all 4 functions)
Task 3 → notes.routes.ts edits (POST /:id/share, GET /:id/shares)
Task 4 → shares.routes.ts edits (DELETE /:shareId, GET /notes/:token)
Task 5 → unit tests (shares.service.test.ts)
Task 6 → integration tests (shares.routes.integration.ts)
Task 7 → quality gates
```

Tasks 1–2 must be sequential (service imports schema). Tasks 3–4 can proceed once the service exists. Tasks 5–6 can be written in any order after the service is stable.

---

## 10. Quality Gates

Run in this exact order before committing:

```bash
pnpm -r lint                    # 0 ESLint errors across all packages
pnpm -r build                   # 0 TypeScript errors (shared, api, web)
pnpm --filter api test          # All unit tests pass; integration tests skipped without DATABASE_URL_TEST
```

---

## 11. Out of Scope

| Item | Ticket |
|---|---|
| Share Modal frontend | AB-1014 |
| Version history endpoints | AB-1009 |
| Sharing public search | Not in FRS |
