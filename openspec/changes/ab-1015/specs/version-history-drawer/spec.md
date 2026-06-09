# version-history-drawer Spec — AB-1015

## Purpose
Define the behaviour of the full Version History Drawer: listing version snapshots,
previewing a selected version in a read-only TipTap editor, identifying the current
version, and restoring a past version with confirmation.

## ADDED Requirements

### Requirement: Version list is shown when the drawer opens

When the history drawer opens, the system SHALL fetch `GET /notes/:id/versions` and
render one row per version. Each row SHALL show a formatted timestamp (`savedAt`). The
first row (most recent) SHALL be labeled "Current" and SHALL NOT show a Restore button
(FRS-FE-36). All other rows SHALL be clickable and navigate to the preview state.

#### Scenario: Drawer opens and lists all versions
- **GIVEN** the note has 3 saved versions
- **WHEN** the user clicks "History" to open the drawer
- **THEN** the drawer fetches `GET /notes/:id/versions`
- **AND** renders 3 rows ordered most-recent first
- **AND** the first row is labeled "Current"

#### Scenario: First version row has no Restore button
- **GIVEN** the drawer is open and the list is rendered
- **WHEN** the user sees the version list
- **THEN** the first row (current version) does NOT have a "Restore" affordance
- **AND** all other rows do NOT have a Restore button in list view (Restore is only in preview)

#### Scenario: Empty state when no versions exist
- **GIVEN** the note has never been saved after creation
- **WHEN** the user opens the drawer
- **THEN** `GET /notes/:id/versions` returns an empty array
- **AND** the drawer shows "No version history yet."

#### Scenario: Loading state while fetching
- **GIVEN** `GET /notes/:id/versions` is in-flight
- **WHEN** the drawer is open
- **THEN** a loading skeleton is shown in place of the version list

---

### Requirement: Clicking a version navigates to the preview pane

When the user clicks a non-current version row, the drawer SHALL transition from list
view to preview view. In preview view the drawer SHALL:
- Show a "← Back" button in the header that returns to the list
- Fetch `GET /notes/:id/versions/:vid` and render the version title and content in a
  read-only TipTap editor (no toolbar, not editable)
- Show a "Restore this version" button in the footer

#### Scenario: Clicking a version row opens the preview
- **WHEN** the user clicks a non-current version row
- **THEN** the drawer fetches `GET /notes/:id/versions/:vid`
- **AND** renders the version content in a read-only TipTap editor
- **AND** shows the version title above the editor
- **AND** shows a "← Back" button and a "Restore this version" button

#### Scenario: Back button returns to list
- **GIVEN** the preview pane is open
- **WHEN** the user clicks "← Back"
- **THEN** the drawer returns to the version list
- **AND** no Restore request is made

#### Scenario: Preview loading state
- **GIVEN** the user clicked a version row and `GET /notes/:id/versions/:vid` is in-flight
- **WHEN** the preview pane is displayed
- **THEN** a loading skeleton is shown in place of the content

---

### Requirement: Restore a past version with confirmation

The "Restore this version" button SHALL open an `AlertDialog` confirmation. If the
user confirms, the system SHALL call `POST /notes/:id/versions/:vid/restore` (200).
On success the drawer SHALL close, the note list query SHALL be invalidated, and the
version list query SHALL be invalidated so the editor refreshes with restored content
and the drawer reflects the new snapshot.

#### Scenario: Restore requires confirmation before posting
- **WHEN** the user clicks "Restore this version"
- **THEN** an AlertDialog appears with a warning that this will replace the current content
- **AND** no POST request is made yet

#### Scenario: Confirming restore closes the drawer and refreshes the editor
- **GIVEN** the restore confirmation dialog is open
- **WHEN** the user clicks "Restore" in the dialog
- **THEN** the system calls `POST /notes/:id/versions/:vid/restore`
- **AND** `['notes', noteId]` is invalidated (editor refreshes)
- **AND** `['versions', noteId]` is invalidated (list refreshes)
- **AND** the drawer closes

#### Scenario: Cancelling restore leaves the note unchanged
- **GIVEN** the restore confirmation dialog is open
- **WHEN** the user clicks "Cancel"
- **THEN** no POST request is made
- **AND** the preview pane remains open

#### Scenario: Restore button shows loading state while in-flight
- **WHEN** the user confirms restore and the request is pending
- **THEN** the Restore button in the dialog is disabled with a loading indicator
- **AND** the user cannot submit again while waiting

---

### Requirement: Drawer resets to list view on close

When the drawer is closed (by the user or programmatically), the internal
`selectedVersionId` SHALL be reset to `null` so that the next open always starts on
the list view.

#### Scenario: Reopening the drawer after previewing a version starts at the list
- **GIVEN** the user has navigated to the preview pane
- **WHEN** the user closes the drawer and reopens it
- **THEN** the drawer shows the version list, not the last-viewed preview
