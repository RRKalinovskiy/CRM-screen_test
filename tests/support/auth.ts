import type { Page } from '@playwright/test';
import { AUTH_URL, LOGIN, PASSWORD } from './constants';

/**
 * Вход в Saby через SSO.
 *
 * На странице входа несколько controls-BaseButton (включая скрытые),
 * поэтому надёжнее отправлять форму клавишей Enter, а не искать кнопку
 * по классу и порядку в DOM.
 */
export async function login(page: Page): Promise<void> {
  await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });

  const loginInput = page.getByRole('textbox').first();
  await loginInput.waitFor({ state: 'visible', timeout: 60_000 });
  await loginInput.click();
  await loginInput.fill(LOGIN);
  // Форма Saby обрабатывает ввод с задержкой: без паузы Enter может уйти
  // до того, как кнопка входа станет активной.
  await page.waitForTimeout(500);
  await loginInput.press('Enter');

  const passwordInput = page.locator('input[type="password"]');
  await passwordInput.waitFor({ state: 'visible', timeout: 60_000 });
  await passwordInput.fill(PASSWORD);
  await passwordInput.press('Enter');

  await page.waitForURL(/fix-online\.sbis\.ru/, { timeout: 90_000 });
}
