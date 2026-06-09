import { test, expect } from '@playwright/test';
import { uniqueEmail, registerAndLogin } from '../helpers/auth';
import { NotesListPage } from '../pages/NotesListPage';
import { NoteEditorPage } from '../pages/NoteEditorPage';
import { PublicNotePage } from '../pages/PublicNotePage';

// T-14a: copy URL button changes to "Copied" confirmation (FRS-FE-31)
// T-14b: public URL renders note in anonymous browser context (UC-SHARE-02)
//
// These two tests share the same share link so they run as a describe to share state.
test.describe('share link', () => {
  test('copy URL shows Copied confirmation and public page renders without auth', async ({
    page,
    browser,
  }) => {
    await registerAndLogin(page, uniqueEmail());

    // Create a note
    const notesList = new NotesListPage(page);
    await notesList.clickNewNote();
    const editor = new NoteEditorPage(page);
    await editor.setTitle('Shareable Note');
    await editor.waitForSaved();

    // Open share modal and generate a link
    await editor.openShareModal();
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByRole('button', { name: 'Copy URL' })).toBeVisible({ timeout: 5_000 });

    // T-14a: click Copy URL — button text changes to confirm copy (FRS-FE-31)
    await page.getByRole('button', { name: 'Copy URL' }).click();
    await expect(page.getByRole('button', { name: /Copied/ })).toBeVisible({ timeout: 3_000 });

    // Read the copied URL from clipboard
    const publicUrl = await page.evaluate(() => navigator.clipboard.readText());
    expect(publicUrl).toMatch(/\/public\//);

    // T-14b: open in anonymous context — public page renders without auth prompt (UC-SHARE-02)
    const anonCtx = await browser.newContext();
    const anonPage = await anonCtx.newPage();
    const publicPage = new PublicNotePage(anonPage);

    await anonPage.goto(publicUrl);
    await expect(publicPage.title).toBeVisible({ timeout: 5_000 });
    // No login/sign-in link should appear on the public note page
    await expect(publicPage.loginLink).not.toBeVisible();

    await anonCtx.close();
  });
});
