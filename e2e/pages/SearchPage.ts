import type { Page, Locator } from '@playwright/test';

export class SearchPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/search');
  }

  get searchInput(): Locator {
    return this.page.getByPlaceholder('Search notes…');
  }

  get resultCards(): Locator {
    return this.page.locator('[role="button"]').filter({
      has: this.page.locator('h3'),
    });
  }

  // PostgreSQL ts_headline wraps matched terms in <mark> elements
  get highlightedMark(): Locator {
    return this.page.locator('mark').first();
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.keyboard.press('Enter');
  }

  async clickResult(index = 0) {
    await this.resultCards.nth(index).click();
    await this.page.waitForURL('**/notes/**');
  }
}
