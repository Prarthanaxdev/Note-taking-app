# CLAUDE.md — Claude Code Configuration

@AGENTS.md

---

## Permission Model

**Proceed without asking:**
- Reading any file, running `grep`/`find`, `git status`, `git log`, `git diff`
- Installing dependencies (`pnpm install`, `pnpm add`)
- Running tests, lint, build, type-check
- Creating or editing files in `apps/`, `packages/`
- Running `prisma generate`, `prisma migrate dev` on local dev DB

**Always ask before proceeding:**
- `git push` (any branch, any remote)
- `git reset --hard`, `git rebase`, `git stash drop`
- `prisma migrate deploy` (production/staging DB)
- `prisma db push --force-reset` or any destructive DB operation
- Deleting files or directories
- Creating a PR or posting any GitHub comment
- Modifying `.env` files or any secret-bearing file

---

## Context Management

- If the conversation exceeds ~60k tokens, run `/clear` and re-attach only the files actively being edited.
- When starting a new ticket, `/clear` first, then read only the files that ticket touches.
- Do not carry debugging output or large stack traces into a fresh task — summarize and discard.

---

## Thinking Depth

| Situation | Depth |
|---|---|
| Trivial edit (rename, typo, formatting) | None — just do it |
| Single-file feature or bug fix | Brief — state the change and why |
| Cross-app change (touches api + web + shared) | Think first — write a short plan before coding |
| DB migration or auth change | Think hard — enumerate invariants and edge cases before writing a single line |

---

## Commit Message Format

```
<type>(<scope>): <imperative summary, max 72 chars>

[optional body — why, not what]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

**Types:** `feat`, `fix`, `refactor`, `test`, `chore`, `docs`  
**Scopes:** `api`, `web`, `shared`, `db`, `infra`  
**Examples:**
```
feat(api): add OTP rate limiting on forgot-password route
fix(web): prevent access token persisting to localStorage on refresh
chore(db): add GIN index migration for FTS tsvector column
```

---

## Branch Naming

```
<type>/<ticket-id>-<short-slug>
```

**Examples:** `feat/AB-1002-auth-refresh-rotation`, `fix/AB-1007-fts-sanitize-input`

---

## Quality Gates (run in this order before every commit)

```bash
pnpm -r lint          # 1. Lint — fix all errors before proceeding
pnpm -r build         # 2. Type-check + build — no type errors allowed
pnpm -r test          # 3. Tests — no regressions
```

All three must pass. Do not commit with a failing gate even if the failure seems unrelated to the change.

---

## Commands Requiring [y/n] Confirmation

Always surface these to the user and wait for explicit approval:

| Command | Risk |
|---|---|
| `git push` / `git push --force` | Affects remote |
| `prisma migrate deploy` | Mutates prod/staging DB |
| `prisma db push --force-reset` | Destructive DB wipe |
| `rm -rf` / file deletions | Irreversible |
| `gh pr create` / `gh issue comment` | Public GitHub action |
| Any `docker-compose down -v` | Deletes DB volumes |
