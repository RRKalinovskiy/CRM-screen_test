import { test, expect, type Locator, type Page } from '@playwright/test';
import { openThemes } from './support/ui';

// На стенде test доступна одна демо-тема в группе «Продажи».
const THEME_NAME = 'Продажа товаров и услуг';

const GROUPS = ['Продажи'];

const THEME_ROWS = ['Продажа товаров и услуг'];

const COUNTERS = [
  { index: 0, status: 'В работе' },
  { index: 1, status: 'Новый, Новые' },
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

  test('Счётчик «Просроченные» открывает окно сделок', async ({ page }) => {
    test.skip(
      true,
      'Saby не разрешает срок сделки раньше текущей даты, поэтому просроченную сделку на стенде не создать',
    );
    await openThemes(page);

    const target = themeRow(page).locator('span.controls-DecoratorNumber').first();
    await expect(target).toHaveText(/^\d+$/);
    await target.click();

    const popup = themeCounterPopup(page, 'Просроченные');
    await expect(
      popup.getByText(`${THEME_NAME}, Просроченные`, { exact: true }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(popup.getByText('Сделки', { exact: true }).first()).toBeVisible();
    await popup.locator('[title="Закрыть"]').filter({ visible: true }).first().click();
  });

  for (const counter of COUNTERS) {
    test(`Счётчик «${counter.status}» открывает окно сделок`, async ({ page }) => {
      await openThemes(page);

      const counters = themeRow(page).locator('span.controls-DecoratorNumber');
      await expect(counters).toHaveCount(COUNTERS.length);
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
