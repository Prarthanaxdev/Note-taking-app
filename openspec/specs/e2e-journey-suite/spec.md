# e2e-journey-suite Specification

## Purpose
TBD - created by archiving change ab-1016. Update Purpose after archive.
## Requirements
### Requirement: Playwright config launches both servers automatically

The `playwright.config.ts` at the monorepo root SHALL be extended with two `webServer` entries: one starting `pnpm --filter api dev` (waiting for `:3001`) and one starting `pnpm --filter web dev` (waiting for `:5173`). The browser context SHALL grant `clipboard-read` and `clipboard-write` permissions. No manual server startup SHALL be required to run `npx playwright test`.

#### Scenario: Suite starts without running servers
- **GIVEN** no API or web server is running
- **WHEN** the developer runs `npx playwright test`
- **THEN** Playwright starts both dev servers automatically and waits until both ports are ready before running any test

---

### Requirement: Page Object Model classes wrap each page's selectors and actions

Each page visited by E2E tests SHALL have a corresponding POM class in `e2e/pages/`. Journey test files MUST NOT use raw Playwright locator strings directly — they SHALL use the POM instead.

#### Scenario: POM class encapsulates login interaction
- **GIVEN** a `LoginPage` POM class exists
- **WHEN** a journey test calls `loginPage.fillEmail(email)`, `fillPassword(pw)`, and `submit()`
- **THEN** the Playwright actions apply to the correct fields on `/login`

---

### Requirement: Each journey registers a fresh user in beforeAll

Every journey test file SHALL call `POST /api/v1/auth/register` (via UI or `registerAndLogin` helper) in `beforeAll`. No journey SHALL depend on state left by another. Email uniqueness SHALL use a timestamp suffix (e.g. `test-${Date.now()}@e2e.local`).

#### Scenario: Journey starts isolated from other journeys
- **GIVEN** the journey's `beforeAll` runs
- **WHEN** `registerAndLogin` is called with a unique email
- **THEN** a fresh user exists and the browser is authenticated on `/notes`

---

### Requirement: Auth flow journey covers register, login, and logout (FRS-FE-07, UC-AUTH-01/02/04)

The auth-flow journey SHALL verify that registering at `/register` redirects to `/notes` (FRS-FE-07), that logging in at `/login` redirects to `/notes`, and that clicking Logout returns to `/login` (UC-AUTH-04). The access token MUST NOT appear in `localStorage` at any point.

#### Scenario: New user registers and lands on notes list
- **GIVEN** a user visits `/register` in a fresh browser context
- **WHEN** they submit a valid email and password (≥8 chars)
- **THEN** the browser navigates to `/notes`

#### Scenario: Existing user logs in and lands on notes list
- **GIVEN** a registered user visits `/login`
- **WHEN** they submit valid credentials
- **THEN** the browser navigates to `/notes`

#### Scenario: Logout redirects to /login
- **GIVEN** the user is authenticated and on `/notes`
- **WHEN** they click Logout
- **THEN** the browser navigates to `/login`
- **AND** navigating to `/notes` immediately after redirects back to `/login`

---

### Requirement: Auth guard journey enforces protected routes and allows public note access (FRS-FE-08, BR-SHARE-06)

The auth-guard journey SHALL verify that navigating to `/notes` without a session redirects to `/login` (FRS-FE-08). It SHALL also verify that `/public/:token` renders a shared note for an anonymous visitor (UC-SHARE-02, BR-SHARE-06) in a separate browser context with no session cookie.

#### Scenario: Unauthenticated access to /notes redirects to /login
- **GIVEN** a fresh browser context with no session cookie
- **WHEN** the user navigates directly to `/notes`
- **THEN** the browser is redirected to `/login`

#### Scenario: Public note page renders without authentication
- **GIVEN** a valid share token for an existing note
- **WHEN** an anonymous browser context navigates to `/public/:token`
- **THEN** the note title and content are rendered with no login prompt

---

### Requirement: Note CRUD journey validates creation, autosave timing, and deletion (FRS-FE-18/19, FRS-FE-14)

The note-crud journey SHALL verify that a new note can be created, that the save status indicator transitions through `Saving…` and then to `Saved` within 3 seconds of the last keystroke (FRS-FE-18, FRS-FE-19), and that the delete button shows a confirmation dialog before removing the note.

#### Scenario: New note created and visible in the list
- **GIVEN** the user is on `/notes`
- **WHEN** they click "New Note", enter a title, and navigate back
- **THEN** the new note appears in the notes list

#### Scenario: Autosave status transitions Saving → Saved within 3 seconds (FRS-FE-18/19)
- **GIVEN** the user is in the note editor
- **WHEN** they type content and pause for 2.2 seconds
- **THEN** the save status shows `Saving…` and then `Saved`

#### Scenario: Delete with confirmation removes the note from the list (FRS-FE-14)
- **GIVEN** the user is on the notes list with at least one note
- **WHEN** they click the delete button and confirm in the dialog
- **THEN** the note is no longer visible in the list

---

### Requirement: Tag filter journey validates tag assignment and AND-logic filtering (FRS-FE-11, BR-NOTE-11)

The tag-filter journey SHALL verify that a tag can be created and assigned to a note via the tag combobox in the editor. Filtering the notes list by that tag MUST show only notes that carry it (BR-NOTE-11).

#### Scenario: Filtering by a tag shows only tagged notes
- **GIVEN** two notes exist — one tagged with Tag A, one without
- **WHEN** the user selects Tag A in the tag filter panel
- **THEN** only the note tagged with Tag A appears in the list
- **AND** the untagged note is not shown

#### Scenario: Clearing the tag filter restores the full notes list
- **GIVEN** a tag filter is active
- **WHEN** the user deselects the tag filter
- **THEN** all notes reappear in the list

---

### Requirement: Full-text search journey validates FTS results with highlighted headlines (UC-SRCH-01, FRS-FE-25/26)

The fts-search journey SHALL verify that searching for a keyword contained in a note returns a result whose headline contains a `<mark>` element (FRS-FE-25). Clicking the result SHALL navigate to the note editor for that note (FRS-FE-26).

#### Scenario: Searching for note content returns a result with highlighted headline
- **GIVEN** a note with content containing a known keyword
- **WHEN** the user searches for that keyword
- **THEN** at least one result appears
- **AND** the result headline contains a highlighted `mark` element wrapping the keyword

#### Scenario: Clicking a search result opens the note editor
- **GIVEN** at least one search result is displayed
- **WHEN** the user clicks the result
- **THEN** the browser navigates to the note editor for that note

---

### Requirement: Share link journey validates generation, clipboard copy toast, and public page rendering (UC-SHARE-01/02, FRS-FE-31)

The share-public journey SHALL verify that a share link can be generated from the share modal. Clicking "Copy URL" SHALL copy the public URL to the clipboard and show a confirmation toast (FRS-FE-31). Opening the copied URL in an anonymous browser context SHALL render the note title and content without authentication (UC-SHARE-02).

#### Scenario: Copy URL shows a confirmation toast (FRS-FE-31)
- **GIVEN** the share modal is open and at least one share link is shown
- **WHEN** the user clicks "Copy URL"
- **THEN** a toast notification confirms the URL was copied to the clipboard

#### Scenario: Public URL renders the note for an anonymous visitor (UC-SHARE-02)
- **GIVEN** the share link URL is known
- **WHEN** an anonymous browser context (no cookies) navigates to that URL
- **THEN** the note title and content are displayed with no login prompt

---

### Requirement: Version history journey validates list, preview, and restore (UC-VER-01/02, FRS-FE-33/34/35)

The version-history journey SHALL verify that after a note is autosaved at least once (creating a `NoteVersion` snapshot), the history drawer lists version rows with timestamps (FRS-FE-33). Clicking a non-current version SHALL display a read-only preview (FRS-FE-34). Confirming a restore SHALL update the note editor with the restored content (FRS-FE-35).

#### Scenario: History drawer shows version list after autosave (FRS-FE-33)
- **GIVEN** a note has been autosaved at least once
- **WHEN** the user clicks "History" to open the version drawer
- **THEN** at least one version row with a timestamp is visible in the drawer

#### Scenario: Clicking a version row shows a read-only preview (FRS-FE-34)
- **GIVEN** the history drawer is open with at least two versions
- **WHEN** the user clicks a non-current version row
- **THEN** the preview pane shows that version's title and content in a non-editable view

#### Scenario: Restore replaces editor content and creates a new snapshot (FRS-FE-35)
- **GIVEN** the version preview pane is open for an older version
- **WHEN** the user clicks "Restore this version" and confirms in the AlertDialog
- **THEN** the note editor updates to display the restored title and content
- **AND** the version history list has a new entry at the top

