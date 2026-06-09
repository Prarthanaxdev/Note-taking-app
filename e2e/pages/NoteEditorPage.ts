import type { Page } from '@playwright/test';

export class NoteEditorPage {
  constructor(private page: Page) {}

  get titleInput() {
    return this.page.getByLabel('Note title');
  }

  // TipTap renders a .ProseMirror contenteditable div
  get editor() {
    return this.page.locator('.ProseMirror');
  }

  get saveStatusSaved() {
    return this.page.getByText('Saved');
  }

  get saveStatusSaving() {
    return this.page.getByText('Saving…');
  }

  get shareButton() {
    return this.page.getByRole('button', { name: 'Share' });
  }

  get historyButton() {
    return this.page.getByRole('button', { name: 'History' });
  }

  // shadcn Combobox trigger for tag assignment
  get tagCombobox() {
    return this.page.getByRole('combobox');
  }

  async setTitle(title: string) {
    await this.titleInput.clear();
    await this.titleInput.fill(title);
  }

  async typeContent(text: string) {
    await this.editor.click();
    await this.page.keyboard.type(text);
  }

  async waitForSaved(timeout = 6_000) {
    await this.saveStatusSaved.waitFor({ state: 'visible', timeout });
  }

  async openShareModal() {
    await this.shareButton.click();
  }

  async openHistoryDrawer() {
    await this.historyButton.click();
  }

  async goBackToList() {
    await this.page.getByRole('link', { name: 'Notes' }).click();
    await this.page.waitForURL('**/notes');
  }

  // Opens the tag combobox, types tagName, then clicks the first matching option
  // Works for both existing tags and the "Create ..." option
  async addTag(tagName: string) {
    await this.tagCombobox.click();
    await this.page.getByPlaceholder('Search tags…').fill(tagName);
    // Click first option that includes the tag name (either existing or "Create …")
    await this.page.getByRole('option').filter({ hasText: tagName }).first().click();
  }
}
