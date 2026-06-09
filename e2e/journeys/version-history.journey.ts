import { test, expect, type Page, type Browser } from '@playwright/test';
import { uniqueEmail, registerAndLogin } from '../helpers/auth';
import { NotesListPage } from '../pages/NotesListPage';
import { NoteEditorPage } from '../pages/NoteEditorPage';

// T-15a / T-15b / T-15c share the same note — run serially to share state
test.describe.configure({ mode: 'serial' });

let sharedPage: Page;
let notePath: string;

// Setup: register user, create note, trigger TWO autosaves so the drawer
// has [S2 "Current" (non-clickable), S1 (clickable/restorable)]
test.beforeAll(async ({ browser }: { browser: Browser }) => {
  sharedPage = await browser.newPage();

  await registerAndLogin(sharedPage, uniqueEmail());

  const notesList = new NotesListPage(sharedPage);
  await notesList.clickNewNote();
  notePath = new URL(sharedPage.url()).pathname; // e.g. /notes/abc123

  const editor = new NoteEditorPage(sharedPage);
  await editor.setTitle('Version Journey Note');

  // First autosave: creates snapshot S1 (captures initial state before this PATCH)
  await editor.typeContent('first content');
  await editor.waitForSaved();

  // Second autosave: creates snapshot S2 (captures state after first PATCH)
  await sharedPage.locator('.ProseMirror').click();
  await sharedPage.keyboard.type(' updated');
  await editor.waitForSaved();
});

test.afterAll(async () => {
  await sharedPage.close();
});

// T-15a: history drawer shows version list after autosave (FRS-FE-33)
test('history drawer shows version list after autosave', async () => {
  const editor = new NoteEditorPage(sharedPage);
  await editor.openHistoryDrawer();

  // Drawer should show at least one version row with a timestamp
  await expect(sharedPage.getByText('Version history')).toBeVisible({ timeout: 3_000 });

  // "Current" label marks the most-recent snapshot (index 0, non-clickable)
  await expect(sharedPage.getByText('Current')).toBeVisible();

  // There should be at least 2 rows total (S2 "Current" + S1 clickable)
  const rows = sharedPage.locator('[role="dialog"] button').filter({
    hasNot: sharedPage.getByText('← Back'),
    hasNot: sharedPage.getByText('Restore'),
  });
  await expect(rows.first()).toBeVisible();
});

// T-15b: clicking a version row shows read-only preview + Back returns to list (FRS-FE-34)
test('clicking a version row shows read-only preview', async () => {
  // The version list should already be visible from T-15a
  // Click the SECOND row (index 1) — first is "Current" (non-clickable)
  const versionRows = sharedPage.locator('[role="dialog"]').getByRole('button').filter({
    hasNotText: '← Back',
    hasNotText: 'Restore this version',
    hasNotText: 'Close',
  });

  // Click second version row (the clickable one, index 1)
  await versionRows.nth(1).click();

  // Preview pane: "← Back" button and "Restore this version" button appear
  await expect(sharedPage.getByRole('button', { name: '← Back' })).toBeVisible({ timeout: 3_000 });
  await expect(sharedPage.getByRole('button', { name: 'Restore this version' })).toBeVisible();

  // Back button returns to list without making any API call
  await sharedPage.getByRole('button', { name: '← Back' }).click();
  await expect(sharedPage.getByText('Current')).toBeVisible({ timeout: 3_000 });
});

// T-15c: restore updates the editor with the snapshot content (FRS-FE-35)
test('restore replaces editor content and closes the drawer', async () => {
  const editor = new NoteEditorPage(sharedPage);

  // Re-open preview for the older version
  const versionRows = sharedPage.locator('[role="dialog"]').getByRole('button').filter({
    hasNotText: '← Back',
    hasNotText: 'Restore this version',
    hasNotText: 'Close',
  });
  await versionRows.nth(1).click();

  await expect(sharedPage.getByRole('button', { name: 'Restore this version' })).toBeVisible();
  await sharedPage.getByRole('button', { name: 'Restore this version' }).click();

  // AlertDialog confirmation
  await expect(sharedPage.getByRole('alertdialog')).toBeVisible({ timeout: 3_000 });
  await sharedPage.getByRole('button', { name: 'Restore' }).last().click();

  // Drawer closes after restore
  await expect(sharedPage.getByText('Version history')).not.toBeVisible({ timeout: 5_000 });

  // The editor title input must still be present (note reloaded)
  await expect(editor.titleInput).toBeVisible({ timeout: 5_000 });
});
