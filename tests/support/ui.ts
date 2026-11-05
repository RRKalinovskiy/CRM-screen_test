import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login } from './auth';
import { CONTACTS_URL, LOANS_URL, THEME_URL, THEMES_URL } from './constants';

export const workspace = (page: Page): Locator =>
  page.locator('.sabyPage-MainLayout__workspaceWrapper');

export const cardBody = (page: Page): Locator =>
  page.locator('.sabyPage-EntityLayoutNew__bodyContent');

export const miniCard = (page: Page): Locator =>
  page.locator('.PersonCard-MiniCard__container');

export const miniCardDialog = (page: Page): Locator =>
  page.locator('.PersonCard-MiniCard__dialog');

/**
 * Навигация с повтором для редкой ошибки Chromium
 * «ERR_NO_BUFFER_SPACE», которая появляется при нескольких воркерах
 * на CI. Повторяем только эту ошибку, остальные пробрасываем сразу.
 */
export async function gotoWithRetry(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  } catch (error) {
    if (!String(error).includes('ERR_NO_BUFFER_SPACE')) throw error;
    console.warn('[ui] ERR_NO_BUFFER_SPACE, повторяю навигацию');
    await page.waitForTimeout(1_000);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  }
}

export async function openWorkspace(page: Page, url: string): Promise<void> {
  console.log(`[ui] открываю: ${url}`);
  await gotoWithRetry(page, url);
  console.log(`[ui] URL после навигации: ${page.url()}`);

  // Сессия могла истечь во время длинного прогона — повторно логинимся.
  if (page.url().includes('fix-sso.saby.ru')) {
    console.warn('[ui] сессия истекла, повторный вход');
    await login(page);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    console.log(`[ui] URL после повторного входа: ${page.url()}`);
  }

  await expect(workspace(page)).toBeVisible({ timeout: 90_000 });
  console.log(`[ui] рабочая область открыта: ${page.url()}`);
  await dismissNotifications(page);
}

/**
 * В Saby всплывающие уведомления перекрывают правую нижнюю часть экрана.
 * Закрываем их перед снятием скриншота; если их нет — ничего не делаем.
 */
export async function dismissNotifications(page: Page): Promise<void> {
  const closeButtons = page.locator(
    '[class*="Notification"] [title="Закрыть"], [class*="Notification__close"]',
  );
  const count = await closeButtons.count();
  for (let i = 0; i < count; i++) {
    await closeButtons.nth(i).click({ timeout: 1_000 }).catch(() => undefined);
  }
}

const THEME_SECTION_MARKERS: Record<string, string | RegExp> = {
  'Воронка продаж': 'Этапы',
  'Документы и формы': 'Печатные формы',
  'Шаблоны отправки': /Ускорьте работу и исключите ошибки менеджера/,
  Скрипты: /Укажите скрипты для данной темы отношений/,
  Параметры: 'Тип темы',
  Триггеры: 'Выберите, что сделать Saby:',
  'Доп. поля': 'Основная вкладка',
  'Команды в меню': /Закрепите важные для быстрого доступа/,
  'Роли и права': 'Автор',
  Связи: /Укажите, на основании чего можно создать этот документ/,
  Инструкция: 'Отображение',
};

/**
 * Данные на карточке темы меняются (количество сделок, этапы, проценты),
 * поэтому перед эталонным скриншотом скрываем только динамические элементы.
 * visibility:hidden сохраняет геометрию страницы, в отличие от удаления узлов.
 *
 * CSS добавляем в саму страницу: так стиль гарантированно применяется к моменту
 * снимка и снимается сразу после него.
 */
const THEME_DYNAMIC_CSS = readFileSync(resolve(__dirname, 'theme-dynamic.css'), 'utf8');

export async function openTheme(page: Page): Promise<void> {
  await openWorkspace(page, THEME_URL);
  await expect(
    page.getByText('Воронка продаж', { exact: true }).filter({ visible: true }).last(),
  ).toBeVisible();
}

export async function openThemeSection(page: Page, section: string): Promise<void> {
  const marker = THEME_SECTION_MARKERS[section];
  if (!marker) {
    throw new Error(`Не задан маркер загрузки для раздела темы: ${section}`);
  }

  const markerLocator =
    typeof marker === 'string' ? page.getByText(marker, { exact: true }) : page.getByText(marker);

  // Клик по разделу иногда теряется, пока карточка темы дорисовывается.
  // Повторяем клик, если содержимое раздела так и не появилось.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByText(section, { exact: true }).filter({ visible: true }).last().click();
    try {
      await expect(markerLocator.first()).toBeVisible({
        timeout: attempt === 0 ? 10_000 : 30_000,
      });
      break;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }

  // Пустой rich-text редактор инструкции подгружается отдельно от заголовка.
  // Ждём плейсхолдер, чтобы его скрытие не сдвигало иллюстрацию на скриншоте.
  if (section === 'Инструкция') {
    await expect(page.locator('.frameControls-Placeholder').first()).toBeAttached({ timeout: 30_000 });
  }
}

export async function expectThemeScreenshot(page: Page, name: string): Promise<void> {
  await dismissNotifications(page);
  const styleHandle = await page.addStyleTag({ content: THEME_DYNAMIC_CSS });
  try {
    await expect(workspace(page)).toHaveScreenshot(name);
  } finally {
    await styleHandle
      .evaluate((element) => element.remove())
      .catch(() => undefined);
  }
}

export async function openContacts(page: Page): Promise<void> {
  await openWorkspace(page, CONTACTS_URL);
}

export async function openThemes(page: Page): Promise<void> {
  await openWorkspace(page, THEMES_URL);

  // Saby может восстановить последнюю открытую карточку темы вместо реестра.
  // Кнопка «назад» с названием темы возвращает к списку тем.
  const registry = page.getByText('Продажи', { exact: true }).filter({ visible: true }).first();
  const backButton = page
    .locator('.sabyPage-MainLayout__backButton')
    .filter({ visible: true })
    .first();

  await expect
    .poll(
      async () => {
        if (await registry.isVisible().catch(() => false)) return 'registry';
        if (await backButton.isVisible().catch(() => false)) return 'card';
        return 'loading';
      },
      { timeout: 30_000, message: 'Не дождались ни реестра тем, ни карточки темы' },
    )
    .not.toBe('loading');

  if (!(await registry.isVisible().catch(() => false))) {
    await backButton.click();
  }

  await expect(registry).toBeVisible({ timeout: 30_000 });
}

/** Создаёт новую тему типа «Продажи» и оставляет открытой её карточку. */
export async function createTheme(page: Page, name: string): Promise<void> {
  await openThemes(page);
  await page.locator('.extControls-addButton-icon-brand').filter({ visible: true }).first().click();

  const menu = page.locator('.controls-Menu__popup').filter({ visible: true }).last();
  await expect(menu).toBeVisible();
  await menu.locator('[title="Продажи"]').filter({ visible: true }).first().click();

  // В карточке-черновике название темы — первое поле в шапке.
  // Дожидаемся загрузки содержимого: если заполнить поле слишком рано,
  // перерисовка карточки очищает значение и сохранение падает на валидации.
  await expect(
    page.getByText('Воронка продаж', { exact: true }).filter({ visible: true }).last(),
  ).toBeVisible({ timeout: 30_000 });
  const nameInput = page
    .locator('.sabyPage-MainLayout__headerLeft input')
    .filter({ visible: true })
    .first();
  await expect(nameInput).toBeVisible({ timeout: 30_000 });
  await nameInput.fill(name);
  await expect(nameInput).toHaveValue(name);

  await page.getByText('Сохранить', { exact: true }).filter({ visible: true }).first().click();
  await expect(
    page.getByText('Воронка продаж', { exact: true }).filter({ visible: true }).last(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(name, { exact: true }).filter({ visible: true }).first()).toBeVisible();
}

/**
 * Открывает карточку этапа через действие «Редактировать» и меняет его название.
 * После «Применить» тема остаётся в режиме редактирования — сохранение отдельно.
 */
export async function editThemeStage(
  page: Page,
  currentName: string,
  newName: string,
): Promise<void> {
  const row = page
    .locator('.controls-GridReact__row')
    .filter({ hasText: currentName })
    .filter({ visible: true })
    .first();
  await expect(row).toBeVisible();
  await row.hover();

  const edit = row.locator('[title="Редактировать"]').filter({ visible: true }).first();
  await expect(edit).toBeVisible();
  await edit.click();

  const dialog = page
    .locator('.controls-DialogTemplate')
    .filter({ visible: true })
    .filter({ hasText: 'Этап' })
    .last();
  await expect(dialog).toBeVisible();

  const titleInput = dialog.locator('input').filter({ visible: true }).first();
  await expect(titleInput).toHaveValue(currentName);
  await titleInput.fill(newName);

  const apply = page.locator('[title="Применить"]').filter({ visible: true }).first();
  await expect(apply).toBeVisible();
  await apply.click();
  await expect(
    page.getByText(newName, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

/** Сохраняет изменения темы после «Применить» и ждёт возврата в режим просмотра. */
export async function saveTheme(page: Page): Promise<void> {
  const save = page.getByText('Сохранить', { exact: true }).filter({ visible: true }).first();
  await expect(save).toBeVisible();
  await save.click();
  await expect(
    page.getByText('Изменить', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

/** Удаляет открытую карточку темы с подтверждением. */
export async function deleteCurrentTheme(page: Page): Promise<void> {
  await page.locator('[title="Удалить тему"]').filter({ visible: true }).first().click();
  const popup = page.locator('.controls-Confirmation_popup').filter({ visible: true }).last();
  await expect(popup).toContainText('Удалить текущую запись?');
  await popup.getByText('Да', { exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/page\/crm-subjects(?:$|\?)/, { timeout: 30_000 });
}

/** Страховка для afterEach: удаляет созданную тему по названию, если она осталась. */
export async function deleteThemeByName(page: Page, name: string): Promise<void> {
  await openThemes(page);
  const theme = page.getByText(name, { exact: true }).filter({ visible: true }).first();
  if (!(await theme.isVisible().catch(() => false))) return;

  await theme.click();
  await expect(
    page.getByText('Воронка продаж', { exact: true }).filter({ visible: true }).last(),
  ).toBeVisible({ timeout: 30_000 });
  await deleteCurrentTheme(page);
}

/** Создаёт пустую карточку ФЛ (без сохранения) и открывает мини-карточку. */
export async function createEmptyIndividualCard(page: Page): Promise<void> {
  await page.locator('.extControls-addButton-icon-brand').click();
  await page
    .getByText('Физическое лицо', { exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await expect(miniCard(page)).toBeVisible();
  // Карточка подгружает поля и меняет высоту: ждём последний блок формы
  // и стабилизацию размера, иначе скриншот ловит промежуточное состояние.
  await expect(page.getByText('Место рождения', { exact: true })).toBeVisible();
  await waitForStableSize(miniCard(page), page);
}

/** Ждёт, пока у элемента перестанет меняться ширина/высота (JS-анимации Saby). */
async function waitForStableSize(locator: Locator, page: Page): Promise<void> {
  let previousSize = '';
  let stableSince = Date.now();
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    const box = await locator.boundingBox();
    const size = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : '';
    if (size !== previousSize) {
      previousSize = size;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= 300) {
      return;
    }
    await page.waitForTimeout(100);
  }

  throw new Error('Размер элемента не стабилизировался за 15 секунд');
}

/** Из мини-карточки открывает полную карточку ФЛ. */
export async function openFullIndividualCard(page: Page): Promise<void> {
  await page.getByTitle('Перейти в подробную карточку').click();
  await expect(page.locator('.crm_IndividualCard__tabsArea')).toBeVisible();
  await expect(cardBody(page)).toBeVisible();
  await expect(cardBody(page)).toContainText(CARD_READY);
}

export type IndividualDraft = {
  lastName: string;
  firstName: string;
  middleName?: string;
  phone: string;
  contactNote?: string;
  birthDate?: string;
  gender?: 'Мужской' | 'Женский';
  address?: string;
  passportSeries?: string;
  passportNumber?: string;
  passportIssueDate?: string;
  passportDepartmentCode?: string;
  passportIssuer?: string;
  birthPlace?: string;
};

/** Заполняет мини-карточку ФЛ; сохранение выполняет отдельный хелпер. */
export async function fillIndividualMiniCard(
  page: Page,
  draft: IndividualDraft,
): Promise<void> {
  const card = miniCard(page);
  const lastNameInput = card.locator('input.Name-Input__field_lastName');

  // В момент открытия мини-карточки вместо input может быть span-плейсхолдер.
  await expect(lastNameInput).toBeVisible({ timeout: 30_000 });
  await lastNameInput.fill(draft.lastName);
  await card.locator('input.Name-Input__field_firstName').fill(draft.firstName);
  if (draft.middleName) {
    await card.locator('input.Name-Input__field_middleName').fill(draft.middleName);
  }

  await card.locator('.cd-MultipleInput__field_Value input').fill(draft.phone);
  if (draft.contactNote) {
    await card.locator('.cd-MultipleInput__field_Comment input').fill(draft.contactNote);
  }

  if (draft.birthDate) {
    await card
      .locator('[data-qa="personData-base__dateOfBirth_input"] input')
      .fill(draft.birthDate);
  }

  if (draft.gender) {
    await card
      .locator('.controls-Dropdown__clickable')
      .filter({ hasText: 'Пол' })
      .first()
      .click();
    await page.getByText(draft.gender, { exact: true }).filter({ visible: true }).last().click();
  }

  if (draft.address) {
    await card.locator('[data-qa="Location-AddressForm-Suggest"] input').fill(draft.address);
  }

  if (draft.passportSeries) {
    await card
      .locator('[data-qa="personData-documentFormInputsSeries__validator"] input')
      .fill(draft.passportSeries);
  }
  if (draft.passportNumber) {
    await card
      .locator('[data-qa="personData-documentFormInputsNumber__validator"] input')
      .fill(draft.passportNumber);
  }
  if (draft.passportIssueDate) {
    await card
      .locator('[data-qa="personData-documentFormInputsIssueDate__input"] input')
      .fill(draft.passportIssueDate);
  }
  if (draft.passportDepartmentCode) {
    await card
      .locator('[data-qa="personData-passportFormInputsDepartmentCode__suggestInput"] input')
      .fill(draft.passportDepartmentCode);
  }
  if (draft.passportIssuer) {
    await card
      .locator('[data-qa="personData-documentFormInputsIssuer__input"] textarea')
      .fill(draft.passportIssuer);
  }
  if (draft.birthPlace) {
    await card.locator('[data-qa="pd-componentsBirthPlaceInput"] input').fill(draft.birthPlace);
  }
}

/**
 * Заполняет уже открытую полную карточку ФЛ.
 * Подходит для новой карточки, созданной из пустой мини-карточки: она
 * сразу открывается в режиме редактирования.
 */
export async function fillFullIndividualCard(
  page: Page,
  draft: IndividualDraft,
  note?: string,
): Promise<void> {
  const body = cardBody(page);
  const lastNameInput = body.locator('input.Name-Input__field_lastName');

  // Пока карточка догружается, вместо input может быть span-плейсхолдер.
  // Ждём именно поле ввода, иначе fill падает с «Element is not an <input>».
  await expect(lastNameInput).toBeVisible({ timeout: 30_000 });
  await lastNameInput.fill(draft.lastName);
  await body.locator('input.Name-Input__field_firstName').fill(draft.firstName);
  if (draft.middleName) {
    await body.locator('input.Name-Input__field_middleName').fill(draft.middleName);
  }

  await body.locator('.cd-MultipleInput__field_Value input').fill(draft.phone);
  if (draft.contactNote) {
    await body.locator('.cd-MultipleInput__field_Comment input').fill(draft.contactNote);
  }

  if (draft.birthDate) {
    // В полной карточке дата рождения — единственное поле с классом stretcher
    // до добавления паспорта.
    await body
      .locator('input.controls-InputBase__nativeField_stretcher')
      .filter({ visible: true })
      .first()
      .fill(draft.birthDate);
  }

  if (draft.gender) {
    await body
      .locator('.controls-Dropdown__clickable')
      .filter({ hasText: 'Пол' })
      .first()
      .click();
    await page.getByText(draft.gender, { exact: true }).filter({ visible: true }).last().click();
  }

  if (draft.address) {
    await body.locator('[data-qa="Location-AddressForm-Suggest"] input').fill(draft.address);
  }

  if (note) {
    await body.locator('textarea').filter({ visible: true }).first().fill(note);
  }
}

/** Сохраняет полную карточку ФЛ зелёной кнопкой в шапке. */
export async function saveFullIndividualCard(page: Page): Promise<void> {
  const header = individualHeader(page);
  const save = header.locator('.icon-Yes').filter({ visible: true }).first();

  await expect(save).toBeVisible();
  await save.click();
  await expect(header.locator('.icon-Edit').filter({ visible: true }).first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Сохраняет мини-карточку ФЛ и ждёт её закрытия. */
export async function saveMiniIndividualCard(page: Page): Promise<void> {
  const card = miniCard(page);
  const save = card.getByTitle('Сохранить');

  await expect(save).toBeVisible();
  await expect(save).not.toHaveClass(/controls-Button_readonly/);
  await save.click();
  await expect(card).toBeHidden({ timeout: 30_000 });
}

/** Ищет контакт в реестре по строке и открывает его полную карточку. */
export async function openContactByQuery(page: Page, query: string): Promise<void> {
  const search = page.getByPlaceholder('\uFEFF').filter({ visible: true }).first();
  await expect(search).toBeVisible();
  await search.fill(query);

  const person = page.getByText(query, { exact: false }).filter({ visible: true }).first();
  await expect(person).toBeVisible({ timeout: 30_000 });
  await person.click();

  await expect(page.locator('.crm_IndividualCard__tabsArea')).toBeVisible({ timeout: 30_000 });
  await expect(cardBody(page)).toBeVisible();
  await expect(cardBody(page)).toContainText(CARD_READY);
}

const individualHeader = (page: Page): Locator =>
  page.locator('.sabyPage-EntityLayoutNew__headerContent');

/**
 * В полной карточке ФЛ первое поле-примечание — первый видимый textarea.
 * После изменения сохраняет карточку зелёной кнопкой в шапке.
 */
export async function editFullIndividualCardNote(page: Page, note: string): Promise<void> {
  const header = individualHeader(page);
  const edit = header.locator('.icon-Edit').filter({ visible: true }).first();
  await expect(edit).toBeVisible();
  await edit.click();

  const noteField = cardBody(page).locator('textarea').filter({ visible: true }).first();
  await expect(noteField).toBeVisible();
  await expect(noteField).toHaveValue('');
  await noteField.fill(note);

  const save = header.locator('.icon-Yes').filter({ visible: true }).first();
  await expect(save).toBeVisible();
  await save.click();
  await expect(header.locator('.icon-Edit').filter({ visible: true }).first()).toBeVisible();
}

/** Удаляет открытую в полной карточке запись ФЛ. */
export async function deleteCurrentIndividual(page: Page): Promise<void> {
  const deleteButton = page.locator('[title="Удалить"]').filter({ visible: true }).first();
  const popup = page.locator('.controls-Confirmation_popup').filter({ visible: true }).last();

  // В Saby клик по кнопке тулбара иногда «теряется», пока карточка
  // инициализируется. Повторяем клик, пока не появится подтверждение.
  for (let attempt = 0; attempt < 3; attempt++) {
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();
    try {
      await expect(popup).toContainText('Удалить текущую запись?', { timeout: 4_000 });
      await popup.getByText('Да', { exact: true }).filter({ visible: true }).first().click();
      await expect(popup).toBeHidden({ timeout: 30_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}

/** Страховка для afterEach: удаляет созданный контакт по фамилии, если он остался. */
export async function deleteIndividualByQuery(page: Page, query: string): Promise<void> {
  await openContacts(page);
  const search = page.getByPlaceholder('\uFEFF').filter({ visible: true }).first();
  await expect(search).toBeVisible();
  await search.fill(query);
  await page.waitForTimeout(800);

  const person = page.getByText(query, { exact: false }).filter({ visible: true }).first();
  if (!(await person.isVisible().catch(() => false))) return;

  await person.click();
  await expect(page.locator('.crm_IndividualCard__tabsArea')).toBeVisible({ timeout: 30_000 });
  await expect(cardBody(page)).toBeVisible();
  await expect(cardBody(page)).toContainText(CARD_READY);
  await deleteCurrentIndividual(page);

  // Удаление на стенде применяется асинхронно: дожидаемся, пока строка
  // исчезнет из реестра, иначе следующий переход увидит устаревший список.
  await expect(page.locator('.crm_IndividualCard__tabsArea'))
    .toBeHidden({ timeout: 30_000 })
    .catch(() => undefined);
  await expect(page.getByText(query, { exact: false }).filter({ visible: true })).toHaveCount(0, {
    timeout: 60_000,
  });
}

export type IndividualTab = 'tabparams' | 'tabpurchases' | 'tabactivity';

// Любой из признаков, что содержимое вкладки уже отрисовалось.
// Нужен, чтобы не кликать по вкладкам во время инициализации карточки.
const CARD_READY =
  /Можно добавить|Заказ|Счет|Реализация|Коммерческое предложение|Запланировать|Показать все события|Паспорт/;

const TAB_CONTENT: Record<IndividualTab, RegExp> = {
  tabparams: /Можно добавить|Паспорт/,
  tabpurchases: /Заказ|Счет|Реализация|Коммерческое предложение/,
  tabactivity: /Запланировать|Показать все события/,
};

export async function selectIndividualTab(page: Page, tab: IndividualTab): Promise<void> {
  const tabLocator = page.locator(`.crm_IndividualCard__tabsArea [name="${tab}"]`);

  // В Saby клик по вкладке иногда «теряется», если карточка ещё инициализируется.
  // Проверяем фактическое содержимое и при необходимости повторяем клик.
  for (let attempt = 0; attempt < 2; attempt++) {
    await tabLocator.click();
    try {
      await expect(cardBody(page)).toContainText(TAB_CONTENT[tab], { timeout: 5_000 });
      return;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}

/** Находит существующего клиента через поиск и открывает его полную карточку. */
export async function openFilledIndividualCard(
  page: Page,
  query: string,
  personName: string,
): Promise<void> {
  // В разметке Saby у поля поиска placeholder — невидимый BOM (U+FEFF).
  const searchInput = page.getByPlaceholder('\uFEFF').filter({ visible: true }).first();
  await searchInput.click();
  await searchInput.fill(query);

  const person = page.getByText(personName, { exact: true }).filter({ visible: true }).first();
  await expect(person).toBeVisible({ timeout: 30_000 });
  await person.click();

  // На GitHub-hosted раннере карточка после клика может грузиться заметно
  // дольше стандартных 10 секунд (виден индикатор «Загрузка»).
  await expect(page.locator('.crm_IndividualCard__tabsArea')).toBeVisible({ timeout: 30_000 });
  await expect(cardBody(page)).toBeVisible();
  await expect(cardBody(page)).toContainText(CARD_READY);
}

/**
 * Копирует ссылку на уже открытую карточку ФЛ кнопкой «Ссылка/Поделиться».
 *
 * В актуальной версии Saby кнопка копирует ссылку сразу, без промежуточного
 * меню «Скопировать». Ссылка каждый раз берётся из живой карточки.
 */
export async function copyIndividualCardLink(page: Page): Promise<string> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  // Очищаем буфер, чтобы не прочитать ссылку от предыдущего кейса.
  await page.evaluate(() => navigator.clipboard.writeText(''));

  console.log('[ui] копирую ссылку кнопкой «Ссылка/Поделиться»');
  const share = page.locator('[title="Ссылка/Поделиться"]').filter({ visible: true }).first();
  await expect(share).toBeVisible();
  await share.click();

  const readClipboard = async (): Promise<string> =>
    (await page.evaluate(() => navigator.clipboard.readText())).trim();

  await expect
    .poll(readClipboard, {
      timeout: 10_000,
      message: 'Ссылка на карточку не скопировалась в буфер обмена',
    })
    .not.toBe('');

  const link = await readClipboard();
  console.log(`[ui] ссылка в буфере: ${link}`);
  return link;
}

/**
 * Открывает подменю карточки «Ссылка/Поделиться».
 *
 * В новой версии интерфейса кнопка на тулбаре копирует ссылку сразу,
 * а команда «В новой вкладке» осталась в подменю меню карточки.
 */
export async function openIndividualCardShareMenu(page: Page): Promise<void> {
  console.log('[ui] открываю меню карточки → «Ссылка/Поделиться»');
  const menuButton = page.locator('[title="Открыть меню"]').filter({ visible: true }).first();
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  const menu = page.locator('.controls-Menu__popup').filter({ visible: true }).last();
  await expect(menu).toBeVisible();

  const shareItem = menu
    .getByText('Ссылка/Поделиться', { exact: true })
    .filter({ visible: true })
    .first();
  await expect(shareItem).toBeVisible();
  await shareItem.hover();

  const newTabItem = page
    .getByText('В новой вкладке', { exact: true })
    .filter({ visible: true })
    .first();
  await expect(newTabItem).toBeVisible();
}

/** Открывает карточку по ссылке в новой вкладке того же браузерного контекста. */
export async function openIndividualCardByLink(
  context: BrowserContext,
  link: string,
): Promise<Page> {
  console.log(`[ui] открываю карточку по ссылке: ${link}`);
  const page = await context.newPage();
  await gotoWithRetry(page, link);

  if (page.url().includes('fix-sso.saby.ru')) {
    console.warn('[ui] сессия истекла при открытии ссылки, повторный вход');
    await login(page);
    await gotoWithRetry(page, link);
  }

  await expect(page.locator('.crm_IndividualCard__tabsArea')).toBeVisible({ timeout: 90_000 });
  await expect(cardBody(page)).toBeVisible();
  console.log(`[ui] карточка по ссылке открыта: ${page.url()}`);
  return page;
}

/** Открывает визитку клиента из списка договоров. */
export async function openBusinessCard(page: Page): Promise<void> {
  await openWorkspace(page, LOANS_URL);

  const person = page
    .getByText('Сизов Виктор Генадьевич', { exact: false })
    .filter({ visible: true })
    .first();
  await expect(person).toBeVisible({ timeout: 30_000 });
  await person.click();

  // На GitHub-hosted раннере визитка после клика может открываться
  // заметно дольше стандартных 10 секунд.
  await expect(miniCardDialog(page)).toBeVisible({ timeout: 30_000 });
  await waitForStableSize(miniCardDialog(page), page);
  await expect(miniCardDialog(page).getByText('Паспорт', { exact: true })).toBeVisible();
}

type CardScreenshotOptions = {
  mask?: Locator[];
  maxDiffPixelRatio?: number;
};

/**
 * Скриншот тела карточки. Возраст в карточке зависит от текущей даты,
 * поэтому по умолчанию маскируется.
 */
export async function expectCardScreenshot(
  page: Page,
  name: string,
  options: CardScreenshotOptions = {},
): Promise<void> {
  await dismissNotifications(page);

  // Уведомления асинхронных операций (например, «Удаление темы») живут
  // в портале поверх карточки и могут появиться уже после dismissNotifications.
  // На эталоне их нет, поэтому скрываем слой на время снимка.
  const styleHandle = await page.addStyleTag({
    content: `
      .controls-Notification,
      .LongOperations-Notifier {
        visibility: hidden !important;
      }
    `,
  });

  try {
    await expect(cardBody(page)).toHaveScreenshot(name, {
      mask: [page.getByText(/\(\d+ лет\)/), ...(options.mask ?? [])],
      ...(options.maxDiffPixelRatio !== undefined
        ? { maxDiffPixelRatio: options.maxDiffPixelRatio }
        : {}),
    });
  } finally {
    await styleHandle
      .evaluate((element) => element.remove())
      .catch(() => undefined);
  }
}

/**
 * Типы документов, которые создаются из карточки ФЛ через
 * «Добавить» → «Продажи». В списке и фильтре Saby использует
 * разные названия: например, «Счет» в строке и «Счета» в фильтре.
 */
export type SalesDocumentType = {
  category: 'Счета' | 'Заказы' | 'Реализации' | 'Коммерческие предложения';
  leaf: 'Счет' | 'Заказ от покупателя' | 'Реализация' | 'Коммерческое предложение';
  listTitle: string;
  filterTitle: string;
};

export const SALES_DOCUMENT_TYPES: SalesDocumentType[] = [
  {
    category: 'Счета',
    leaf: 'Счет',
    listTitle: 'Счет',
    filterTitle: 'Счета',
  },
  {
    category: 'Заказы',
    leaf: 'Заказ от покупателя',
    listTitle: 'Заказ от покупателя',
    filterTitle: 'Заказы от покупателей',
  },
  {
    category: 'Реализации',
    leaf: 'Реализация',
    listTitle: 'Реализация',
    filterTitle: 'Реализации',
  },
  {
    category: 'Коммерческие предложения',
    leaf: 'Коммерческое предложение',
    listTitle: 'Коммерческое предложение',
    filterTitle: 'Коммерческие предложения',
  },
];

/**
 * Верхний редактор документа. Контактная карточка тоже является
 * popup-окном, поэтому ищем окно с кнопкой сохранения документа.
 * Подпись «Комментарий» использовать нельзя: после заполнения поля
 * она исчезает, и локатор перестаёт находить уже открытый редактор.
 */
const documentEditor = (page: Page): Locator =>
  page
    .locator('.controls-Popup_shown')
    .filter({ visible: true })
    .filter({
      has: page.locator(
        '[data-qa="edo3-ReadOnlyStateTemplate__saveButton"], [title="Сохранить"]',
      ),
    })
    .last();

/** Открывает редактор нового документа продаж из карточки ФЛ. */
export async function createSalesDocument(
  page: Page,
  type: SalesDocumentType,
): Promise<void> {
  const add = cardBody(page)
    .locator('[data-qa="crm_addButton"]')
    .filter({ visible: true })
    .first();
  await expect(add).toBeVisible();
  await add.click();

  const addMenu = page.locator('.controls-Menu__popup').filter({ visible: true }).last();
  await expect(addMenu).toBeVisible();
  await addMenu.getByText('Продажи', { exact: true }).filter({ visible: true }).last().click();

  // В меню «Продажи» четыре категории; «Реализации» раскрывается
  // в дополнительное подменю, поэтому лист выбираем в последнем меню.
  const salesMenu = page
    .locator('.controls-Menu__popup')
    .filter({ visible: true })
    .filter({ hasText: 'Коммерческие предложения' })
    .last();
  await expect(salesMenu).toBeVisible();
  await salesMenu
    .getByText(type.category, { exact: true })
    .filter({ visible: true })
    .last()
    .click();

  const submenu = page.locator('.controls-Menu__popup').filter({ visible: true }).last();
  await expect(submenu).toBeVisible();
  await submenu.getByText(type.leaf, { exact: true }).filter({ visible: true }).last().click();

  const editor = documentEditor(page);
  await expect(editor).toBeVisible({ timeout: 30_000 });
  // Кнопка сохранения появляется раньше, чем форма документа догружает
  // строки и покупателя. Ждём заголовок таблицы, иначе первый клик
  // по «Сохранить» может прийтись на ещё не инициализированный редактор.
  await expect(editor.getByText(/наименования/i).first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Заполняет комментарий документа и сохраняет его. */
export async function fillAndSaveDocument(page: Page, comment: string): Promise<void> {
  const editor = documentEditor(page);
  await expect(editor).toBeVisible();

  const commentField = editor.locator('textarea').filter({ visible: true }).first();
  await expect(commentField).toBeVisible();
  await commentField.fill(comment);
  await expect(commentField).toHaveValue(comment);
  // Снимаем фокус, чтобы Saby зафиксировал изменение поля до сохранения.
  await commentField.blur();

  const save = editor
    .locator('[data-qa="edo3-ReadOnlyStateTemplate__saveButton"], [title="Сохранить"]')
    .filter({ visible: true })
    .first();
  await expect(save).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();

  // Сохранение закрывает редактор и добавляет строку с комментарием
  // в список. Ждём именно строку: это подтверждает, что данные записались.
  await expect(
    cardBody(page).getByText(comment, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(editor).toBeHidden({ timeout: 30_000 });
}

/** Проверяет, что сохранённый документ виден в списке с типом и комментарием. */
export async function expectDocumentInList(
  page: Page,
  type: SalesDocumentType,
  comment: string,
): Promise<void> {
  const body = cardBody(page);
  const row = body.locator('[data-qa="row"]').filter({ hasText: comment }).first();
  await expect(row).toContainText(type.listTitle);
  await expect(row).toContainText(comment);
  await expect(
    body.getByText(comment, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
}

/** Открывает всплывающий фильтр списка документов и ждёт его загрузки. */
export async function openDocumentsFilter(page: Page): Promise<Locator> {
  const body = cardBody(page);
  const filter = body.locator('[title="Фильтр"]').filter({ visible: true }).first();

  if (await filter.isVisible().catch(() => false)) {
    await filter.click();
  } else {
    // При активном фильтре кнопка «Фильтр» скрыта, а вместо неё показан
    // чип с названием выбранного типа. Клик по чипу снова открывает попап.
    const chip = body
      .locator('.layout-Browser__filter-wrapper .controls-FilterView__text-wrapper')
      .filter({ visible: true })
      .first();
    await expect(chip).toBeVisible();
    await chip.click();
  }

  const popup = page
    .locator('[templateforlog="EDO3/filterPopup:SimplePanel"]')
    .filter({ visible: true })
    .last();
  await expect(popup).toBeVisible({ timeout: 15_000 });
  await expect(
    popup.getByText('Документы', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 15_000 });
  return popup;
}

/** Закрывает всплывающий фильтр, не закрывая карточку ФЛ. */
export async function closeDocumentsFilter(page: Page): Promise<void> {
  const popup = page
    .locator('[templateforlog="EDO3/filterPopup:SimplePanel"]')
    .filter({ visible: true })
    .last();
  if (!(await popup.isVisible().catch(() => false))) return;

  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden({ timeout: 10_000 });
}

/** Проверяет, что в фильтре под группой «Документы» есть типы документов. */
export async function expectDocumentTypesInFilter(
  page: Page,
  titles: string[],
): Promise<void> {
  const popup = await openDocumentsFilter(page);
  for (const title of titles) {
    await expect(
      popup.getByText(title, { exact: true }).filter({ visible: true }).first(),
      `В фильтре не отображается тип документа «${title}»`,
    ).toBeVisible();
  }
  await closeDocumentsFilter(page);
}

/** Проверяет, что после удаления документа его тип пропал из фильтра. */
export async function expectFilterWithoutDocumentType(
  page: Page,
  absentTitle: string,
): Promise<void> {
  const popup = await openDocumentsFilter(page);
  await expect(
    popup.getByText(absentTitle, { exact: true }).filter({ visible: true }),
    `В фильтре не должен отображаться тип документа «${absentTitle}»`,
  ).toHaveCount(0);
  await closeDocumentsFilter(page);
}

/** Проверяет одновременно наличие одних типов и отсутствие других. */
export async function expectDocumentFilterState(
  page: Page,
  present: string[],
  absent: string[],
): Promise<void> {
  const popup = await openDocumentsFilter(page);
  for (const title of present) {
    await expect(
      popup.getByText(title, { exact: true }).filter({ visible: true }).first(),
      `В фильтре не отображается тип документа «${title}»`,
    ).toBeVisible();
  }
  for (const title of absent) {
    await expect(
      popup.getByText(title, { exact: true }).filter({ visible: true }),
      `В фильтре не должен отображаться тип документа «${title}»`,
    ).toHaveCount(0);
  }
  await closeDocumentsFilter(page);
}

/** Выбирает тип документа в фильтре и проверяет появившийся чип. */
export async function filterDocumentsByType(
  page: Page,
  type: SalesDocumentType,
): Promise<void> {
  const popup = await openDocumentsFilter(page);
  const item = popup.getByText(type.filterTitle, { exact: true }).filter({ visible: true }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(popup).toBeHidden({ timeout: 10_000 });

  await expect(
    cardBody(page)
      .locator('.layout-Browser__filter-wrapper')
      .getByText(type.filterTitle, { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
}

/** Сбрасывает фильтр документов через пункт «Все». */
export async function resetDocumentFilter(page: Page): Promise<void> {
  const popup = await openDocumentsFilter(page);
  const all = popup.getByText('Все', { exact: true }).filter({ visible: true }).first();
  await expect(all).toBeVisible();
  await all.click();
  await expect(popup).toBeHidden({ timeout: 10_000 });
  await expect(
    cardBody(page).locator('[title="Фильтр"]').filter({ visible: true }).first(),
  ).toBeVisible();
}

/** Ищет документ по комментарию через поиск списка. */
export async function searchDocuments(page: Page, query: string): Promise<void> {
  const search = cardBody(page)
    .locator('.crm_EventsAndDocuments__searchString input')
    .filter({ visible: true })
    .first();
  await expect(search).toBeVisible();
  await search.fill(query);
  await expect(
    cardBody(page).getByText(query, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 15_000 });
}

/** Очищает поиск списка документов. */
export async function clearDocumentsSearch(page: Page): Promise<void> {
  const body = cardBody(page);
  const reset = body
    .locator('.crm_EventsAndDocuments__searchString [title="Очистить"]')
    .filter({ visible: true })
    .first();

  if (await reset.isVisible().catch(() => false)) {
    await reset.click();
  } else {
    const search = body
      .locator('.crm_EventsAndDocuments__searchString input')
      .filter({ visible: true })
      .first();
    await search.fill('');
    await search.press('Enter');
  }

  await expect(body.locator('[title="Фильтр"]').filter({ visible: true }).first()).toBeVisible();
}

/** Проверяет, что комментарий документа виден в списке. */
export async function expectDocumentVisible(page: Page, comment: string): Promise<void> {
  await expect(
    cardBody(page).getByText(comment, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
}

/** Проверяет, что документа с таким комментарием нет в списке. */
export async function expectDocumentHidden(page: Page, comment: string): Promise<void> {
  await expect(
    cardBody(page).getByText(comment, { exact: true }).filter({ visible: true }),
  ).toHaveCount(0);
}

/** Редактирует комментарий сохранённого документа и проверяет сохранение. */
export async function editDocumentComment(
  page: Page,
  oldComment: string,
  newComment: string,
): Promise<void> {
  const body = cardBody(page);
  await expectDocumentVisible(page, oldComment);

  await body.locator('[data-qa="row"]').filter({ hasText: oldComment }).first().click();
  const editor = documentEditor(page);
  await expect(editor).toBeVisible({ timeout: 30_000 });

  const commentField = editor.locator('textarea').filter({ visible: true }).first();
  await expect(commentField).toHaveValue(oldComment);

  // Обычный fill в Saby-поле дописывает текст к модели, поэтому
  // выделяем старое значение и вводим новое как пользователь.
  await commentField.click();
  await commentField.selectText();
  await commentField.press('Backspace');
  await commentField.pressSequentially(newComment, { delay: 10 });
  await expect(commentField).toHaveValue(newComment);
  await commentField.blur();

  const save = editor
    .locator('[data-qa="edo3-ReadOnlyStateTemplate__saveButton"], [title="Сохранить"]')
    .filter({ visible: true })
    .first();
  await expect(save).toBeVisible();
  await expect(save).toBeEnabled();
  await save.click();

  await expect(
    body.getByText(newComment, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(editor).toBeHidden({ timeout: 30_000 });
}

/** Открывает сохранённый документ по комментарию. */
export async function openDocumentByComment(page: Page, comment: string): Promise<void> {
  await cardBody(page)
    .locator('[data-qa="row"]')
    .filter({ hasText: comment })
    .first()
    .click();
  await expect(documentEditor(page)).toBeVisible({ timeout: 30_000 });
}

/** Проверяет значение комментария в открытом редакторе документа. */
export async function expectDocumentCommentValue(page: Page, comment: string): Promise<void> {
  const field = documentEditor(page).locator('textarea').filter({ visible: true }).first();
  await expect(field).toHaveValue(comment);
}

/** Закрывает редактор документа, не закрывая карточку ФЛ. */
export async function closeDocumentEditor(page: Page): Promise<void> {
  const editor = documentEditor(page);
  const close = editor.locator('[title="Закрыть"]').filter({ visible: true }).first();
  await expect(close).toBeVisible();
  await close.click();
  await expect(editor).toBeHidden({ timeout: 30_000 });
}

async function deleteDocumentRow(page: Page, row: Locator): Promise<void> {
  await row.locator('[data-qa="cell"]').first().hover();

  const del = row
    .locator('[data-qa*="crmDeleteDocument"]')
    .filter({ visible: true })
    .first();
  await expect(del).toBeVisible();
  await del.click();

  const confirm = page.locator('.controls-Confirmation_popup').filter({ visible: true }).last();
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText('Удалить');
  await confirm.getByText('Да', { exact: true }).filter({ visible: true }).first().click();
  await expect(confirm).toBeHidden({ timeout: 30_000 });
}

/** Удаляет документ из списка по уникальному комментарию. */
export async function deleteDocumentByComment(page: Page, comment: string): Promise<void> {
  const body = cardBody(page);
  await expect(
    body.getByText(comment, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();

  const row = body.locator('[data-qa="row"]').filter({ hasText: comment }).first();
  await deleteDocumentRow(page, row);

  await expect(
    body.getByText(comment, { exact: true }).filter({ visible: true }),
  ).toHaveCount(0, { timeout: 30_000 });
}

/** Удаляет все документы из открытого списка покупок/продаж. */
export async function deleteAllDocuments(page: Page): Promise<void> {
  const rows = cardBody(page).locator('[data-qa="row"]');
  let remaining = await rows.count();

  while (remaining > 0) {
    await deleteDocumentRow(page, rows.first());
    await expect.poll(() => rows.count(), { timeout: 30_000 }).toBeLessThan(remaining);
    remaining = await rows.count();
  }
}

/**
 * Страховка для afterEach: удаляет документы и созданный контакт ФЛ.
 * Если контакт уже удалён, ничего не делает.
 */
export async function cleanupIndividualWithDocuments(
  page: Page,
  query: string,
): Promise<void> {
  await page.keyboard.press('Escape').catch(() => undefined);
  await openContacts(page);

  const search = page.getByPlaceholder('\uFEFF').filter({ visible: true }).first();
  await expect(search).toBeVisible();
  await search.fill(query);
  await page.waitForTimeout(800);

  const person = page.getByText(query, { exact: false }).filter({ visible: true }).first();
  if (!(await person.isVisible().catch(() => false))) return;

  await person.click();
  await expect(page.locator('.crm_IndividualCard__tabsArea')).toBeVisible({ timeout: 30_000 });
  await expect(cardBody(page)).toBeVisible();
  await expect(cardBody(page)).toContainText(CARD_READY);

  await selectIndividualTab(page, 'tabpurchases');
  // Снимаем фильтр и поиск, иначе очистка увидит только часть документов.
  await closeDocumentsFilter(page).catch(() => undefined);
  await resetDocumentFilter(page).catch(() => undefined);
  await clearDocumentsSearch(page).catch(() => undefined);
  await deleteAllDocuments(page);

  await deleteCurrentIndividual(page);
  await expect(page.locator('.crm_IndividualCard__tabsArea'))
    .toBeHidden({ timeout: 30_000 })
    .catch(() => undefined);
  await expect(page.getByText(query, { exact: false }).filter({ visible: true })).toHaveCount(0, {
    timeout: 60_000,
  });
}

/** Открывает тему из реестра по точному названию. */
export async function openThemeByName(page: Page, name: string): Promise<void> {
  await openThemes(page);
  const theme = page.getByText(name, { exact: true }).filter({ visible: true }).first();
  await expect(theme).toBeVisible({ timeout: 30_000 });
  await theme.click();
  await expect(
    page.getByText('Воронка продаж', { exact: true }).filter({ visible: true }).last(),
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * Копирует тему через контекстное меню и сохраняет копию под новым именем.
 * Saby открывает копию в режиме редактирования с названием оригинала.
 */
export async function copyTheme(
  page: Page,
  sourceName: string,
  copyName: string,
): Promise<void> {
  await openThemes(page);

  const source = page.getByText(sourceName, { exact: true }).filter({ visible: true }).first();
  await expect(source).toBeVisible({ timeout: 30_000 });
  const row = source.locator('xpath=ancestor::div[@data-qa="row"][1]');
  await row.click({ button: 'right' });

  const menu = page.locator('.controls-Menu__popup').filter({ visible: true }).last();
  await expect(menu).toBeVisible();
  await menu.getByText('Копировать', { exact: true }).filter({ visible: true }).first().click();

  const nameInput = page
    .locator('.sabyPage-MainLayout__headerLeft input')
    .filter({ visible: true })
    .first();
  await expect(nameInput).toBeVisible({ timeout: 30_000 });
  await expect(nameInput).toHaveValue(sourceName);

  // Поле названия в Saby дописывает текст к модели, поэтому заменяем
  // значение выделением и вводом, как это делает пользователь.
  await nameInput.click();
  await nameInput.selectText();
  await nameInput.press('Backspace');
  await nameInput.pressSequentially(copyName, { delay: 10 });
  await expect(nameInput).toHaveValue(copyName);
  await nameInput.blur();

  const save = page.getByText('Сохранить', { exact: true }).filter({ visible: true }).first();
  await expect(save).toBeVisible();
  await save.click();

  await expect(
    page.getByText(copyName, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByText('Изменить', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

/** Открывает карточку этапа воронки и возвращает её диалог и редактор кода. */
export async function openThemeStageSettings(
  page: Page,
  stageName: string,
): Promise<{ dialog: Locator; codeEditor: Locator }> {
  const stage = page.getByText(stageName, { exact: true }).filter({ visible: true }).first();
  await expect(stage).toBeVisible({ timeout: 30_000 });
  await stage.click();

  const dialog = page.locator('.controls-DialogTemplate').filter({ visible: true }).last();
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const codeEditor = dialog.locator('.CodeMirror').filter({ visible: true }).first();
  await expect(codeEditor).toBeVisible({ timeout: 30_000 });
  return { dialog, codeEditor };
}

/** Проверяет, что в редакторе кода нет маркеров ошибок. */
export async function expectCodeEditorHasNoErrors(scope: Locator): Promise<void> {
  await expect(
    scope
      .locator(
        '.CodeMirror-lint-marker-error, .CodeMirror-lint-message-error, [class*="CodeEditor__error"]',
      )
      .filter({ visible: true }),
  ).toHaveCount(0);
}

/** Закрывает диалог настроек этапа. */
export async function closeThemeStageSettings(page: Page, dialog: Locator): Promise<void> {
  const close = dialog.locator('[title="Закрыть"]').filter({ visible: true }).first();
  await expect(close).toBeVisible();
  await close.click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

/** Открывает панель итога темы (например, «Итоги пользователя»). */
export async function openThemeOutcome(page: Page, outcomeName: string): Promise<void> {
  const outcome = page.getByText(outcomeName, { exact: true }).filter({ visible: true }).first();
  await expect(outcome).toBeVisible({ timeout: 30_000 });
  await outcome.click();
  await expect(
    page.getByText('Формула видимости перехода', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

/** Открывает полноэкранный редактор формулы видимости перехода. */
export async function openThemeFormula(
  page: Page,
): Promise<{ codeEditor: Locator; properties: Locator }> {
  const formula = page
    .getByText('Формула видимости перехода', { exact: true })
    .filter({ visible: true })
    .first();
  await expect(formula).toBeVisible();
  await formula.click();

  const codeEditor = page.locator('.CodeMirror').filter({ visible: true }).first();
  await expect(codeEditor).toBeVisible({ timeout: 30_000 });
  const properties = page
    .locator('.baseEditorTemplate-PopupTemplate__rightSidebarContainer')
    .filter({ visible: true })
    .first();
  await expect(properties).toBeVisible({ timeout: 30_000 });
  return { codeEditor, properties };
}

/** Читает UUID формулы из панели свойств редактора. */
export async function getFormulaUuid(page: Page): Promise<string> {
  const properties = page
    .locator('.baseEditorTemplate-PopupTemplate__rightSidebarContainer')
    .filter({ visible: true })
    .first();
  const text = (await properties.innerText()).replace(/\s+/g, ' ').trim();
  const match = text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (!match) {
    throw new Error(`Не найден UUID формулы в панели свойств: ${text}`);
  }
  return match[0];
}

/** Заменяет код в полноэкранном редакторе формулы. */
export async function editFormulaCode(page: Page, code: string): Promise<void> {
  const editor = page.locator('.CodeMirror').filter({ visible: true }).first();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(code);
  await expect(editor).toContainText(code.split('\n')[0]);
}

/** Сохраняет изменения в полноэкранном редакторе формулы. */
export async function saveFormula(page: Page): Promise<void> {
  const saves = page.locator('[title="Сохранить"]').filter({ visible: true });
  const count = await saves.count();
  for (let i = 0; i < count; i++) {
    const box = await saves.nth(i).boundingBox();
    if (box && box.x > 1150 && box.y < 50) {
      await saves.nth(i).click();
      return;
    }
  }
  throw new Error('Не найдена кнопка сохранения формулы');
}

/** Закрывает полноэкранный редактор формулы, оставляя панель итога. */
export async function closeFormulaEditor(page: Page): Promise<void> {
  const closes = page.locator('[title="Закрыть"]').filter({ visible: true });
  const count = await closes.count();
  for (let i = 0; i < count; i++) {
    const box = await closes.nth(i).boundingBox();
    if (box && box.x > 1200 && box.y < 50) {
      await closes.nth(i).click();
      await expect(
        page
          .getByText('Формула видимости перехода', { exact: true })
          .filter({ visible: true })
          .first(),
      ).toBeVisible({ timeout: 30_000 });
      return;
    }
  }
  throw new Error('Не найдена кнопка закрытия редактора формулы');
}

/** Закрывает панель итога, открытую кнопкой «Итоги пользователя». */
export async function closeOutcomePanel(page: Page): Promise<void> {
  const outcome = page
    .locator('.controls-DialogTemplate')
    .filter({ visible: true })
    .filter({ hasText: 'Формула видимости перехода' })
    .last();
  if (await outcome.isVisible().catch(() => false)) {
    const close = outcome.locator('[title="Закрыть"]').filter({ visible: true }).first();
    if (await close.isVisible().catch(() => false)) {
      await close.click();
      await expect(outcome).toBeHidden({ timeout: 30_000 });
      return;
    }
  }

  const closes = page.locator('[title="Закрыть"]').filter({ visible: true });
  const count = await closes.count();
  for (let i = 0; i < count; i++) {
    const box = await closes.nth(i).boundingBox();
    if (box && box.x > 840 && box.x < 870 && box.y > 110 && box.y < 130) {
      await closes.nth(i).click();
      return;
    }
  }
  throw new Error('Не найдена кнопка закрытия панели итога');
}

/** Читает блок параметров темы для сравнения копии с оригиналом. */
export async function readThemeParameters(page: Page): Promise<string> {
  await expect(
    page.getByText('Тип темы', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });

  const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  const start = bodyText.indexOf('Тип темы');
  const endMarker =
    'Неотгруженные и неоплаченные счета после положительного закрытия сделки Оставить Удалить';
  const end = bodyText.indexOf(endMarker);
  if (start < 0 || end < 0) {
    throw new Error('Не удалось прочитать параметры темы');
  }
  return bodyText.slice(start, end + endMarker.length);
}
