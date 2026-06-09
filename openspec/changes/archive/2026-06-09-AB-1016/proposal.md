# Proposal — AB-1016: End-to-End Tests (Playwright)

## Why

All six feature areas of the NTA (auth, notes, tags, search, shares, versions) have unit and integration test coverage, but no test exercise the product as a whole from a browser. Regressions in UI wiring (routing, autosave debounce, clipboard copy, public share access) cannot be caught by the existing Vitest suite. This ticket adds Playwright E2E tests that cover the seven golden-path user journeys defined in FRS §11.

## What Changes

- Extend `playwright.config.ts` at the monorepo root with `webServer` entries that auto-start both the API (`:3001`) and web (`:5173`) dev servers before the suite runs.
- Add `e2e/pages/` directory — Page Object Model classes, one file per page, wrapping selectors and actions for each screen.
- Add `e2e/journeys/` directory — seven test files, one per user journey, each self-contained (registers a fresh user in `beforeAll`).

## Capabilities

### New Capabilities

_(no new product capabilities — this ticket adds test coverage only)_

### Modified Capabilities

- **playwright-config**: extend existing `playwright.config.ts` with `webServer` launcher and `use.permissions` for clipboard access

## Journeys Covered

| File | Journey | FRS/UC Refs |
|---|---|---|
| `auth-flow.journey.ts` | Register → `/notes`; Login → `/notes` → Logout | UC-AUTH-01/02/04, FRS-FE-07/08 |
| `auth-guard.journey.ts` | Unauthenticated `/notes` → redirect to `/login`; public note page accessible without auth | FRS-FE-08, BR-SHARE-06 |
| `note-crud.journey.ts` | Create note → type content → autosave fires after 2 s (`Saved` indicator appears) → delete with confirm | FRS-FE-18, FRS-FE-19, FRS-FE-14 |
| `tag-filter.journey.ts` | Create tag → assign to note → filter notes list by tag → verify only tagged note shown | BR-NOTE-11, FRS-FE-11 |
| `fts-search.journey.ts` | Create note with known content → search for keyword → verify headline `<mark>` renders → click result to open note | UC-SRCH-01, FRS-FE-25/26 |
| `share-public.journey.ts` | Create note → generate share link → copy URL (toast confirms, FRS-FE-31) → open URL in anonymous browser context → verify public note renders | UC-SHARE-01/02, FRS-FE-31 |
| `version-history.journey.ts` | Edit note → wait for autosave (two rounds) → open history drawer → preview older version → restore → verify editor reloads restored content | UC-VER-01/02, FRS-FE-33/34/35 |

## Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Test data | `POST /auth/register` with unique timestamped email in `beforeAll` per file | No shared state; each journey is independently reproducible |
| Autosave timing | `page.waitForTimeout(2200)` after typing | Validates the 2 s debounce without mocking browser clock; simplest reliable approach |
| Clipboard permissions | Grant `clipboard-read` + `clipboard-write` at browser context level in `playwright.config.ts` | `navigator.clipboard` API throws in unprivileged contexts; explicit grant keeps tests portable |
| Page objects | `e2e/pages/` — one class per page, wrapping `page.locator()` + action methods | Keeps journey test files readable; POMs are the right scale for 7 tests |
| Anonymous browser context | `browser.newContext({ storageState: undefined })` for public share test | Isolates anonymous visitor from authenticated session in the same test run |
| webServer | Both `pnpm --filter api dev` and `pnpm --filter web dev` launched by Playwright | `npx playwright test` becomes self-contained; no manual server startup required |

## Impact

| File | Change |
|---|---|
| `playwright.config.ts` | Add `webServer` entries + `use.permissions: ['clipboard-read', 'clipboard-write']` |
| `e2e/pages/LoginPage.ts` | POM for `/login` |
| `e2e/pages/RegisterPage.ts` | POM for `/register` |
| `e2e/pages/NotesListPage.ts` | POM for `/notes` (list, filter, sort, delete) |
| `e2e/pages/NoteEditorPage.ts` | POM for `/notes/:id` (title, content, toolbar buttons, save status) |
| `e2e/pages/SearchPage.ts` | POM for `/search` (query input, results, headline) |
| `e2e/pages/PublicNotePage.ts` | POM for `/public/:token` (title, read-only content) |
| `e2e/helpers/auth.ts` | `registerAndLogin(page, email, password)` helper used by all journeys |
| `e2e/journeys/auth-flow.journey.ts` | Auth lifecycle journey |
| `e2e/journeys/auth-guard.journey.ts` | Route protection + public access journey |
| `e2e/journeys/note-crud.journey.ts` | Note CRUD + autosave journey |
| `e2e/journeys/tag-filter.journey.ts` | Tag management + filter journey |
| `e2e/journeys/fts-search.journey.ts` | Full-text search journey |
| `e2e/journeys/share-public.journey.ts` | Share link + public page journey |
| `e2e/journeys/version-history.journey.ts` | Version history + restore journey |

**No API changes.** **No DB migrations.** **No `packages/shared` changes.**
