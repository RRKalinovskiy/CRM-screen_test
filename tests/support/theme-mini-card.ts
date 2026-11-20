import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { DEALS_URL } from './constants';
import { dismissNotifications, openWorkspace, THEME_SECTION_MARKERS } from './ui';

/**
 * Карточка темы и её мини-карточка в реестре «Сделки».
 *
 * В интерфейсе Saby есть два разных представления:
 * 1. Карточка создания/редактирования темы из Канбана сделок:
 *    «Сделки» → (+) → пустая карточка темы;
 *    заполненная карточка открывается из доски темы → «Редактировать тему».
 * 2. Компактная карточка выбора темы в шапке сделки:
 *    карточка сделки → клик по названию темы → список тем и «Сменить тему».
 */

export const THEME_NAME = 'Продажа товаров и услуг';

export const themeCard = (page: Page): Locator =>
  page.locator('.controls-Popup:has([data-qa="crm_Theme__header"])').last();

export const themeNameInput = (page: Page): Locator =>
  themeCard(page).locator('[data-qa="crm_Theme__header"] input').first();

export const themeSelector = (page: Page): Locator =>
  page.locator('.controls-Popup:has([data-qa="edo3-RegulationMiniCard__caption"])').last();

/** Открывает реестр сделок в режиме Канбан и снимает восстановленную доску темы. */
export async function openDealsKanban(page: Page): Promise<void> {
  console.log('[theme] открываю реестр сделок');
  await openWorkspace(page, DEALS_URL);

  // Saby может восстановить последнюю открытую доску темы.
  const back = page.locator('.sabyPage-MainLayout__backButton').filter({ visible: true }).first();
  if (await back.isVisible().catch(() => false)) {
    console.log('[theme] возвращаюсь из доски темы в Канбан');
    await back.click();
    await page.waitForTimeout(1_000);
  }

  await expect(
    page.locator('[data-qa="item"]').filter({ hasText: THEME_NAME }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

/** Создаёт черновик темы через (+) в Канбане сделок и ждёт загрузки пустой карточки. */
export async function openEmptyThemeCardFromKanban(page: Page): Promise<Locator> {
  await openDealsKanban(page);
  console.log('[theme] открываю пустую карточку темы через (+)');
  await page.locator('[data-qa="sabyPage-addButton"]').first().click();

  const card = themeCard(page);
  await expect(card).toBeVisible({ timeout: 30_000 });
  // Признак пустой воронки: подсказка появляется после загрузки секции.
  await expect(card.getByText('Настройте свою воронку продаж', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  return card;
}

/** Открывает доску темы из Канбана сделок. */
export async function openThemeBoard(page: Page, themeName = THEME_NAME): Promise<void> {
  await openDealsKanban(page);
  console.log(`[theme] открываю доску темы «${themeName}»`);
  await page.locator('[data-qa="item"]').filter({ hasText: themeName }).first().click();
  await expect(page.getByTitle('Редактировать тему').filter({ visible: true })).toBeVisible({
    timeout: 30_000,
  });
}

/** Открывает заполненную карточку темы из доски темы (реестр сделок). */
export async function openFilledThemeCardFromBoard(
  page: Page,
  themeName = THEME_NAME,
): Promise<Locator> {
  await openThemeBoard(page, themeName);
  console.log('[theme] открываю заполненную карточку через «Редактировать тему»');
  await page.getByTitle('Редактировать тему').filter({ visible: true }).first().click();

  const card = themeCard(page);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(themeNameInput(page)).toHaveValue(themeName);
  return card;
}

/** Открывает документ сделки из доски темы. */
export async function openDealCardFromThemeBoard(page: Page): Promise<void> {
  const dealNumber = page.locator('[data-qa="edoWidgets-Number"]').filter({ visible: true }).first();
  await expect(dealNumber).toBeVisible({ timeout: 30_000 });
  console.log('[theme] открываю документ сделки');
  await dealNumber.click();
  await expect(page.locator('.edo3-DocumentName').filter({ visible: true })).toBeVisible({
    timeout: 30_000,
  });
}

/** Открывает компактную карточку выбора темы в шапке документа сделки. */
export async function openThemeSelectorFromDeal(
  page: Page,
  themeName = THEME_NAME,
): Promise<Locator> {
  const dealTheme = page
    .locator('.edo3-DocumentName')
    .getByText(themeName, { exact: true })
    .first();
  await expect(dealTheme).toBeVisible({ timeout: 30_000 });

  console.log('[theme] открываю мини-карточку темы в шапке сделки');
  await dealTheme.click();

  const selector = themeSelector(page);
  await expect(selector).toBeVisible({ timeout: 30_000 });
  await expect(selector.getByText('Сменить тему', { exact: true })).toBeVisible();
  return selector;
}

/** Закрывает карточку темы без сохранения. */
export async function cancelThemeCard(page: Page, card = themeCard(page)): Promise<void> {
  const cancel = card.getByText('Отменить', { exact: true }).filter({ visible: true }).first();
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click();
    await page.waitForTimeout(500);
  }

  // После «Отменить» заполненная карточка может остаться в режиме просмотра.
  if (await card.isVisible().catch(() => false)) {
    const close = card.locator('[data-qa="controls-stack-Button__close"]').filter({ visible: true }).first();
    if (await close.count()) await close.click();
    else await page.keyboard.press('Escape');
  }

  await expect(card).toBeHidden({ timeout: 30_000 });
}

/** Закрывает компактную карточку выбора темы. */
export async function closeThemeSelector(page: Page, selector = themeSelector(page)): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(selector).toBeHidden({ timeout: 30_000 });
}

/** Все вкладки карточки темы в порядке интерфейса. */
export const THEME_CARD_SECTIONS = Object.keys(THEME_SECTION_MARKERS);

/** Открывает вкладку карточки темы и ждёт её характерный маркер. */
export async function openThemeCardSection(root: Locator, section: string): Promise<void> {
  const marker = THEME_SECTION_MARKERS[section];
  if (!marker) {
    throw new Error(`Не задан маркер загрузки для вкладки темы: ${section}`);
  }

  const label = root.getByText(section, { exact: true }).filter({ visible: true }).first();
  await expect(label).toBeVisible({ timeout: 30_000 });
  await label.click();

  const markerLocator =
    typeof marker === 'string' ? root.getByText(marker, { exact: true }) : root.getByText(marker);
  await expect(markerLocator.first()).toBeVisible({ timeout: 30_000 });
}

/** Копирует ссылку на открытую карточку темы. */
export async function copyThemeCardLink(page: Page, card = themeCard(page)): Promise<string> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText(''));

  console.log('[theme] копирую ссылку на карточку темы');
  const copy = card.getByTitle('Скопировать ссылку').filter({ visible: true }).first();
  await expect(copy).toBeVisible();
  await copy.click();

  const readClipboard = async (): Promise<string> =>
    (await page.evaluate(() => navigator.clipboard.readText())).trim();

  await expect
    .poll(readClipboard, {
      timeout: 10_000,
      message: 'Ссылка на карточку темы не скопировалась в буфер обмена',
    })
    .not.toBe('');

  const link = await readClipboard();
  console.log(`[theme] ссылка в буфере: ${link}`);
  return link;
}

/** Открывает карточку темы из реестра сделок и копирует её ссылку. */
export async function copyThemeCardLinkFromDeals(page: Page): Promise<string> {
  const card = await openFilledThemeCardFromBoard(page, THEME_NAME);
  const link = await copyThemeCardLink(page, card);
  await cancelThemeCard(page, card);
  return link;
}

/** Открывает скопированную ссылку на карточку темы в новой вкладке. */
export async function openThemeCardByLink(
  context: BrowserContext,
  link: string,
): Promise<Page> {
  console.log(`[theme] открываю карточку темы по ссылке: ${link}`);
  const page = await context.newPage();
  await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await expect(page.locator('.sabyPage-MainLayout__workspaceWrapper')).toBeVisible({
    timeout: 90_000,
  });
  await dismissNotifications(page);
  await expect(page.locator('[data-qa="crm_Theme__header"]')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(THEME_NAME, { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  return page;
}

