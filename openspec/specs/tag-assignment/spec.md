# tag-assignment Specification

## Purpose
TBD - created by archiving change AB-1012. Update Purpose after archive.
## Requirements
### Requirement: Multi-select tag combobox with inline create

The note editor SHALL display a multi-select combobox that allows the authenticated user to
assign up to 5 tags to the current note. The combobox SHALL:

1. Load the user's existing tags via `GET /tags` on mount.
2. Filter the tag list as the user types (case-insensitive substring match).
3. Show selected tags as Badge chips in the trigger button.
4. When the user types a name that matches no existing tag, show a "Create '{name}'" option
   at the top of the dropdown.
5. Selecting the inline-create option calls `POST /tags` with `{ name }` (color: null).
   The new tag is immediately added to the note's tag list without a full page refresh.
6. Enforce a maximum of 5 tags: the combobox disables the ability to add more once 5 are
   selected, and shows an informational message.
7. Tag changes (add/remove) are batched into the next autosave `PATCH /notes/:id` via the
   `tagIds` field — they do NOT trigger an immediate separate PATCH.

#### Scenario: User selects an existing tag
- **WHEN** the user opens the combobox and clicks an existing tag
- **THEN** the tag is added to the note's selected tag set and displayed as a Badge chip
- **AND** the tag will be included in `tagIds` on the next autosave

#### Scenario: User deselects an existing tag
- **WHEN** the user clicks a currently-selected tag in the combobox or removes its chip
- **THEN** the tag is removed from the note's selected tag set
- **AND** the removal will be reflected in `tagIds` on the next autosave

#### Scenario: Inline create — new tag created and added
- **GIVEN** the user types a name that does not match any existing tag
- **WHEN** the user selects the "Create '{name}'" option
- **THEN** the system calls `POST /tags` with `{ name, color: undefined }`
- **AND** the new tag is immediately added to the selected set
- **AND** the `useTags` query cache is invalidated so the tag appears in future searches

#### Scenario: Maximum 5 tags enforced
- **GIVEN** a note already has 5 tags selected
- **WHEN** the user opens the combobox
- **THEN** existing unselected tags cannot be clicked (disabled state or message shown)
- **AND** the inline-create option is not displayed

#### Scenario: Tag search filters the list
- **WHEN** the user types in the combobox search input
- **THEN** only tags whose names contain the typed string (case-insensitive) are shown

#### Scenario: Empty tag list shows placeholder
- **GIVEN** the user has no tags
- **WHEN** the user opens the combobox
- **THEN** the list area shows 'No tags yet' and the inline-create option is available for any typed name

