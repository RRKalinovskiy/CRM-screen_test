import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { login } from './auth';
import { STORAGE_STATE } from './constants';

/**
 * Один раз логинится и сохраняет сессию.
 * Все тесты затем стартуют уже авторизованными (use.storageState в конфиге).
 */
export default async function globalSetup(): Promise<void> {
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    try {
      await login(page);
      await page
        .locator('.sabyPage-MainLayout__workspaceWrapper')
        .waitFor({ state: 'visible', timeout: 90_000 });
    } catch (error) {
      await page
        .screenshot({ path: 'test-results/global-setup-failure.png', fullPage: true })
        .catch(() => undefined);
      throw error;
    }

    await context.storageState({ path: STORAGE_STATE });
    console.log(`[auth] сессия сохранена: ${STORAGE_STATE}`);
  } finally {
    await browser.close();
  }
}
