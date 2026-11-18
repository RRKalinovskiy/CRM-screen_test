import { chromium, type Browser } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { login, type Credentials } from './auth';
import {
  EMPTY_LOGIN,
  EMPTY_PASSWORD,
  EMPTY_STORAGE_STATE,
  LOGIN,
  PASSWORD,
  STORAGE_STATE,
} from './constants';

type StorageStateOptions = {
  credentials: Credentials;
  path: string;
  /** Полный Chromium нужен пустому пользователю: headless-shell не проходит проверку отпечатка SSO. */
  channel?: 'chromium';
};

async function saveStorageState({ credentials, path, channel }: StorageStateOptions): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });

  const browser: Browser = await chromium.launch({
    headless: true,
    ...(channel ? { channel } : {}),
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    try {
      await login(page, credentials);
      await page
        .locator('.sabyPage-MainLayout__workspaceWrapper')
        .waitFor({ state: 'visible', timeout: 90_000 });
    } catch (error) {
      await page
        .screenshot({ path: `test-results/global-setup-failure-${channel ?? 'default'}.png`, fullPage: true })
        .catch(() => undefined);
      throw error;
    }

    await context.storageState({ path });
    console.log(`[auth] сессия сохранена: ${path}`);
  } finally {
    await browser.close();
  }
}

/**
 * Один раз логинится под каждым пользователем и сохраняет сессии.
 * Все тесты затем стартуют уже авторизованными (use.storageState в конфиге
 * или test.use в spec-файле).
 */
export default async function globalSetup(): Promise<void> {
  // CI запускает основной набор и сценарии пустого пользователя разными
  // job'ами: каждому нужна только его сессия.
  const setupMain = process.env.SABY_SETUP_MAIN !== '0';
  const setupEmpty = process.env.SABY_SETUP_EMPTY !== '0';

  if (setupMain) {
    await saveStorageState({
      credentials: { login: LOGIN, password: PASSWORD },
      path: STORAGE_STATE,
    });
  }

  if (setupEmpty) {
    await saveStorageState({
      credentials: { login: EMPTY_LOGIN, password: EMPTY_PASSWORD },
      path: EMPTY_STORAGE_STATE,
      channel: 'chromium',
    });
  }
}
