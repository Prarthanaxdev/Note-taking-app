# Technical Plan — AB-1016: End-to-End Tests (Playwright)

## Overview

Pure test infrastructure ticket. No API, DB, or `packages/shared` changes. Adds 16 new files:
- 1 config update
- 6 POM classes in `e2e/pages/`
- 1 auth helper in `e2e/helpers/`
- 7 journey files in `e2e/journeys/`

---

## Phase 0 — Config

### `playwright.config.ts` (MODIFY)

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: [
    {
      command: 'pnpm --filter api dev',
      port: 3001,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm --filter web dev',
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

`reuseExistingServer: !process.env.CI` — reuses running dev servers locally, always starts fresh in CI.

---

## Phase 1 — Page Object Models

All in `e2e/pages/`. No `data-testid` attributes exist in the codebase; all selectors use semantic APIs.

### `e2e/pages/LoginPage.ts`

```typescript
import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}
  async goto() { await this.page.goto('/login'); }
  async fill(email: string, password: string) {
    await this.page.getByPlaceholder('you@example.com').fill(email);
    await this.page.getByPlaceholder('••••••••').fill(password);
  }
  async submit() {
    await this.page.getByRole('button', { name: 'Sign in' }).click();
  }
}
```

### `e2e/pages/RegisterPage.ts`

Two `placeholder="••••••••"` inputs exist (password + confirm). Use `.first()` / `.last()`.

```typescript
import type { Page } from '@playwright/test';

export class RegisterPage {
  constructor(private page: Page) {}
  async goto() { await this.page.goto('/register'); }
  async fill(email: string, password: string) {
    await this.page.getByPlaceholder('you@example.com').fill(email);
    const pwFields = this.page.getByPlaceholder('••••••••');
    await pwFields.first().fill(password);
    await pwFields.last().fill(password);
  }
  async submit() {
    await this.page.getByRole('button', { name: 'Create account' }).click();
  }
}
```

### `e2e/pages/NotesListPage.ts`

NoteCards are `<div role="button" tabIndex={0}>` containing an `<h3>`. The "New Note" button and logout are in the AppShell sidebar, included here since that's where users interact with them on this page.

```typescript
import type { Page, Locator } from '@playwright/test';

export class NotesListPage {
  constructor(private page: Page) {}
  async goto() { await this.page.goto('/notes'); }

  // AppShell sidebar actions
  async clickNewNote() {
    await this.page.getByRole('button', { name: 'New Note' }).click();
    await this.page.waitForURL('**/notes/**');
  }
  async logout() {
    await this.page.locator('div.rounded-full').click(); // user avatar trigger
    await this.page.getByRole('menuitem', { name: 'Logout' }).click();
    await this.page.waitForURL('**/login');
  }
  async goToSearch() {
    await this.page.getByRole('link', { name: 'Search' }).click();
    await this.page.waitForURL('**/search');
  }

  // Note cards
  noteCard(title: string): Locator {
    return this.page.locator('[role="button"]').filter({ hasText: title }).first();
  }
  async clickNote(title: string) {
    await this.noteCard(title).click();
    await this.page.waitForURL('**/notes/**');
  }
  async deleteNote(title: string) {
    const card = this.noteCard(title);
    await card.hover();
    await card.getByRole('button', { name: 'Delete note' }).click();
    // Confirm in AlertDialog — 'Delete' appears on both the trigger and confirm btn; use last()
    await this.page.getByRole('button', { name: 'Delete' }).last().click();
  }
  get noteCount(): Promise<number> {
    return this.page.locator('[role="button"]').filter({
      has: this.page.locator('h3'),
    }).count();
  }

  // Tag filter (visible at lg breakpoint)
  async filterByTag(tagName: string) {
    await this.page.locator('label').filter({ hasText: tagName }).click();
  }
  async clearTagFilter(tagName: string) {
    await this.page.locator('label').filter({ hasText: tagName }).click();
  }
}
```

### `e2e/pages/NoteEditorPage.ts`

TipTap renders a `.ProseMirror` div (contenteditable). `aria-label="Note title"` on the title input.

```typescript
import type { Page } from '@playwright/test';

export class NoteEditorPage {
  constructor(private page: Page) {}

  get titleInput() { return this.page.getByLabel('Note title'); }
  get editor() { return this.page.locator('.ProseMirror'); }
  get saveStatusSaved() { return this.page.getByText('Saved'); }
  get saveStatusSaving() { return this.page.getByText('Saving…'); }
  get shareButton() { return this.page.getByRole('button', { name: /Share/ }); }
  get historyButton() { return this.page.getByRole('button', { name: /History/ }); }
  get tagCombobox() { return this.page.getByRole('combobox'); }

  async setTitle(title: string) {
    await this.titleInput.clear();
    await this.titleInput.fill(title);
  }
  async typeContent(text: string) {
    await this.editor.click();
    await this.page.keyboard.type(text);
  }
  async waitForSaved(timeout = 6000) {
    await this.saveStatusSaved.waitFor({ state: 'visible', timeout });
  }
  async openShareModal() {
    await this.shareButton.click();
  }
  async openHistoryDrawer() {
    await this.historyButton.click();
  }
  async goBackToList() {
    await this.page.getByRole('link', { name: 'Notes' }).click();
    await this.page.waitForURL('**/notes');
  }

  // Tag combobox — opens popover, types tag name, selects or creates
  async addTag(tagName: string) {
    await this.tagCombobox.click();
    await this.page.getByPlaceholder('Search tags…').fill(tagName);
    // If exact match exists, click it; otherwise create
    const existing = this.page.getByRole('option', { name: tagName }).first();
    if (await existing.isVisible()) {
      await existing.click();
    } else {
      await this.page.getByRole('option', { name: /Create/ }).click();
    }
  }
}
```

### `e2e/pages/SearchPage.ts`

```typescript
import type { Page } from '@playwright/test';

export class SearchPage {
  constructor(private page: Page) {}
  async goto() { await this.page.goto('/search'); }

  get searchInput() { return this.page.getByPlaceholder('Search notes…'); }
  get resultCards() {
    return this.page.locator('[role="button"]').filter({ has: this.page.locator('h3') });
  }
  get highlightedMark() { return this.page.locator('mark').first(); }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.keyboard.press('Enter');
    await this.page.waitForURL(`**/search**q=**`);
  }
  async clickResult(index = 0) {
    await this.resultCards.nth(index).click();
    await this.page.waitForURL('**/notes/**');
  }
}
```

### `e2e/pages/PublicNotePage.ts`

```typescript
import type { Page } from '@playwright/test';

export class PublicNotePage {
  constructor(private page: Page) {}
  async goto(token: string) { await this.page.goto(`/public/${token}`); }

  get title() { return this.page.locator('h1').first(); }
  get content() { return this.page.locator('.ProseMirror, [class*="prose"]').first(); }
  get loginLink() { return this.page.getByRole('link', { name: /log in|sign in/i }); }
}
```

---

## Phase 2 — Auth Helper

### `e2e/helpers/auth.ts`

```typescript
import type { Page } from '@playwright/test';
import { RegisterPage } from '../pages/RegisterPage.js';

export const DEFAULT_PASSWORD = 'password123';

export function uniqueEmail(): string {
  return `test-${Date.now()}@e2e.local`;
}

export async function registerAndLogin(
  page: Page,
  email: string,
  password = DEFAULT_PASSWORD,
): Promise<void> {
  const registerPage = new RegisterPage(page);
  await registerPage.goto();
  await registerPage.fill(email, password);
  await registerPage.submit();
  await page.waitForURL('**/notes');
}
```

---

## Phase 3 — Journey Files

All journey files live in `e2e/journeys/`. Each creates a fresh user in `beforeAll`.

### `e2e/journeys/auth-flow.journey.ts`

Three tests; user credentials are shared across tests in the same file via closure.

Key scenarios:
1. Register → `/notes` (verify URL, verify `localStorage` has no `accessToken`)
2. Logout from notes page → `/login`
3. Login with same credentials → `/notes`

**Notes:**
- `div.rounded-full` is the user avatar trigger for the dropdown menu
- `getByRole('menuitem', { name: 'Logout' })` selects the logout item in the DropdownMenu

### `e2e/journeys/auth-guard.journey.ts`

Two tests:
1. Fresh `browser.newContext()` → navigate to `/notes` → `expect(page).toHaveURL(/login/)`
2. Authenticated user creates note + share link → get token from API response or clipboard → anonymous context opens `/public/:token` → verify renders

**Note for test 2:** For the auth-guard journey, set up the share link via direct API call (`page.request`) rather than through UI, to keep the test focused on the redirect behavior.

### `e2e/journeys/note-crud.journey.ts`

Three tests (each runs its own `registerAndLogin` in a beforeEach or top-level await):
1. Create note → title → navigate back → card visible in list
2. Type in editor → wait → `Saving…` visible → `Saved` visible within 5s
3. Create note → navigate to list → hover card → delete → confirm → card gone

**Autosave timing note:** After typing, use:
```typescript
await expect(noteEditor.saveStatusSaving).toBeVisible({ timeout: 3_500 });
await expect(noteEditor.saveStatusSaved).toBeVisible({ timeout: 5_000 });
```
If the server responds too fast to catch `Saving…`, asserting `Saved` alone satisfies FRS-FE-19 (status indicator exists). The `toBeVisible` default assertion retries until the element appears or times out.

### `e2e/journeys/tag-filter.journey.ts`

Two tests:
1. Setup: create 2 notes, assign "E2E Tag" to one; filter by tag → only tagged note shown; clear filter → both shown
2. Sub-test: verify untagged note NOT in filtered list

**Tag creation:** Use `NoteEditorPage.addTag()` which opens the combobox and creates the tag inline if it doesn't exist. Tag creation goes through `POST /tags` → tag is immediately available for filter.

**Important:** The tag filter sidebar is only visible at `lg` breakpoint. Set viewport to `{ width: 1280, height: 800 }` for this test.

### `e2e/journeys/fts-search.journey.ts`

Two tests:
1. Create note with title "Playwright FTS Test" + content "e2etestword" → wait for autosave → navigate to search → search "e2etestword" → `<mark>` element visible → click result → on `/notes/:id`
2. Searching for a non-existent term → "No notes found" message visible

**Note:** Use a unique keyword per test run (e.g. `const kw = 'kwrd${Date.now()}'`) so the test doesn't match notes from other test runs on a dirty DB.

### `e2e/journeys/share-public.journey.ts`

Two tests:
1. Create note → open ShareModal → click Generate → link row appears → click "Copy URL" → button changes to text containing "Copied" → read clipboard → URL starts with `http://localhost:5173/public/`
2. Take the URL from clipboard → `anonContext = await browser.newContext()` → navigate to URL → note title visible → no auth prompt

**Clipboard read:**
```typescript
const url = await page.evaluate(() => navigator.clipboard.readText());
expect(url).toMatch(/\/public\//);
```

**Alert dialog for revoke** (if tested): not required for this journey — generation + copy + public view is sufficient.

**FRS-FE-31 note:** The implementation shows "✓ Copied!" as button text (via state change in `ShareLinkRow`), not a shadcn `<Sonner>` toast. The spec scenario tests for the confirmation; asserting button text containing "Copied" satisfies the requirement.

### `e2e/journeys/version-history.journey.ts`

Three tests:
1. Create note → type "first content" → wait for autosave → type more content "second content" → wait for autosave → click History → version list visible with ≥1 rows
2. From test above: click non-current row → preview pane visible → title shown → "Restore" button visible → click "← Back" → list visible again
3. In preview → click "Restore this version" → confirm in AlertDialog → drawer closes → editor title matches snapshot state

**Version setup sequence:**
```
POST /notes {title: "V-Journey Note"}          → note in DB (no snapshot)
PATCH (autosave): title="V-Journey Note", content="first" → snapshot S1 created
PATCH (autosave): title="V-Journey Note", content="second" → snapshot S2 created
Drawer shows: [S2 "Current" (non-clickable), S1 (clickable)]
Restore S1 → note reverts to {content: "first"}
```

After 2 autosaves we have 2 snapshots. Row 0 is "Current" (non-clickable). Row 1 is the first snapshot and is clickable.

---

## TypeScript Configuration

Playwright uses esbuild to compile TypeScript at runtime — no separate `tsconfig.json` required in `e2e/`. The `@playwright/test` package is already in root `devDependencies`. Import `.js` extensions to match the monorepo ESM convention:
```typescript
import { LoginPage } from '../pages/LoginPage.js';
```

---

## Checkpoint Commands

```bash
# After Phase 0: verify config parses (no tests yet)
npx playwright test --list

# After each phase: run the newly added journey
npx playwright test e2e/journeys/auth-flow.journey.ts

# Full suite
npx playwright test
```

No pnpm lint/build gates needed (E2E files are not included in the api or web tsconfig, so they don't affect those build checks).

---

## File Creation Order

| Order | File | Phase |
|---|---|---|
| 1 | `playwright.config.ts` (modify) | 0 |
| 2 | `e2e/helpers/auth.ts` | 2 |
| 3 | `e2e/pages/RegisterPage.ts` | 1 |
| 4 | `e2e/pages/LoginPage.ts` | 1 |
| 5 | `e2e/pages/NotesListPage.ts` | 1 |
| 6 | `e2e/pages/NoteEditorPage.ts` | 1 |
| 7 | `e2e/pages/SearchPage.ts` | 1 |
| 8 | `e2e/pages/PublicNotePage.ts` | 1 |
| 9 | `e2e/journeys/auth-flow.journey.ts` | 3 |
| 10 | `e2e/journeys/auth-guard.journey.ts` | 3 |
| 11 | `e2e/journeys/note-crud.journey.ts` | 3 |
| 12 | `e2e/journeys/tag-filter.journey.ts` | 3 |
| 13 | `e2e/journeys/fts-search.journey.ts` | 3 |
| 14 | `e2e/journeys/share-public.journey.ts` | 3 |
| 15 | `e2e/journeys/version-history.journey.ts` | 3 |

---

## Assumptions

1. **No `data-testid` needed** — semantic selectors (`aria-label`, `placeholder`, `role`, `getByText`) are sufficient. If a selector turns out to be fragile during implementation, the fix is to add one targeted `data-testid` to the component in question.
2. **Tag filter viewport** — tests that use the tag filter sidebar assume `1280×800` viewport. The sidebar is hidden on smaller screens.
3. **FTS indexing latency** — the `tsvector` column is a PostgreSQL `GENERATED ALWAYS AS` column that updates synchronously on PATCH. After `Saved` appears in the editor, the note is immediately searchable. No extra wait is needed.
4. **Clipboard** — `navigator.clipboard.readText()` works because `playwright.config.ts` grants `clipboard-read` permission globally.
5. **Public page selector** — `h1` for note title on the public page is assumed; if the public page uses a different heading level, update `PublicNotePage.title`.
