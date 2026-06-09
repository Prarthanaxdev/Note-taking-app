# note-editor Specification

## Purpose
TBD - created by archiving change AB-1012. Update Purpose after archive.
## Requirements
### Requirement: TipTap rich-text editor with full toolbar

The system SHALL render a TipTap editor with the following formatting controls: Bold, Italic,
Underline, Heading H1 / H2 / H3, Bullet List, Ordered List, Blockquote, Code Block. The note
title SHALL be a separate plain-text `<input>` element above the editor — it is NOT part of
the TipTap document. The editor content is initialised from `note.content` (TipTap JSON) on
first load and SHALL NOT re-initialise on subsequent renders (controlled via `useEditor` with
a stable initial content value).

#### Scenario: Editor initialises with persisted content
- **GIVEN** a note with saved TipTap JSON content
- **WHEN** the user navigates to `/notes/:id`
- **THEN** the TipTap editor displays the saved content and the title input shows the saved title

#### Scenario: Toolbar applies bold formatting
- **WHEN** the user selects text and clicks Bold in the toolbar
- **THEN** the selected text is wrapped with bold formatting in the editor

#### Scenario: Title input is separate from rich-text body
- **WHEN** the user edits the title input
- **THEN** the change affects only the title field; the TipTap document is unchanged

#### Scenario: Empty note shows placeholder text
- **WHEN** a newly created note has null content
- **THEN** the editor displays a placeholder (e.g. "Start writing…") in the content area

---

### Requirement: 2-second debounce autosave with status indicator

The system SHALL automatically save the note 2 seconds after the last change to the title or
content. The save SHALL send `PATCH /notes/:id` with `{ title, content, tagIds }`. The status
indicator SHALL show one of three states at all times during an active edit session:

- **Saving…** — the PATCH is in-flight (spinner icon)
- **Saved** — the last PATCH succeeded (check icon)
- **Error saving** — the last PATCH failed (red ✕ icon + retry button)

The timer resets on every keystroke. If the title and content are identical to the last loaded
(or last saved) values, no PATCH is sent.

#### Scenario: Autosave fires 2 seconds after title change
- **WHEN** the user edits the title and stops typing
- **THEN** exactly 2 seconds later the system sends `PATCH /notes/:id` with the new title
- **AND** the status indicator shows 'Saving…' while the request is in-flight

#### Scenario: Autosave fires 2 seconds after content change
- **WHEN** the user edits the TipTap content and stops typing
- **THEN** exactly 2 seconds later the system sends `PATCH /notes/:id` with the updated content

#### Scenario: Rapid typing resets the timer
- **WHEN** the user makes multiple edits within 2 seconds
- **THEN** the timer is cleared and restarted on each edit; only one PATCH is sent after the final keystroke

#### Scenario: Status shows 'Saved' after successful autosave
- **WHEN** the PATCH request completes successfully
- **THEN** the status indicator transitions to 'Saved' with a check icon

#### Scenario: Status shows 'Error saving' after failed autosave
- **WHEN** the PATCH request fails (network error or 4xx/5xx)
- **THEN** the status indicator shows 'Error saving' with a retry button

#### Scenario: Retry button manually re-triggers the save
- **WHEN** the status is 'Error saving' and the user clicks the retry button
- **THEN** the system immediately sends `PATCH /notes/:id` without waiting for the 2-second debounce

#### Scenario: No autosave when content is unchanged
- **WHEN** the user opens a note and makes no edits
- **THEN** no PATCH request is sent and the status indicator is not shown (or shows an idle state)

#### Scenario: beforeunload warning when status is 'error'
- **WHEN** the user attempts to navigate away from the page while the status is 'Error saving'
- **THEN** the browser shows a native 'Leave page?' confirmation dialog

---

### Requirement: Note editor page layout and navigation

The note editor page SHALL render within the AppShell (sidebar + main area). The main area
contains: an editable title input, a fixed toolbar, the TipTap editor body, and a header row
with SaveStatusIndicator, TagCombobox, Share button, and History button.

#### Scenario: Loading state while note is fetching
- **WHEN** `GET /notes/:id` is in-flight
- **THEN** the editor shows a loading skeleton or spinner; no empty editor is shown

#### Scenario: 404 note redirects to /notes
- **WHEN** `GET /notes/:id` returns 404
- **THEN** the user is redirected to `/notes`

#### Scenario: Share button opens the share modal stub
- **WHEN** the user clicks the Share button
- **THEN** a dialog opens with the heading 'Share this note' and placeholder body text

#### Scenario: History button opens the version drawer stub
- **WHEN** the user clicks the History button
- **THEN** a right-side sheet opens with the heading 'Version history' and placeholder body text

