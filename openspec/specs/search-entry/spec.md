# search-entry Specification

## Purpose
TBD - created by archiving change ab-1013. Update Purpose after archive.
## Requirements
### Requirement: Search bar in NotesListPage header

The `NotesListPage` header row SHALL include a search input with a `Search` icon. The input is
a controlled element with a submit handler. When the user presses Enter or clicks the search
icon button, the app SHALL navigate to `/search?q=<trimmed-value>` via React Router `useNavigate`.
If the input is empty or whitespace-only, no navigation occurs.

#### Scenario: Pressing Enter in the search bar navigates to the search page
- **GIVEN** the user is on the Notes List page (`/notes`)
- **WHEN** the user types "react hooks" in the search input and presses Enter
- **THEN** the browser navigates to `/search?q=react+hooks`
- **AND** the SearchPage is displayed with results for "react hooks"

#### Scenario: Clicking the search icon button submits the search
- **GIVEN** the user has typed a query in the search bar
- **WHEN** the user clicks the Search icon button (not pressing Enter)
- **THEN** the browser navigates to `/search?q=<query>` (same behaviour as pressing Enter)

#### Scenario: Empty query does not navigate
- **WHEN** the user focuses the search input and presses Enter without typing anything
- **THEN** no navigation occurs and the user stays on `/notes`

#### Scenario: Search bar does not affect notes list sorting or filtering
- **WHEN** the user types in the search bar (without submitting)
- **THEN** the notes list below is unchanged
- **AND** the existing sort/filter controls continue to work independently

