import { defineConfig, devices } from '@playwright/test';
import { APP_ORIGIN, STORAGE_STATE } from './tests/support/constants';

/**
 * Визуальные тесты Saby CRM.
 *
 * Эталоны сняты для Chromium/Windows. Для Firefox/WebKit нужны отдельные
 * baseline-файлы, поэтому в проекте оставлен один браузер.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,
  timeout: 60_000,
  // В CI дополнительно включаем github-reporter: ошибки попадают
  // в аннотации GitHub Actions, а не только в HTML-отчёт.
  reporter: process.env.CI
    ? [['list'], ['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  globalSetup: './tests/support/global-setup.ts',

  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixelRatio: 0.002,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    },
  },

  use: {
    baseURL: APP_ORIGIN,
    storageState: STORAGE_STATE,
    viewport: { width: 1280, height: 720 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    ignoreHTTPSErrors: true,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
