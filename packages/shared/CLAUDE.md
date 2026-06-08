# CLAUDE.md — packages/shared

@../../AGENTS.md

---

## What Lives Here

```
src/
  schemas/
    auth.schemas.ts      RegisterSchema, LoginSchema, ForgotPasswordSchema, ResetPasswordSchema
    notes.schemas.ts     CreateNoteSchema, UpdateNoteSchema, NoteListQuerySchema
    tags.schemas.ts      CreateTagSchema, UpdateTagSchema
    search.schemas.ts    SearchQuerySchema
    shares.schemas.ts    CreateShareSchema
  types/
    api.types.ts         NoteDetail, NoteListItem, SearchResult, TagSummary, PaginationMeta, ShareLink
    auth.types.ts        AuthResponse, UserProfile
    errors.types.ts      AppErrorCode (union of all error code strings)
  index.ts               Re-exports everything — always update when adding a file
```

---

## Rule: Never Duplicate

Before adding a type or schema anywhere in `apps/api` or `apps/web`, grep this package first:

```bash
grep -r "YourTypeName" packages/shared/src/
```

If it exists here, import it — do not redefine it.  
If it almost fits, extend it here — do not shadow it in the app.

---

## How to Add a New Shared Item

1. **New Zod schema** → add to the relevant `schemas/*.schemas.ts` file (or create `feature.schemas.ts` for a new feature).
2. **New TypeScript type** → add to the relevant `types/*.types.ts` file.
3. **New error code** → add the string literal to the `AppErrorCode` union in `errors.types.ts`. Do this before throwing the code in `apps/api`.
4. **Export it** → add or confirm an export in `index.ts`. Both apps import from `'shared'` — if it's not in `index.ts` it doesn't exist to them.
5. **No runtime code** — this package ships Zod schemas and TS types only. No utility functions, no API calls, no Node/browser APIs. The only allowed dependency is `zod`.

---

## Constraints

- Zero imports from `apps/api` or `apps/web` — ever
- Zero runtime dependencies except `zod`
- Schema changes here are breaking changes for both apps — update both sides before merging
- Coverage gate: ≥90% (schemas are pure functions — they are fully testable)
