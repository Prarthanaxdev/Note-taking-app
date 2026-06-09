import type { Page, Locator } from '@playwright/test';

export class PublicNotePage {
  constructor(private page: Page) {}

  async goto(token: string) {
    await this.page.goto(`/public/${token}`);
  }

  // Public note page renders the note title in a heading
  get title(): Locator {
    return this.page.locator('h1').first();
  }

  // Read-only TipTap content area
  get content(): Locator {
    return this.page.locator('.ProseMirror, [class*="prose"]').first();
  }

  // Should NOT be visible on the public page (no auth prompt)
  get loginLink(): Locator {
    return this.page.getByRole('link', { name: /log.?in|sign.?in/i });
  }
}
