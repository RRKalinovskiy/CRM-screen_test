import { test, expect } from '@playwright/test';
import { AUTH_URL } from './support/constants';

// Проверяем именно неавторизованное состояние — storageState здесь не нужен.
test.use({ storageState: { cookies: [], origins: [] } });

test('Страница входа Saby открывается', async ({ page }) => {
  await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });

  await expect(page.getByRole('textbox').first()).toBeVisible();
  await expect(page).toHaveTitle(/Saby/i);
});
