# share-modal Spec — AB-1014

## Purpose
Define the behaviour of the full `ShareModal` implementation: listing active share links,
generating new links with an optional expiry date, copying the public URL to clipboard with
inline feedback, and revoking links with a confirmation dialog.

## ADDED Requirements

### Requirement: Active share links are listed in the modal

When the share modal opens, the system SHALL fetch all active share links for the current note
via `GET /notes/:id/shares` and display each one as a row. An active link is one returned by
the API (i.e. `revokedAt IS NULL` and not expired — the backend filters these out). Each row
SHALL show:
- A token preview (the first 8 characters of the UUID token followed by "…")
- The expiry date, or "Never" if `expiresAt` is null
- The view count
- A "Copy URL" button
- A "Revoke" button

#### Scenario: Modal opens and shows existing share links
- **GIVEN** the note has two active share links
- **WHEN** the user clicks "Share" to open the modal
- **THEN** the modal fetches `GET /notes/:id/shares`
- **AND** displays two rows, each with a token preview, expiry, view count, Copy URL, and Revoke

#### Scenario: Modal shows empty state when no active links exist
- **GIVEN** the note has no active share links
- **WHEN** the user opens the share modal
- **THEN** the modal shows "No active links yet." below the generate form

#### Scenario: Modal shows loading skeleton while fetching
- **GIVEN** `GET /notes/:id/shares` is in-flight
- **WHEN** the modal is open
- **THEN** a loading indicator (spinner or skeleton) is shown in place of the links list

---

### Requirement: Generate a new share link with optional expiry

The modal SHALL provide a "Generate Link" form with:
- An optional native `<input type="date">` for expiry (minimum: tomorrow)
- A "Generate" button that calls `POST /notes/:id/share` with `{ expiresAt? }`

On success (201), the link list SHALL refresh automatically (by invalidating the
`['shares', noteId]` query). While the request is in-flight the Generate button SHALL be
disabled and show a loading indicator.

#### Scenario: Generate a permanent link (no expiry)
- **GIVEN** the user leaves the expiry date blank
- **WHEN** the user clicks "Generate"
- **THEN** the system calls `POST /notes/:id/share` with no `expiresAt` field
- **AND** the new link appears in the list with "Never" as the expiry

#### Scenario: Generate a link with an expiry date
- **GIVEN** the user selects a future date in the expiry input
- **WHEN** the user clicks "Generate"
- **THEN** the system calls `POST /notes/:id/share` with `{ expiresAt: "<ISO datetime>" }`
- **AND** the new link appears in the list with the chosen date as the expiry

#### Scenario: Generate button is disabled while request is in-flight
- **WHEN** the user clicks "Generate" and the request is pending
- **THEN** the Generate button is disabled and shows a spinner
- **AND** the user cannot submit the form again while waiting

---

### Requirement: Copy public URL to clipboard with inline feedback

Each share link row SHALL have a "Copy URL" button. Clicking it SHALL:
1. Construct the public URL as `window.location.origin + '/public/' + link.token`
2. Write it to the clipboard via `navigator.clipboard.writeText()`
3. Temporarily change the button label to "✓ Copied!" for 2 seconds, then reset to "Copy URL"

No toast library is used; the feedback is entirely inline within the button.

#### Scenario: Copy URL writes to clipboard and shows confirmation
- **WHEN** the user clicks "Copy URL" on a share link row
- **THEN** the public URL is written to the clipboard
- **AND** the button label changes to "✓ Copied!" for approximately 2 seconds
- **AND** the button returns to "Copy URL" after 2 seconds

#### Scenario: Public URL is correctly constructed
- **GIVEN** a share link with token `"abc123-..."`
- **WHEN** the URL is constructed
- **THEN** it equals `window.location.origin + '/public/abc123-...'`

---

### Requirement: Revoke a share link with confirmation

Each share link row SHALL have a "Revoke" button. Clicking it SHALL open an `AlertDialog`
confirmation. If the user confirms, the system SHALL call `DELETE /shares/:shareId` (204).
On success the link list SHALL refresh automatically. Revoking is permanent (BR-SHARE-07).

#### Scenario: Revoke requires confirmation before deleting
- **WHEN** the user clicks "Revoke" on a share link row
- **THEN** a confirmation dialog appears with a destructive warning message
- **AND** no DELETE request is made yet

#### Scenario: Confirming revoke removes the link from the list
- **GIVEN** the revoke confirmation dialog is open
- **WHEN** the user clicks "Revoke" in the dialog
- **THEN** the system calls `DELETE /shares/:shareId`
- **AND** the link is removed from the list after the request completes

#### Scenario: Cancelling revoke leaves the link intact
- **GIVEN** the revoke confirmation dialog is open
- **WHEN** the user clicks "Cancel"
- **THEN** no DELETE request is made
- **AND** the link remains in the list
