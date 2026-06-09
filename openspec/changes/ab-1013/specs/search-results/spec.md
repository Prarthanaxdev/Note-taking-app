# search-results Spec — AB-1013

## Purpose
Define the behaviour of `SearchPage` at `/search`: URL-driven query state, result rendering
with `<mark>` highlighting, loading skeleton, empty state, and full pagination.

## Requirements

### Requirement: Search page reads query from URL params

`SearchPage` SHALL derive the active search query from the `q` URL parameter
(`/search?q=<term>&page=<n>`). When `q` is absent or empty the page SHALL show the search input
with a prompt ("Enter a search term…") and make no API call. When `q` is non-empty, the page
SHALL call `GET /notes/search?q=<q>&page=<page>&limit=20` via the `useSearch` hook.

#### Scenario: Page renders idle state when no query in URL
- **GIVEN** the user navigates to `/search` with no `q` param
- **THEN** the page shows a search input and an instructional message
- **AND** no `GET /notes/search` request is made

#### Scenario: Page fires search when q param is present in URL
- **GIVEN** the user navigates to `/search?q=react`
- **THEN** the page calls `GET /notes/search?q=react&page=1&limit=20`
- **AND** displays the results once the response arrives

#### Scenario: Editing the input and pressing Enter updates the URL and refetches
- **GIVEN** the search page is showing results for query "react"
- **WHEN** the user clears the input, types "typescript", and presses Enter
- **THEN** the URL updates to `/search?q=typescript&page=1`
- **AND** the page calls `GET /notes/search?q=typescript&page=1&limit=20`

---

### Requirement: Results rendered with highlighted headline

Each result in `{ data: SearchResult[] }` SHALL be rendered as a card showing:
- Note **title** (plain text)
- **Headline** snippet with `<mark>` tags rendered as highlighted `<span>` elements
  (via `dangerouslySetInnerHTML`)
- **Updated date** formatted as a relative or absolute date string

Clicking the result card SHALL navigate to `/notes/:id`.

#### Scenario: Search results display title and highlighted headline
- **GIVEN** `GET /notes/search` returns results with `<mark>` tags in the headline
- **WHEN** the results render
- **THEN** each result shows the note title
- **AND** matched terms in the headline are visually highlighted (yellow background or similar)
- **AND** the `updatedAt` date is shown

#### Scenario: Clicking a result navigates to the note editor
- **WHEN** the user clicks a search result card
- **THEN** the browser navigates to `/notes/:id` for that note

---

### Requirement: Loading skeleton while search is in-flight

While `GET /notes/search` is pending, the page SHALL render a loading skeleton (animated
placeholder rows) instead of an empty content area.

#### Scenario: Loading skeleton shown while search request is in-flight
- **GIVEN** the user submitted a search query
- **WHEN** the request has not yet resolved
- **THEN** 3–5 skeleton result rows with pulse animation are shown
- **AND** no actual result data is shown until the request completes

---

### Requirement: Empty state when search returns no results

When the API returns `{ data: [], meta: { total: 0, ... } }` the page SHALL render a "no
results" message that includes the search query string.

#### Scenario: No-results empty state shows the query
- **GIVEN** `GET /notes/search` returns an empty `data` array
- **WHEN** the results render
- **THEN** the page shows a message such as "No notes found for 'react'"
- **AND** no result cards are rendered

---

### Requirement: Full pagination controls

When results span multiple pages (`meta.totalPages > 1`) the page SHALL render the reusable
`Pagination` component from `apps/web/src/components/notes/Pagination.tsx`. The current page
number SHALL live in the `page` URL param; changing pages SHALL update the URL and refetch.

#### Scenario: Pagination controls appear when results exceed one page
- **GIVEN** the search returns `meta.totalPages = 3` and `meta.page = 1`
- **WHEN** the results render
- **THEN** Previous and Next buttons (and/or page indicators) are shown

#### Scenario: Clicking Next page updates URL and fetches page 2
- **WHEN** the user clicks Next
- **THEN** the URL updates to `/search?q=<term>&page=2`
- **AND** the page calls `GET /notes/search?q=<term>&page=2&limit=20`

#### Scenario: Changing query resets page to 1
- **WHEN** the user submits a new search query
- **THEN** the `page` URL param resets to 1 regardless of the previous page
