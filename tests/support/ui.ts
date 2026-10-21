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

export async function openWorkspace(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });

  // Сессия могла истечь во время длинного прогона — повторно логинимся.
  if (page.url().includes('fix-sso.saby.ru')) {
    await login(page);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  }

  await expect(workspace(page)).toBeVisible({ timeout: 90_000 });
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

  await page.getByText(section, { exact: true }).filter({ visible: true }).last().click();

  const markerLocator =
    typeof marker === 'string' ? page.getByText(marker, { exact: true }) : page.getByText(marker);
  await expect(markerLocator.first()).toBeVisible({ timeout: 30_000 });
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
  await page.locator('[title="Удалить"]').filter({ visible: true }).first().click();
  const popup = page.locator('.controls-Confirmation_popup').filter({ visible: true }).last();
  await expect(popup).toContainText('Удалить текущую запись?');
  await popup.getByText('Да', { exact: true }).filter({ visible: true }).first().click();
  await expect(popup).toBeHidden({ timeout: 30_000 });
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
  await deleteCurrentIndividual(page);
}

export type IndividualTab = 'tabparams' | 'tabpurchases' | 'tabactivity';

// Любой из признаков, что содержимое вкладки уже отрисовалось.
// Нужен, чтобы не кликать по вкладкам во время инициализации карточки.
const CARD_READY = /Можно добавить|Заказ|Запланировать|Показать все события|Паспорт/;

const TAB_CONTENT: Record<IndividualTab, RegExp> = {
  tabparams: /Можно добавить|Паспорт/,
  tabpurchases: /Заказ/,
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
 * Копирует ссылку на уже открытую карточку ФЛ через меню «Ссылка/Поделиться».
 * Ссылка каждый раз берётся из живой карточки, а не задаётся в тесте.
 */
export async function copyIndividualCardLink(page: Page): Promise<string> {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  // Очищаем буфер, чтобы не прочитать ссылку от предыдущего кейса.
  await page.evaluate(() => navigator.clipboard.writeText(''));

  await page
    .locator('[title="Ссылка/Поделиться"]')
    .filter({ visible: true })
    .first()
    .click();

  const copyItem = page
    .getByText('Скопировать', { exact: true })
    .filter({ visible: true })
    .first();
  await expect(copyItem).toBeVisible();
  await copyItem.click();

  const readClipboard = async (): Promise<string> =>
    (await page.evaluate(() => navigator.clipboard.readText())).trim();

  await expect
    .poll(readClipboard, {
      timeout: 10_000,
      message: 'Ссылка на карточку не скопировалась в буфер обмена',
    })
    .not.toBe('');

  return readClipboard();
}

/** Открывает карточку по ссылке в новой вкладке того же браузерного контекста. */
export async function openIndividualCardByLink(
  context: BrowserContext,
  link: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 90_000 });

  if (page.url().includes('fix-sso.saby.ru')) {
    await login(page);
    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  }

  await expect(page.locator('.crm_IndividualCard__tabsArea')).toBeVisible({ timeout: 90_000 });
  await expect(cardBody(page)).toBeVisible();
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

  await expect(miniCardDialog(page)).toBeVisible();
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
