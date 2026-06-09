import type { Page, Locator } from '@playwright/test';

export class NotesListPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/notes');
  }

  async clickNewNote() {
    await this.page.getByRole('button', { name: 'New Note' }).click();
    await this.page.waitForURL('**/notes/**');
  }

  async logout() {
    // User avatar circle in AppShell sidebar opens a dropdown menu
    await this.page.locator('div.rounded-full').click();
    await this.page.getByRole('menuitem', { name: 'Logout' }).click();
    await this.page.waitForURL('**/login');
  }

  async goToSearch() {
    await this.page.getByRole('link', { name: 'Search' }).click();
    await this.page.waitForURL('**/search');
  }

  // Note cards are <div role="button"> containing an <h3> title
  noteCard(title: string): Locator {
    return this.page.locator('[role="button"]').filter({ hasText: title }).first();
  }

  async clickNote(title: string) {
    await this.noteCard(title).click();
    await this.page.waitForURL('**/notes/**');
  }

  async deleteNote(title: string) {
    const card = this.noteCard(title);
    await card.hover();
    await card.getByRole('button', { name: 'Delete note' }).click();
    // AlertDialog has a "Delete" button — use last() since the trigger label may also say "Delete"
    await this.page.getByRole('button', { name: 'Delete' }).last().click();
  }

  async filterByTag(tagName: string) {
    // Tag filter sidebar: each tag is a <label> wrapping a checkbox + tag name
    await this.page.locator('label').filter({ hasText: tagName }).click();
  }

  async clearTagFilter(tagName: string) {
    await this.page.locator('label').filter({ hasText: tagName }).click();
  }

  async noteCount(): Promise<number> {
    return this.page
      .locator('[role="button"]')
      .filter({ has: this.page.locator('h3') })
      .count();
  }
}
