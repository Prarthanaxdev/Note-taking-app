import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async fill(email: string, password: string) {
    await this.page.getByPlaceholder('you@example.com').fill(email);
    await this.page.getByPlaceholder('••••••••').fill(password);
  }

  async submit() {
    await this.page.getByRole('button', { name: 'Sign in' }).click();
  }
}
