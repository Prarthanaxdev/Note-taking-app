import type { Page } from '@playwright/test';

export const DEFAULT_PASSWORD = 'password123';

export function uniqueEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@e2e.local`;
}

export async function registerAndLogin(
  page: Page,
  email: string,
  password = DEFAULT_PASSWORD,
): Promise<void> {
  await page.goto('/register');
  await page.getByPlaceholder('you@example.com').fill(email);
  const pwFields = page.getByPlaceholder('••••••••');
  await pwFields.first().fill(password);
  await pwFields.last().fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/notes');
}
