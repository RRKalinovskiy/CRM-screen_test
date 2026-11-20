import { test, expect } from '@playwright/test';
import {
  cancelThemeCard,
  closeThemeSelector,
  openDealCardFromThemeBoard,
  openEmptyThemeCardFromKanban,
  openFilledThemeCardFromBoard,
  openThemeBoard,
  openThemeCardSection,
  openThemeSelectorFromDeal,
  themeNameInput,
  THEME_CARD_SECTIONS,
  THEME_NAME,
} from './support/theme-mini-card';

/**
 * Карточка темы из реестра «Сделки».
 *
 * Покрываются два входа в карточку темы:
 * - Канбан сделок → (+) → пустая карточка создания темы;
 * - карточка сделки → название темы в шапке → компактная карточка выбора темы.
 * Отдельно проверяется заполненная карточка темы, открытая из доски темы
 * через «Редактировать тему». Все проверки только читают/открывают карточки,
 * черновик создания темы закрывается без сохранения.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Карточка темы из реестра сделок', { tag: '@theme-card' }, () => {
  test('Пустая карточка темы открывается из (+) в Канбане сделок', async ({ page }) => {
    test.setTimeout(180_000);

    const card = await openEmptyThemeCardFromKanban(page);
    await expect(themeNameInput(page)).toHaveValue('');
    await expect(
      card.getByText('Настройте свою воронку продаж', { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByText('Новый', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(card.getByText('Воронка продаж', { exact: true }).first()).toBeVisible();
    await expect(card.getByText('Инструкция', { exact: true }).first()).toBeVisible();
    await expect(card.locator('[data-qa="crm_Theme__card__saveButton"]')).toBeVisible();

    await cancelThemeCard(page, card);
    await expect(
      page.locator('[data-qa="item"]').filter({ hasText: THEME_NAME }).first(),
    ).toBeVisible();
  });

  test('Мини-карточка темы в шапке сделки показывает текущую тему и список тем', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await openThemeBoard(page, THEME_NAME);
    await openDealCardFromThemeBoard(page);
    const selector = await openThemeSelectorFromDeal(page, THEME_NAME);

    await expect(selector.getByText('Сменить тему', { exact: true })).toBeVisible();
    await expect(selector.getByText(THEME_NAME, { exact: true }).first()).toBeVisible();
    await expect(selector.getByText('Проверка СПК', { exact: true }).first()).toBeVisible();
    await expect(selector.getByText('Продажа товаров и услуг', { exact: true }).first()).toBeVisible();
    await expect(selector.getByTitle('Перейти в подробную карточку').first()).toBeVisible();

    await closeThemeSelector(page, selector);
    await expect(page.locator('.edo3-DocumentName')).toContainText(THEME_NAME);
  });

  test('Заполненная карточка темы открывается из реестра сделок', async ({ page }) => {
    test.setTimeout(180_000);

    const card = await openFilledThemeCardFromBoard(page, THEME_NAME);
    await expect(themeNameInput(page)).toHaveValue(THEME_NAME);
    await expect(card.locator('[data-qa="crm_Theme__funnel"]')).toBeVisible();
    for (const stage of ['Новый', 'Знакомство', 'Отгрузка']) {
      await expect(
        card.getByText(stage, { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
    }
    await expect(card.getByText('Итоги', { exact: true }).first()).toBeVisible();

    await cancelThemeCard(page, card);
  });

  for (const section of THEME_CARD_SECTIONS) {
    test(`Вкладка «${section}» в заполненной карточке темы`, async ({ page }) => {
      test.setTimeout(180_000);

      const card = await openFilledThemeCardFromBoard(page, THEME_NAME);
      await expect(themeNameInput(page)).toHaveValue(THEME_NAME);
      await openThemeCardSection(card, section);

      await cancelThemeCard(page, card);
    });
  }
});
