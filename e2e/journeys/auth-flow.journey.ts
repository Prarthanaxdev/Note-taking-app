import { test, expect } from '@playwright/test';
import { uniqueEmail, DEFAULT_PASSWORD, registerAndLogin } from '../helpers/auth';
import { RegisterPage } from '../pages/RegisterPage';
import { LoginPage } from '../pages/LoginPage';
import { NotesListPage } from '../pages/NotesListPage';

// T-09a: register → /notes
test('register: new user lands on /notes', async ({ page }) => {
  const email = uniqueEmail();
  const register = new RegisterPage(page);

  await register.goto();
  await register.fill(email, DEFAULT_PASSWORD);
  await register.submit();

  await expect(page).toHaveURL(/\/notes/);

  // Access token MUST NOT be persisted to localStorage (XSS prevention — SDS §8.2)
  const stored = await page.evaluate(() => localStorage.getItem('accessToken'));
  expect(stored).toBeNull();
});

// T-09b: login → /notes
test('login: existing user lands on /notes', async ({ page }) => {
  const email = uniqueEmail();

  // Register the user first, then logout so we can test the login flow
  await registerAndLogin(page, email);
  const notesList = new NotesListPage(page);
  await notesList.logout();

  const loginPage = new LoginPage(page);
  await loginPage.fill(email, DEFAULT_PASSWORD);
  await loginPage.submit();

  await expect(page).toHaveURL(/\/notes/);
});

// T-09c: logout → session cleared → /notes redirects to /login
test('logout: session is cleared and /notes is protected', async ({ page }) => {
  const email = uniqueEmail();
  await registerAndLogin(page, email);

  const notesList = new NotesListPage(page);
  await notesList.logout();

  await expect(page).toHaveURL(/\/login/);

  // Trying to access /notes without a session must redirect back to /login
  await page.goto('/notes');
  await expect(page).toHaveURL(/\/login/);
});
