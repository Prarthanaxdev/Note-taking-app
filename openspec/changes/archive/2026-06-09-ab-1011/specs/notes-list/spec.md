# Spec — notes-list

## ADDED Requirements

### Requirement: Notes list displays card-per-note with metadata

The notes list SHALL display one card per note. Each card SHALL include: the note title, a content preview (first 150 characters of `contentPreview` from the API — truncation happens server-side), tag chips rendered with the tag's `color` (if set), and the `updatedAt` timestamp formatted as a relative string (e.g. "2 hours ago"). Each card SHALL be clickable — clicking anywhere on the card (except the delete button) navigates to `/notes/:id`.

#### Scenario: Cards render all required metadata
- **GIVEN** the user has notes with titles, content, tags, and timestamps
- **WHEN** they navigate to `/notes`
- **THEN** each note card shows title, content preview (≤150 chars), tag chips, and a human-readable timestamp

#### Scenario: Clicking a note card navigates to the editor
- **WHEN** the user clicks a note card
- **THEN** the browser navigates to `/notes/:id` for that note

---

### Requirement: Sort control changes list ordering

A sort control SHALL be shown above the note list. It SHALL allow selecting one of three sort fields: "Last Updated" (`updatedAt`), "Created" (`createdAt`), "Title" (`title`). Each field SHALL have an ascending/descending toggle. Changing the sort SHALL update the URL query parameters (`?sortBy=&sortOrder=`) and refetch the list.

#### Scenario: Changing sort field updates URL and refetches
- **WHEN** the user selects "Title" from the sort dropdown
- **THEN** the URL becomes `?sortBy=title&sortOrder=asc` (default asc for title) and the list reorders

#### Scenario: Toggling sort direction
- **WHEN** the user clicks the direction toggle while "Last Updated" is selected
- **THEN** `?sortOrder` toggles between `asc` and `desc` and the list reorders

---

### Requirement: Tag filter narrows list with AND logic

A tag filter panel SHALL list all the user's tags as checkboxes. Selecting one or more tags SHALL filter the list to show only notes that have ALL selected tags simultaneously (AND logic, per BR-NOTE-11). The selected tag IDs SHALL be reflected in the URL as `?tags=id1,id2`. Deselecting all tags removes the filter.

#### Scenario: Selecting a single tag filters the list
- **GIVEN** the user has tags "Work" and "Personal"
- **WHEN** the user checks "Work"
- **THEN** only notes tagged "Work" are shown and the URL contains `?tags=<workTagId>`

#### Scenario: Selecting two tags applies AND logic
- **WHEN** the user checks both "Work" and "Personal"
- **THEN** only notes tagged with BOTH "Work" AND "Personal" are shown

#### Scenario: No tags selected shows all notes
- **WHEN** no tag checkboxes are checked
- **THEN** the full note list is shown (no tag filter applied)

---

### Requirement: Pagination controls navigate between pages

Pagination controls (previous/next buttons and current page indicator) SHALL be rendered when `meta.totalPages > 1`. Clicking next/prev SHALL update `?page=` in the URL. The current page SHALL be highlighted. The controls SHALL be disabled at the first/last page respectively.

#### Scenario: Pagination shows when multiple pages exist
- **GIVEN** the user has 25 notes and limit is 20
- **WHEN** they view the notes list
- **THEN** pagination controls appear showing "Page 1 of 2" with a Next button

#### Scenario: Navigating to next page updates URL
- **WHEN** the user clicks Next
- **THEN** URL becomes `?page=2` and the second page of notes is shown

#### Scenario: No pagination when one page
- **GIVEN** the user has ≤20 notes
- **WHEN** they view the notes list
- **THEN** no pagination controls are rendered

---

### Requirement: New Note button creates and navigates

The "New Note" button (in the AppShell sidebar) SHALL call `POST /notes` with `{ title: "Untitled" }` immediately and then navigate to `/notes/:newId`. If the POST fails, an error toast is shown and the user stays on the list.

#### Scenario: Creating a new note navigates to editor
- **WHEN** the user clicks "New Note"
- **THEN** a POST is made to `/api/v1/notes`, and on success the browser navigates to `/notes/:newId`

#### Scenario: New Note button shows loading state while POSTing
- **WHEN** the POST is in flight
- **THEN** the "New Note" button is disabled and shows a loading indicator

---

### Requirement: Delete note with confirmation dialog

Each note card SHALL have a delete (trash icon) button. Clicking it SHALL open a shadcn `Dialog` asking "Are you sure you want to delete this note?" with "Cancel" and "Delete" buttons. Confirming SHALL call `DELETE /notes/:id`. On success the note disappears from the list immediately (via cache invalidation).

#### Scenario: Delete requires confirmation
- **WHEN** the user clicks the trash icon on a note card
- **THEN** a confirmation dialog appears; no deletion occurs yet

#### Scenario: Cancelling dialog leaves note intact
- **WHEN** the user clicks "Cancel" in the delete dialog
- **THEN** the dialog closes and the note remains in the list

#### Scenario: Confirming delete removes note from list
- **WHEN** the user clicks "Delete" in the confirmation dialog
- **THEN** `DELETE /api/v1/notes/:id` is called and the note disappears from the list

---

### Requirement: Empty state when no notes exist

When the user has no notes (or no notes match the current filter), an empty state SHALL be shown with an illustration or icon, the message "No notes yet", and a "Create your first note" call-to-action button that triggers the New Note flow.

#### Scenario: Empty state shown when no notes
- **GIVEN** the user has no notes
- **WHEN** they navigate to `/notes`
- **THEN** the empty state is shown with the "Create your first note" CTA

#### Scenario: Empty state shown when filter matches nothing
- **GIVEN** the user has notes but none match the current tag filter
- **WHEN** they view the filtered list
- **THEN** the empty state is shown (distinct from the zero-notes case if needed, but same component)
