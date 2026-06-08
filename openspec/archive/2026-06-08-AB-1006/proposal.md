# Implementation Proposal — AB-1006: Tags CRUD

| Field | Value |
|---|---|
| Ticket | AB-1006 |
| Status | **Awaiting Approval** |
| Scope | Backend — `apps/api` + two small shared package updates |
| Depends on | AB-1003 (DB init migration with Tag + NoteTag tables), AB-1004 (notes service exists; tag validation helpers already used there) |
| Unblocks | AB-1011/1012 (frontend tag management UI); AB-1005 tag filter already works once this provides real tags |

---

## 1. Goal

Implement the Tags CRUD backend:

- **`tags.service.ts`** — `listTags`, `createTag`, `updateTag`, `deleteTag` (with case-insensitive name uniqueness, name trimming, and `noteCount` computation).
- **`tags.routes.ts`** — wire `GET /tags`, `POST /tags`, `PATCH /tags/:id`, `DELETE /tags/:id`.
- **Shared package updates** — add `TagWithCount` response type; allow nullable `color` on `UpdateTagSchema`.
- **Unit + integration tests.**

---

## 2. Clarifying Decisions (recorded)

| Question | Decision |
|---|---|
| `GET /tags` response fields | `{ id, name, color, noteCount }` only. Define `TagWithCount = TagSummary & { noteCount: number }` in shared. |
| `POST /PATCH` response | `TagSummary` (`{ id, name, color }`). Reuse existing shared type. |
| `PATCH color: null` | Allowed. `UpdateTagSchema` updated with `.nullable()` on `color`. Service sets `color = null` in DB when client sends `null`. |
| Name trimming | Trim before uniqueness check and before storage. Enforce via `.trim()` in Zod schema. |

---

## 3. Files to Create or Modify

### 3.1 Shared Package (update first)

| File | Change |
|---|---|
| `packages/shared/src/types/api.types.ts` | Add `TagWithCount = TagSummary & { noteCount: number }` |
| `packages/shared/src/schemas/tags.schemas.ts` | Add `.trim()` to `name`; update `UpdateTagSchema` to allow `color: null` |

### 3.2 API (new + modified)

| File | Change |
|---|---|
| `apps/api/src/services/tags.service.ts` | Create — all four service functions |
| `apps/api/src/routes/tags.routes.ts` | Fill the existing stub with all four route handlers |
| `apps/api/src/services/__tests__/tags.service.test.ts` | Create — unit tests |
| `apps/api/src/routes/__tests__/tags.routes.integration.ts` | Create — integration tests |

### 3.3 Already Correct (no changes needed)

| File | Why |
|---|---|
| `packages/shared/src/index.ts` | Uses `export *` — `TagWithCount` auto-exported once added to `api.types.ts` |
| `packages/shared/src/types/errors.types.ts` | `TAG_NAME_TAKEN` already in the union |
| `apps/api/src/index.ts` | `tagsRouter` already registered at `/api/v1/tags` |

---

## 4. Detailed Design

### 4.1 Shared Package Changes

#### `packages/shared/src/types/api.types.ts` — add one line

```typescript
export type TagWithCount = TagSummary & { noteCount: number };
```

#### `packages/shared/src/schemas/tags.schemas.ts` — two changes

```typescript
export const CreateTagSchema = z.object({
  name: z.string().trim().min(1).max(50),       // .trim() added
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex string like #RRGGBB').optional(),
});

export const UpdateTagSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  color: z.string()                              // explicitly redefined (not .partial())
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a hex string like #RRGGBB')
    .optional()
    .nullable(),                                 // allow null to unset color
});
```

`.trim()` runs before `.min(1)`, so `"  "` → trimmed to `""` → fails min(1) with VALIDATION_ERROR. The `CreateTagSchema` keeps `color` non-nullable (you can't create a tag with `null` color — just omit it).

### 4.2 `tags.service.ts`

```typescript
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { TagSummary, TagWithCount } from 'shared';
import { CreateTagSchema, UpdateTagSchema } from 'shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';

function toTagSummary(tag: { id: string; name: string; color: string | null }): TagSummary {
  return { id: tag.id, name: tag.name, color: tag.color };
}

async function checkNameConflict(userId: string, name: string, excludeId?: string): Promise<void> {
  const existing = await prisma.tag.findFirst({
    where: {
      userId,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId && { id: { not: excludeId } }),
    },
  });
  if (existing) throw new AppError('TAG_NAME_TAKEN', 'You already have a tag with this name.', 409);
}
```

**`listTags`** — returns all user tags ordered by creation, each with a filtered `noteCount`:

```typescript
export async function listTags(userId: string): Promise<TagWithCount[]> {
  const tags = await prisma.tag.findMany({
    where: { userId },
    include: {
      _count: {
        select: {
          notes: { where: { note: { deletedAt: null } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return tags.map(tag => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    noteCount: tag._count.notes,
  }));
}
```

`notes` in `_count.select` refers to the `NoteTag[]` relation. The `where: { note: { deletedAt: null } }` filter counts only NoteTag rows whose associated Note is not soft-deleted. Prisma 5 supports filtered relation counts in `_count.select`.

**`createTag`** — name is already trimmed by Zod:

```typescript
export async function createTag(
  userId: string,
  dto: z.infer<typeof CreateTagSchema>,
): Promise<TagSummary> {
  await checkNameConflict(userId, dto.name);
  const tag = await prisma.tag.create({
    data: { userId, name: dto.name, color: dto.color ?? null },
  });
  return toTagSummary(tag);
}
```

**`updateTag`** — handles `color: null` (unset), `color: "#rrggbb"` (set), and `color` absent (leave unchanged):

```typescript
export async function updateTag(
  userId: string,
  tagId: string,
  dto: z.infer<typeof UpdateTagSchema>,
): Promise<TagSummary> {
  const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
  if (!tag) throw new AppError('NOT_FOUND', 'Tag not found.', 404);

  if (dto.name !== undefined) {
    await checkNameConflict(userId, dto.name, tagId);
  }

  const updated = await prisma.tag.update({
    where: { id: tagId },
    data: {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.color !== undefined && { color: dto.color }),
    },
  });
  return toTagSummary(updated);
}
```

`dto.color !== undefined` is the correct guard: when the field is omitted Zod gives `undefined` (leave unchanged); when `null` it's `null !== undefined = true` so the DB field is set to `null`. When `"#rrggbb"` it's also `!== undefined`.

**`deleteTag`** — DB cascade handles NoteTag cleanup:

```typescript
export async function deleteTag(userId: string, tagId: string): Promise<void> {
  const tag = await prisma.tag.findFirst({ where: { id: tagId, userId } });
  if (!tag) throw new AppError('NOT_FOUND', 'Tag not found.', 404);
  await prisma.tag.delete({ where: { id: tagId } });
}
```

`prisma.tag.delete` triggers the `onDelete: Cascade` constraint defined on the NoteTag model, removing all NoteTag rows for that tag atomically in the DB.

### 4.3 Route Wiring — `tags.routes.ts`

```typescript
import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { CreateTagSchema, UpdateTagSchema } from 'shared';
import * as tagsService from '../services/tags.service.js';

export const tagsRouter: IRouter = Router();

// GET /api/v1/tags
tagsRouter.get('/', authenticate, async (req, res, next) => {
  try {
    const tags = await tagsService.listTags(req.user.id);
    res.json(tags);
  } catch (err) { next(err); }
});

// POST /api/v1/tags
tagsRouter.post('/', authenticate, validate(CreateTagSchema), async (req, res, next) => {
  try {
    const tag = await tagsService.createTag(req.user.id, req.body as ...);
    res.status(201).json(tag);
  } catch (err) { next(err); }
});

// PATCH /api/v1/tags/:id
tagsRouter.patch('/:id', authenticate, validate(UpdateTagSchema), async (req, res, next) => {
  try {
    const tag = await tagsService.updateTag(req.user.id, String(req.params.id), req.body as ...);
    res.json(tag);
  } catch (err) { next(err); }
});

// DELETE /api/v1/tags/:id
tagsRouter.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await tagsService.deleteTag(req.user.id, String(req.params.id));
    res.status(204).send();
  } catch (err) { next(err); }
});
```

---

## 5. Security Invariants

| Invariant | Implementation |
|---|---|
| `userId` from JWT only | Every service function takes `userId` from `req.user.id`. `req.body.userId` never used. |
| Ownership enforced in service | `findFirst({ where: { id, userId } })` before every write. Route layer applies no ownership logic. |
| Cross-user tag → 404 | Foreign tag access returns NOT_FOUND, never 403. |
| `noteCount` counts only own live notes | `_count.notes` filtered by `note.deletedAt: null` (soft-delete aware) and scoped to the tag's owner (`userId` on the tag). |
| No `$queryRaw` | Pure Prisma throughout. |

---

## 6. Implementation Order

| Step | Task |
|---|---|
| 1 | Update `packages/shared/src/types/api.types.ts` — add `TagWithCount` |
| 2 | Update `packages/shared/src/schemas/tags.schemas.ts` — add `.trim()`, nullable `color` on update |
| 3 | Run `pnpm -r build` to confirm shared changes compile |
| 4 | Create `apps/api/src/services/tags.service.ts` |
| 5 | Fill `apps/api/src/routes/tags.routes.ts` |
| 6 | Write unit tests — `tags.service.test.ts` |
| 7 | Write integration tests — `tags.routes.integration.ts` |
| 8 | Quality gates: lint → build → test |

---

## 7. Quality Gate Checkpoints

```bash
pnpm -r lint                      # 0 errors
pnpm -r build                     # 0 type errors (all three packages)
pnpm --filter api test            # all unit tests pass; integration skipped if no DB
pnpm --filter api test:coverage   # ≥80% for tags.service.ts
```

---

## 8. Out of Scope

| Item | Ticket |
|---|---|
| Frontend tag management UI | AB-1011/1012 |
| Tag filter in notes list (already implemented) | AB-1005 ✓ |
| Search, shares, versions | AB-1007–AB-1009 |
