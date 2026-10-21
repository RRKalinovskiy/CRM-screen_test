import { test, expect, type Locator, type Page } from '@playwright/test';
import { openThemes } from './support/ui';

const THEME_NAME = 'Тема для статистики';

const GROUPS = ['Продажи', 'Аудит', 'Обслуживание'];

const THEME_ROWS = [
  'Продажа товаров и услуг',
  THEME_NAME,
  'Папка в продажах',
  'Целевые клиенты',
  'Папка в аудит',
  'Самые дорогие клиенты',
  'Папка в обслуживание',
];

const COUNTERS = [
  { index: 0, status: 'Просроченные' },
  { index: 1, status: 'В работе' },
  { index: 2, status: 'Новый, Новые' },
];

const themeRow = (page: Page): Locator =>
  page
    .locator('.controls-GridReact__row')
    .filter({ hasText: THEME_NAME })
    .filter({ visible: true })
    .first();

const themeCounterPopup = (page: Page, status: string): Locator =>
  page
    .locator('.controls-StackTemplate')
    .filter({ hasText: `${THEME_NAME}, ${status}` })
    .last();

test.describe('Реестр «Темы»', () => {
  test('Группы, строки тем и колонки счётчиков', async ({ page }) => {
    await openThemes(page);

    await expect(page.getByRole('link', { name: 'Темы', exact: true })).toHaveClass(
      /controls-Tabs__item_view_selected/,
    );

    for (const group of GROUPS) {
      await expect(
        page.getByText(group, { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
    }
    for (const row of THEME_ROWS) {
      await expect(
        page.getByText(row, { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
    }
    for (const column of ['Просроченные', 'В работе', 'Новые']) {
      await expect(page.getByTitle(column).filter({ visible: true }).first()).toBeVisible();
    }

    const counters = themeRow(page).locator('span.controls-DecoratorNumber');
    await expect(counters).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(counters.nth(i)).toHaveText(/^\d+$/);
    }

    const dealsCounter = page
      .locator('.NavigationPanels-Counter__tabs_counter')
      .filter({ visible: true })
      .first();
    await expect(dealsCounter).toHaveAttribute('title', /\d+ новых\. Всего \d+/);
  });

  test('Из реестра открывается карточка темы', async ({ page }) => {
    await openThemes(page);

    await page.getByText(THEME_NAME, { exact: true }).filter({ visible: true }).first().click();

    await expect(page).toHaveURL(/\/page\/crm-subjects-edit/);
    await expect(
      page.getByText('Воронка продаж', { exact: true }).filter({ visible: true }).last(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText('Этапы', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
  });

  for (const counter of COUNTERS) {
    test(`Счётчик «${counter.status}» открывает окно сделок`, async ({ page }) => {
      await openThemes(page);

      const counters = themeRow(page).locator('span.controls-DecoratorNumber');
      await expect(counters).toHaveCount(3);
      const target = counters.nth(counter.index);
      await expect(target).toHaveText(/^\d+$/);

      await target.click();

      const popup = themeCounterPopup(page, counter.status);
      await expect(
        popup.getByText(`${THEME_NAME}, ${counter.status}`, { exact: true }).first(),
      ).toBeVisible({ timeout: 15_000 });
      await expect(popup.getByText('Сделки', { exact: true }).first()).toBeVisible();
      await expect(
        popup.locator('.controls-GridReact__row').filter({ visible: true }).first(),
      ).toBeVisible();

      await popup.locator('[title="Закрыть"]').filter({ visible: true }).first().click();
      await expect(
        page
          .getByText(`${THEME_NAME}, ${counter.status}`, { exact: true })
          .filter({ visible: true }),
      ).toBeHidden();
    });
  }
});
