# Tasks — AB-1016: End-to-End Tests (Playwright)

## Phase 1 — Foundation (Config + Helper)

- [ ] **T-01** Extend `playwright.config.ts` — add `webServer` entries for API (`:3001`) and web (`:5173`), `reuseExistingServer: !process.env.CI`, `use.permissions: ['clipboard-read', 'clipboard-write']`, `timeout: 30_000`
- [ ] **T-02** Create `e2e/helpers/auth.ts` — export `uniqueEmail(): string` and `registerAndLogin(page, email, password): Promise<void>` (navigates to `/register`, fills form, submits, waits for `/notes`)

### ✅ Phase 1 Checkpoint
```bash
npx playwright test --list   # config must parse and print 7 test files (even before they exist, zero tests is fine)
```

---

## Phase 2 — POM Classes [PARALLEL]

All six classes can be written in any order; none depend on each other.

- [ ] **T-03** `e2e/pages/RegisterPage.ts` — `goto()`, `fill(email, password)` (`.first()` / `.last()` for two `••••••••` fields), `submit()` (`getByRole('button', { name: 'Create account' })`)
- [ ] **T-04** `e2e/pages/LoginPage.ts` — `goto()`, `fill(email, password)`, `submit()` (`getByRole('button', { name: 'Sign in' })`)
- [ ] **T-05** `e2e/pages/NotesListPage.ts` — `goto()`, `clickNewNote()`, `logout()` (user avatar → Logout menuitem), `noteCard(title)`, `clickNote(title)`, `deleteNote(title)` (hover → Delete note button → confirm), `filterByTag(tagName)` (`locator('label').filter({ hasText })`), `clearTagFilter(tagName)`
- [ ] **T-06** `e2e/pages/NoteEditorPage.ts` — `titleInput` (`getByLabel('Note title')`), `editor` (`.ProseMirror`), `saveStatusSaved` / `saveStatusSaving` (`getByText('Saved')` / `getByText('Saving…')`), `shareButton`, `historyButton`, `setTitle()`, `typeContent()`, `waitForSaved(timeout?)`, `openShareModal()`, `openHistoryDrawer()`, `goBackToList()`, `addTag(tagName)` (combobox → search → create-or-select)
- [ ] **T-07** `e2e/pages/SearchPage.ts` — `goto()`, `searchInput` (`getByPlaceholder('Search notes…')`), `resultCards`, `highlightedMark` (`locator('mark').first()`), `search(query)`, `clickResult(index?)`
- [ ] **T-08** `e2e/pages/PublicNotePage.ts` — `goto(token)`, `title` (`locator('h1').first()`), `content` (`.ProseMirror, [class*="prose"]`), `loginLink`

### ✅ Phase 2 Checkpoint
```bash
# no journey files yet — just verify no TypeScript parse errors
npx playwright test --list   # must complete without crashing
```

---

## Phase 3 — Journey Files

> Each journey registers a fresh user via `registerAndLogin` (or the UI register flow).
> **T-09 and T-10 are independent of each other and can be written in parallel.**
> T-11 through T-15 each depend only on Phase 2 POMs; they can also be written in parallel.

### T-09 `e2e/journeys/auth-flow.journey.ts` [PARALLEL with T-10…T-15]

Three tests sharing `email`/`password` constants:

- [ ] **T-09a** `register: new user lands on /notes` — `RegisterPage.goto()` → fill unique email + password → submit → `waitForURL('**/notes')` → assert URL matches `/notes` → assert `localStorage.getItem('accessToken')` is `null`
- [ ] **T-09b** `login: existing user lands on /notes` — `registerAndLogin` (sets up user) → `logout()` → `LoginPage.fill()` → `submit()` → `waitForURL('**/notes')`
- [ ] **T-09c** `logout: session cleared, /notes redirects to /login` — `registerAndLogin` → `logout()` → `page.goto('/notes')` → assert URL matches `/login`

### T-10 `e2e/journeys/auth-guard.journey.ts` [PARALLEL with T-09, T-11…T-15]

Two tests:

- [ ] **T-10a** `unauthenticated /notes redirects to /login` — `browser.newContext()` (fresh, no cookies) → navigate to `/notes` → assert URL is `/login`
- [ ] **T-10b** `public note page renders without auth` — authenticated user creates note + generates share link via `page.request.post('/api/v1/notes/:id/share')` → anonymous context opens `/public/:token` → `PublicNotePage.title` is visible → `PublicNotePage.loginLink` is not visible

### T-11 `e2e/journeys/note-crud.journey.ts` [PARALLEL with T-09, T-10, T-12…T-15]

Three tests (each calls `registerAndLogin` internally):

- [ ] **T-11a** `create note and see it in list` — `clickNewNote()` → `setTitle('My Test Note')` → `goBackToList()` → `noteCard('My Test Note')` is visible
- [ ] **T-11b** `autosave transitions Saving → Saved within 5s` (FRS-FE-18/19) — `clickNewNote()` → `setTitle(...)` → `typeContent(...)` → `expect(saveStatusSaving).toBeVisible({ timeout: 3500 })` → `expect(saveStatusSaved).toBeVisible({ timeout: 5000 })`
- [ ] **T-11c** `delete with confirm removes note from list` (FRS-FE-14) — create note → navigate to list → `deleteNote(title)` → `noteCard(title)` not visible

### T-12 `e2e/journeys/tag-filter.journey.ts` [PARALLEL with T-09…T-11, T-13…T-15]

Set viewport `{ width: 1280, height: 800 }` (tag filter sidebar hidden below `lg`). Two tests:

- [ ] **T-12a** `filter by tag shows only tagged notes` (FRS-FE-11, BR-NOTE-11) — create "Tagged Note" + assign tag "E2E-Filter" via `NoteEditorPage.addTag()` → create "Untagged Note" (no tag) → navigate to list → `filterByTag('E2E-Filter')` → `noteCard('Tagged Note')` visible → `noteCard('Untagged Note')` not visible
- [ ] **T-12b** `clearing filter restores full list` — continuing from T-12a state → `clearTagFilter('E2E-Filter')` → both note cards visible

### T-13 `e2e/journeys/fts-search.journey.ts` [PARALLEL with T-09…T-12, T-14…T-15]

Two tests:

- [ ] **T-13a** `searching for content returns result with <mark> headline` (UC-SRCH-01, FRS-FE-25/26) — create note with unique keyword (`kw = 'kwrd${Date.now()}'`) as content → `waitForSaved()` → navigate to search → `SearchPage.search(kw)` → `highlightedMark` visible → `clickResult()` → URL matches `/notes/**`
- [ ] **T-13b** `searching for non-existent term shows empty state` — `search('zzznoresultsxxx')` → page contains text matching `/No notes found/`

### T-14 `e2e/journeys/share-public.journey.ts` [PARALLEL with T-09…T-13, T-15]

Two tests:

- [ ] **T-14a** `copy URL shows "Copied" confirmation` (FRS-FE-31) — create note → `openShareModal()` → click "Generate" → link row appears → click "Copy URL" → `page.getByRole('button', { name: /Copied/ })` visible (button text changes to "✓ Copied!")
- [ ] **T-14b** `public URL renders note for anonymous visitor` (UC-SHARE-02) — continuing from T-14a → `page.evaluate(() => navigator.clipboard.readText())` → `url` matches `/\/public\//` → `browser.newContext()` (no cookies) → navigate to `url` → `PublicNotePage.title` visible → `loginLink` not visible → close anonymous context

### T-15 `e2e/journeys/version-history.journey.ts` [PARALLEL with T-09…T-14]

Three tests using a shared note (set up in `beforeAll`):

Setup: `registerAndLogin` → create note "V-Journey Note" → `typeContent('first content')` → `waitForSaved()` (snapshot S1 created) → `typeContent(' extra')` → `waitForSaved()` (snapshot S2 created). Now: 2 snapshots, drawer shows [S2 "Current" (index 0, non-clickable), S1 (index 1, clickable)].

- [ ] **T-15a** `history drawer shows version list after autosave` (FRS-FE-33) — `openHistoryDrawer()` → at least one row with timestamp visible → "Current" label visible
- [ ] **T-15b** `clicking version row shows read-only preview` (FRS-FE-34) — click row at index 1 → "← Back" button visible → note title visible in preview → `Restore this version` button visible → click "← Back" → version list reappears (no POST made)
- [ ] **T-15c** `restore updates editor content` (FRS-FE-35) — open history → click index 1 row → click "Restore this version" → confirm in AlertDialog → `waitForURL('**/notes/**')` (drawer closes) → `titleInput` visible (editor reloaded) → note title or content reflects the restored snapshot

### ✅ Phase 3 Checkpoint
```bash
npx playwright test                    # all 7 journey files, all tests green
npx playwright test --reporter=list    # readable pass/fail per test name
```

---

## Phase 4 — Final Gates

- [ ] **T-16** Run standard quality gates before committing:
  ```bash
  pnpm -r lint           # E2E files are outside api/web tsconfig — lint gate still passes
  pnpm -r build          # No API/web changes — must stay green
  pnpm -r test           # Unit + integration tests — no regressions
  npx playwright test    # Full E2E suite — all green
  ```

---

## Spec Scenarios → Task Mapping

| Spec Scenario | Task |
|---|---|
| Suite starts without running servers | T-01 (playwright.config.ts webServer) |
| POM class encapsulates login interaction | T-03 + T-04 |
| Journey starts isolated from other journeys | T-02 (auth helper) |
| New user registers and lands on /notes | T-09a |
| Existing user logs in and lands on /notes | T-09b |
| Logout redirects to /login | T-09c |
| Unauthenticated /notes redirects to /login | T-10a |
| Public note page renders without authentication | T-10b |
| New note created and visible in list | T-11a |
| Autosave status transitions Saving → Saved within 3s | T-11b |
| Delete with confirmation removes the note | T-11c |
| Filtering by a tag shows only tagged notes | T-12a |
| Clearing the tag filter restores full list | T-12b |
| Searching for content returns result with highlighted headline | T-13a |
| Clicking a search result opens the note editor | T-13a |
| Searching for non-existent term shows empty state | T-13b |
| Copy URL shows a confirmation toast | T-14a |
| Public URL renders the note for an anonymous visitor | T-14b |
| History drawer shows version list after autosave | T-15a |
| Clicking a version row shows a read-only preview | T-15b |
| Restore replaces editor content and creates a new snapshot | T-15c |
