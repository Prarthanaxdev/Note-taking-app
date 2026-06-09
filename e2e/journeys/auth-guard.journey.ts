import { test, expect } from '@playwright/test';
import { uniqueEmail, registerAndLogin } from '../helpers/auth';
import { NoteEditorPage } from '../pages/NoteEditorPage';
import { NotesListPage } from '../pages/NotesListPage';
import { PublicNotePage } from '../pages/PublicNotePage';

// T-10a: unauthenticated /notes → /login
test('unauthenticated /notes redirects to /login', async ({ browser }) => {
  // Fresh context with no cookies or storage
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto('http://localhost:5173/notes');
  await expect(page).toHaveURL(/\/login/);

  await ctx.close();
});

// T-10b: public note page renders without authentication
test('public note page renders without authentication', async ({ page, browser }) => {
  const email = uniqueEmail();
  await registerAndLogin(page, email);

  // Create a note
  const notesList = new NotesListPage(page);
  await notesList.clickNewNote();
  const editor = new NoteEditorPage(page);
  await editor.setTitle('Public Auth Guard Test');
  await editor.waitForSaved();

  // Generate a share link via the Share modal
  await editor.openShareModal();
  await page.getByRole('button', { name: 'Generate' }).click();
  // Wait for the link row to appear
  await expect(page.getByText('Copy URL')).toBeVisible({ timeout: 5_000 });

  // Copy the URL to clipboard and read it
  await page.getByRole('button', { name: 'Copy URL' }).click();
  const publicUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(publicUrl).toMatch(/\/public\//);

  // Open the URL in an anonymous (unauthenticated) browser context
  const anonCtx = await browser.newContext();
  const anonPage = await anonCtx.newPage();
  const publicPage = new PublicNotePage(anonPage);

  await anonPage.goto(publicUrl);
  await expect(publicPage.title).toBeVisible({ timeout: 5_000 });
  await expect(publicPage.loginLink).not.toBeVisible();

  await anonCtx.close();
});
