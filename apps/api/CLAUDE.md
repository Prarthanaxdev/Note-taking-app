# CLAUDE.md — apps/api

@../../AGENTS.md

---

## Backend-Specific Commands

```bash
pnpm dev                        # Start API on :3001 (nodemon/tsx watch)
pnpm build                      # tsc compile to dist/
pnpm test                       # Vitest unit + integration
pnpm test:coverage              # Coverage report (gate: ≥80%)
pnpm lint                       # ESLint

pnpm prisma migrate dev         # Create + apply migration (dev DB)
pnpm prisma migrate deploy      # Apply migrations (prod — ask first)
pnpm prisma generate            # Regenerate Prisma client after schema change
pnpm prisma studio              # GUI DB browser
```

---

## Framework Patterns

**Adding a feature:** always create all four layers together — route, service, schema (in shared), type (in shared). Never a route without a service or a service without a schema.

**Route file:** thin — only defines HTTP method, path, middleware chain. No business logic.
```ts
router.post('/', authenticate, validate(CreateNoteSchema), notesService.create);
```

**Service function signature:** takes `(userId: string, dto: T)` — never takes `req`/`res`.

**Ownership check:** always `findFirst({ where: { id, userId } })`. A missing or mismatched `userId` returns `null` → throw `NOT_FOUND`. Never `findUnique` followed by a manual ownership check.

**Transactions:** use `prisma.$transaction(async (tx) => { ... })` any time two or more tables are mutated. Pass `tx` into every sub-operation inside the transaction.

**Raw SQL:** only via tagged template literals. `$queryRaw\`SELECT ... WHERE id = ${id}\`` — never string concatenation.

**AppError:** throw with the exact code strings from `packages/shared/src/types/errors.types.ts`. Don't invent new codes without adding them to the shared union first.

---

## Anti-Patterns

- No business logic in route files
- No `req.body.userId` — always `req.user.id` from JWT
- No `findUnique` + manual auth check — use `findFirst({ where: { id, userId } })`
- No `to_tsquery()` on user input — use `plainto_tsquery()`
- No `$queryRaw` with string interpolation — tagged template literals only
- No throwing raw Prisma errors to the client — catch and rethrow as `AppError`
- No `403` responses — return `404` for cross-user access to prevent enumeration
- No authorization logic in middleware — it belongs in the service layer
