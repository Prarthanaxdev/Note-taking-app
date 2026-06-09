import type { Page } from '@playwright/test';

export class RegisterPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/register');
  }

  async fill(email: string, password: string) {
    await this.page.getByPlaceholder('you@example.com').fill(email);
    const pwFields = this.page.getByPlaceholder('••••••••');
    await pwFields.first().fill(password);
    await pwFields.last().fill(password);
  }

  async submit() {
    await this.page.getByRole('button', { name: 'Create account' }).click();
  }
}
