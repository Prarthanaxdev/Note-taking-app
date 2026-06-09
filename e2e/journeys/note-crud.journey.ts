import { test, expect } from '@playwright/test';
import { uniqueEmail, registerAndLogin } from '../helpers/auth';
import { NotesListPage } from '../pages/NotesListPage';
import { NoteEditorPage } from '../pages/NoteEditorPage';

// T-11a: create note and see it in the list
test('create note and see it in notes list', async ({ page }) => {
  await registerAndLogin(page, uniqueEmail());

  const notesList = new NotesListPage(page);
  await notesList.clickNewNote();

  const editor = new NoteEditorPage(page);
  await editor.setTitle('My CRUD Test Note');

  await editor.goBackToList();

  await expect(notesList.noteCard('My CRUD Test Note')).toBeVisible();
});

// T-11b: autosave transitions Saving… → Saved within 5 s (FRS-FE-18, FRS-FE-19)
test('autosave: status transitions Saving → Saved within 5 seconds', async ({ page }) => {
  await registerAndLogin(page, uniqueEmail());

  const notesList = new NotesListPage(page);
  await notesList.clickNewNote();

  const editor = new NoteEditorPage(page);
  await editor.setTitle('Autosave Status Test');
  await editor.typeContent('testing the autosave debounce');

  // The 2s debounce fires, then the PATCH goes out → Saving… state appears
  await expect(editor.saveStatusSaving).toBeVisible({ timeout: 3_500 });
  // After the PATCH resolves, status changes to Saved
  await expect(editor.saveStatusSaved).toBeVisible({ timeout: 5_000 });
});

// T-11c: delete with confirmation removes note from list (FRS-FE-14)
test('delete with confirm removes note from list', async ({ page }) => {
  await registerAndLogin(page, uniqueEmail());

  const notesList = new NotesListPage(page);
  await notesList.clickNewNote();

  const editor = new NoteEditorPage(page);
  await editor.setTitle('Note To Delete');
  await editor.goBackToList();

  await expect(notesList.noteCard('Note To Delete')).toBeVisible();
  await notesList.deleteNote('Note To Delete');

  await expect(notesList.noteCard('Note To Delete')).not.toBeVisible();
});
