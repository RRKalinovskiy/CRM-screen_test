import { test, expect } from '@playwright/test';
import { APP_ORIGIN, STORAGE_STATE } from './support/constants';
import {
  copyThemeCardLinkFromDeals,
  openThemeCardByLink,
  openThemeCardSection,
  THEME_CARD_SECTIONS,
  THEME_NAME,
} from './support/theme-mini-card';

/**
 * Карточка темы, открытая по ссылке в отдельном окне.
 *
 * Ссылка копируется из живой карточки темы в реестре сделок, а затем
 * открывается в новой вкладке. Каждая вкладка карточки проверяется
 * отдельным тестом, чтобы падение одной не скрывало состояние остальных.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Карточка темы по ссылке в отдельном окне', { tag: '@theme-card' }, () => {
  let themeLink = '';

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);

    const context = await browser.newContext({
      storageState: STORAGE_STATE,
      baseURL: APP_ORIGIN,
      viewport: { width: 1280, height: 720 },
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    try {
      themeLink = await copyThemeCardLinkFromDeals(page);
    } finally {
      await context.close();
    }

    expect(themeLink).toContain('/page/crm-subjects-card?');
  });

  test('Карточка темы открывается по ссылке и содержит все разделы', async ({ context }) => {
    test.setTimeout(180_000);

    const page = await openThemeCardByLink(context, themeLink);
    try {
      await expect(page.getByText(THEME_NAME, { exact: true }).first()).toBeVisible();
      await expect(page.getByTitle('Изменить').first()).toBeVisible();

      for (const section of THEME_CARD_SECTIONS) {
        await expect(
          page.getByText(section, { exact: true }).filter({ visible: true }).first(),
        ).toBeVisible();
      }
    } finally {
      await page.close();
    }
  });

  for (const section of THEME_CARD_SECTIONS) {
    test(`Вкладка «${section}» по ссылке в отдельном окне`, async ({ context }) => {
      test.setTimeout(180_000);

      const page = await openThemeCardByLink(context, themeLink);
      try {
        await openThemeCardSection(page.locator('body'), section);
      } finally {
        await page.close();
      }
    });
  }
});
