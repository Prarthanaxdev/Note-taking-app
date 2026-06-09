import { test, expect } from '@playwright/test';
import { uniqueEmail, registerAndLogin } from '../helpers/auth';
import { NotesListPage } from '../pages/NotesListPage';
import { NoteEditorPage } from '../pages/NoteEditorPage';

// Tag filter sidebar is only visible at lg breakpoint (≥1280px)
test.use({ viewport: { width: 1280, height: 800 } });

test.describe('tag filter', () => {
  const tagName = `Tag-${Date.now()}`;

  // T-12a: filter by tag shows only tagged notes (FRS-FE-11, BR-NOTE-11)
  test('filtering by tag shows only tagged notes', async ({ page }) => {
    await registerAndLogin(page, uniqueEmail());

    const notesList = new NotesListPage(page);

    // Create the tagged note
    await notesList.clickNewNote();
    const editor = new NoteEditorPage(page);
    await editor.setTitle('Tagged Note');
    await editor.addTag(tagName);
    await editor.waitForSaved();
    await editor.goBackToList();

    // Create the untagged note
    await notesList.clickNewNote();
    const editor2 = new NoteEditorPage(page);
    await editor2.setTitle('Untagged Note');
    await editor2.goBackToList();

    // Both notes visible before filter
    await expect(notesList.noteCard('Tagged Note')).toBeVisible();
    await expect(notesList.noteCard('Untagged Note')).toBeVisible();

    // Apply tag filter
    await notesList.filterByTag(tagName);

    await expect(notesList.noteCard('Tagged Note')).toBeVisible();
    await expect(notesList.noteCard('Untagged Note')).not.toBeVisible();
  });

  // T-12b: clearing the tag filter restores the full list
  test('clearing tag filter restores full notes list', async ({ page }) => {
    await registerAndLogin(page, uniqueEmail());

    const notesList = new NotesListPage(page);

    // Create tagged note
    await notesList.clickNewNote();
    const editor = new NoteEditorPage(page);
    await editor.setTitle('Tagged Note B');
    await editor.addTag(tagName);
    await editor.waitForSaved();
    await editor.goBackToList();

    // Create untagged note
    await notesList.clickNewNote();
    const editor2 = new NoteEditorPage(page);
    await editor2.setTitle('Untagged Note B');
    await editor2.goBackToList();

    // Filter
    await notesList.filterByTag(tagName);
    await expect(notesList.noteCard('Untagged Note B')).not.toBeVisible();

    // Clear filter
    await notesList.clearTagFilter(tagName);
    await expect(notesList.noteCard('Tagged Note B')).toBeVisible();
    await expect(notesList.noteCard('Untagged Note B')).toBeVisible();
  });
});
