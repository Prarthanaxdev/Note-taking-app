import { test, expect } from '@playwright/test';
import { uniqueEmail, registerAndLogin } from '../helpers/auth';
import { NotesListPage } from '../pages/NotesListPage';
import { NoteEditorPage } from '../pages/NoteEditorPage';
import { SearchPage } from '../pages/SearchPage';

// T-13a: FTS returns result with <mark> headline; clicking it opens the editor (UC-SRCH-01, FRS-FE-25/26)
test('searching for note content returns highlighted result', async ({ page }) => {
  await registerAndLogin(page, uniqueEmail());

  // Unique keyword per run so we don't match notes from other test runs
  const keyword = `kwrd${Date.now()}`;

  const notesList = new NotesListPage(page);
  await notesList.clickNewNote();

  const editor = new NoteEditorPage(page);
  await editor.setTitle('FTS Search Test Note');
  await editor.typeContent(keyword);
  // Wait for autosave so the tsvector column is updated before searching
  await editor.waitForSaved();

  await notesList.goToSearch();
  const search = new SearchPage(page);
  await search.search(keyword);

  // At least one result must appear
  await expect(search.resultCards.first()).toBeVisible({ timeout: 5_000 });

  // ts_headline wraps matched term in <mark> elements (BR-SRCH-04)
  await expect(search.highlightedMark).toBeVisible();

  // Clicking the result navigates to the note editor (FRS-FE-26)
  await search.clickResult();
  await expect(page).toHaveURL(/\/notes\/.+/);
});

// T-13b: empty-state shown when no results match
test('searching for non-existent term shows empty state', async ({ page }) => {
  await registerAndLogin(page, uniqueEmail());

  const notesList = new NotesListPage(page);
  await notesList.goToSearch();

  const search = new SearchPage(page);
  await search.search('zzznoresultsxxx999');

  await expect(page.getByText(/No notes found/)).toBeVisible({ timeout: 5_000 });
});
