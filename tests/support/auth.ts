import type { Page } from '@playwright/test';
import { AUTH_URL, LOGIN, PASSWORD } from './constants';

export type Credentials = {
  login: string;
  password: string;
};

/**
 * Вход в Saby через SSO.
 *
 * На странице входа несколько controls-BaseButton (включая скрытые),
 * поэтому логин отправляем клавишей Enter, а пароль — кнопкой входа:
 * в SSO-форме Enter на шаге пароля не всегда запускает отправку.
 * После успешного входа Saby уводит на fix-online.sbis.ru.
 */
export async function login(
  page: Page,
  credentials: Credentials = { login: LOGIN, password: PASSWORD },
): Promise<void> {
  console.log(`[auth] вход: ${credentials.login}`);
  await page.goto(AUTH_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });

  const loginInput = page.getByRole('textbox').first();
  await loginInput.waitFor({ state: 'visible', timeout: 60_000 });
  await loginInput.click();
  await loginInput.fill(credentials.login);
  // Форма Saby обрабатывает ввод с задержкой: без паузы Enter может уйти
  // до того, как кнопка входа станет активной.
  await page.waitForTimeout(500);
  await loginInput.press('Enter');

  const passwordInput = page.locator('input[type="password"]:visible').first();
  await passwordInput.waitFor({ state: 'visible', timeout: 60_000 });
  await passwordInput.click();
  await passwordInput.fill(credentials.password);
  await page.waitForTimeout(300);

  const signIn = page.locator('[data-qa="auth-AdaptiveLoginForm__signInButton"]').first();
  await signIn.click();
  console.log('[auth] пароль отправлен, ждём рабочую область');

  await page.waitForURL((url) => url.hostname === 'fix-online.sbis.ru', { timeout: 90_000 });
  console.log(`[auth] после входа: ${page.url()}`);
}
