import { expect, type Locator, type Page } from '@playwright/test';
import { login } from './auth';
import {
  CARD_LOGIN,
  CARD_PASSWORD,
  CONTACTS_URL,
} from './constants';
import {
  createEmptyIndividualCard,
  dismissNotifications,
  gotoWithRetry,
  miniCard,
  workspace,
} from './ui';

export const NEW_CARD_PERSON = 'Проверка Карточки Физика';

export const NEW_CARD_MODES = ['В строку', 'Справа', 'Колонки'] as const;
export type NewCardMode = (typeof NEW_CARD_MODES)[number];

export const NEW_CARD_TABS = [
  'О клиенте',
  'Параметры',
  'Документы',
  'Активности',
  'Покупки',
  'Чаты',
] as const;
export type NewCardTab = (typeof NEW_CARD_TABS)[number];

export const NEW_CARD_TABS_BY_MODE: Record<NewCardMode, NewCardTab[]> = {
  'В строку': ['Параметры', 'Активности', 'Покупки', 'Чаты'],
  Справа: ['О клиенте', 'Параметры', 'Документы', 'Активности', 'Покупки', 'Чаты'],
  Колонки: ['Параметры', 'Документы', 'Активности', 'Покупки', 'Чаты'],
};

const MODE_CLASS: Record<NewCardMode, string> = {
  'В строку': 'crm_IndividualCardNew_narrow',
  Справа: 'crm_IndividualCardNew_right',
  Колонки: 'crm_IndividualCardNew_wide',
};

const TAB_NAME: Record<NewCardTab, string> = {
  'О клиенте': '',
  Параметры: 'tabparams',
  Документы: 'tabdocs',
  Активности: 'tabactivity',
  Покупки: 'tabpurchases',
  Чаты: 'tabchats',
};

const TAB_CONTENT: Record<NewCardTab, RegExp> = {
  'О клиенте': /СНИЛС|Гражданство/,
  Параметры: /СНИЛС|Можно добавить|Внешний ID/,
  Документы: /Добавьте необходимые файлы/,
  Активности: /Фиксация активности|Запланировать/,
  Покупки: /Счет|Заказ/,
  Чаты: /Чтобы начать общаться|Обсудите с клиентом/,
};

/** Корневой контейнер новой карточки ФЛ. */
export function newCardRoot(page: Page): Locator {
  return page.locator('.crm_IndividualCardNew').filter({ visible: true }).first();
}

/** Актуальный попап новой карточки (после переоткрытия в DOM может быть старый). */
function newCardPopup(page: Page): Locator {
  return page
    .locator('.controls-Popup')
    .filter({ visible: true })
    .filter({ has: page.locator('.crm_IndividualCardNew__name') })
    .last();
}

/** Открывает реестр контактов под пользователем с фичей новой карточки. */
export async function openContactsAsCardUser(page: Page): Promise<void> {
  console.log(`[new-card] открываю: ${CONTACTS_URL}`);
  await gotoWithRetry(page, CONTACTS_URL);

  if (page.url().includes('fix-sso.saby.ru')) {
    console.warn('[new-card] сессия истекла, повторный вход');
    await login(page, { login: CARD_LOGIN, password: CARD_PASSWORD });
    await gotoWithRetry(page, CONTACTS_URL);
  }

  await expect(workspace(page)).toBeVisible({ timeout: 90_000 });
  await dismissNotifications(page);
}

/** Открывает новую карточку существующего ФЛ по имени. */
export async function openNewCardForPerson(
  page: Page,
  personName = NEW_CARD_PERSON,
): Promise<void> {
  await openContactsAsCardUser(page);
  const person = page.getByText(personName, { exact: true }).filter({ visible: true }).first();
  await expect(person).toBeVisible({ timeout: 30_000 });
  await person.click();
  await expect(newCardRoot(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.crm_IndividualCardNew__name')).toContainText(personName);
}

/** Возвращает текущий режим новой карточки по классу контейнера. */
export async function getNewCardMode(page: Page): Promise<NewCardMode> {
  const root = newCardRoot(page);
  for (const mode of NEW_CARD_MODES) {
    const hasClass = await root.evaluate(
      (element, className) => element.classList.contains(className),
      MODE_CLASS[mode],
    );
    if (hasClass) return mode;
  }
  throw new Error('Не удалось определить режим новой карточки');
}

/** Проверяет, что карточка построена в ожидаемом режиме. */
export async function expectNewCardMode(page: Page, mode: NewCardMode): Promise<void> {
  await expect(newCardRoot(page)).toHaveClass(new RegExp(MODE_CLASS[mode]));
}

/** Открывает окно «Навигация» со списком режимов. */
export async function openNewCardModeMenu(page: Page): Promise<Locator> {
  // Кнопку ищем внутри актуальной карточки: после закрытия/открытия в DOM
  // может остаться старая копия попапа с такой же кнопкой.
  const button = newCardPopup(page)
    .locator('[data-qa="switchView"]')
    .filter({ visible: true })
    .first();
  await expect(button).toBeVisible({ timeout: 30_000 });

  const menu = page.locator('.controls-Menu__popup').filter({ visible: true }).last();
  for (let attempt = 0; attempt < 3; attempt++) {
    await button.click();
    try {
      await expect(menu).toBeVisible({ timeout: 5_000 });
      return menu;
    } catch (error) {
      if (attempt === 2) throw error;
      // Не нажимаем Escape: если меню не открылось, Escape закроет карточку.
      console.warn('[new-card] меню режимов не открылось, повторяю клик');
      if (await menu.isVisible().catch(() => false)) return menu;
      await page.waitForTimeout(500);
    }
  }

  throw new Error('Не удалось открыть меню режимов новой карточки');
}

/** Читает список режимов из окна «Навигация». */
export async function newCardModeNames(page: Page): Promise<string[]> {
  const menu = await openNewCardModeMenu(page);
  const rows = menu.locator('[data-qa="row"]').filter({ visible: true });
  const names: string[] = [];

  for (let i = 0; i < await rows.count(); i++) {
    names.push((await rows.nth(i).innerText()).replace(/\s+/g, ' ').trim());
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  return names;
}

/** Возвращает режим, отмеченный маркером в окне «Навигация». */
export async function selectedNewCardModes(page: Page): Promise<string[]> {
  const menu = await openNewCardModeMenu(page);
  const rows = menu.locator('[data-qa="row"]').filter({ visible: true });
  const selected: string[] = [];

  for (let i = 0; i < await rows.count(); i++) {
    const row = rows.nth(i);
    const marked = await row.locator('.controls-Menu__row-radioCircle_selected').count();
    if (marked > 0) {
      selected.push((await row.innerText()).replace(/\s+/g, ' ').trim());
    }
  }

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  return selected;
}

/** Переключает режим через окно «Навигация». */
export async function selectNewCardMode(page: Page, mode: NewCardMode): Promise<void> {
  const menu = await openNewCardModeMenu(page);
  await menu.getByText(mode, { exact: true }).filter({ visible: true }).first().click();
  await expectNewCardMode(page, mode);
}

/** Читает фактический список вкладок в текущем режиме. */
export async function newCardTabNames(page: Page, mode: NewCardMode): Promise<string[]> {
  const root = newCardRoot(page);

  if (mode === 'Справа') {
    const items = root
      .locator('.controls-MasterDetail_master [data-qa="item"] [title]')
      .filter({ visible: true });
    const names: string[] = [];
    for (let i = 0; i < await items.count(); i++) {
      const title = await items.nth(i).getAttribute('title');
      if (title) names.push(title.trim());
    }
    return names;
  }

  const tabs = root.locator('[name^="tab"]').filter({ visible: true });
  const names: string[] = [];
  for (let i = 0; i < await tabs.count(); i++) {
    const name = await tabs.nth(i).getAttribute('name');
    if (name) {
      const tab = NEW_CARD_TABS.find((candidate) => TAB_NAME[candidate] === name);
      if (tab) names.push(tab);
    }
  }
  return names;
}

/** Открывает вкладку карточки в текущем режиме. */
export async function selectNewCardTab(
  page: Page,
  mode: NewCardMode,
  tab: NewCardTab,
): Promise<void> {
  const root = newCardRoot(page);

  if (mode === 'Справа') {
    await root
      .locator('.controls-MasterDetail_master')
      .getByText(tab, { exact: true })
      .filter({ visible: true })
      .first()
      .click();
  } else {
    const name = TAB_NAME[tab];
    if (!name) throw new Error(`Вкладка «${tab}» недоступна в режиме «${mode}»`);
    await root.locator(`[name="${name}"]`).filter({ visible: true }).first().click();
  }

  await expect(root).toContainText(TAB_CONTENT[tab], { timeout: 30_000 });
}

/** Проверяет, что вкладка открылась и её содержимое построилось. */
export async function expectNewCardTabBuilt(
  page: Page,
  mode: NewCardMode,
  tab: NewCardTab,
): Promise<void> {
  await selectNewCardTab(page, mode, tab);

  if (mode === 'Справа') {
    const item = newCardRoot(page)
      .locator('.controls-MasterDetail_master [data-qa="item"]')
      .filter({ hasText: tab })
      .first();
    await expect(item).toHaveClass(/controls-ListView__item__marked_master/);
  } else {
    const name = TAB_NAME[tab];
    await expect(
      newCardRoot(page).locator(`[name="${name}"]`).filter({ visible: true }).first(),
    ).toHaveClass(/controls-Tabs__item-selected/);
  }
}

/** Закрывает новую карточку. */
export async function closeNewCard(page: Page): Promise<void> {
  const root = newCardRoot(page);

  // После смены режима карточка может ещё перерисовываться, и первый клик
  // по «Закрыть» иногда теряется. Повторяем, пока попап не исчезнет.
  for (let attempt = 0; attempt < 3; attempt++) {
    const close = newCardPopup(page)
      .locator('[data-qa="controls-stack-Button__close"]')
      .filter({ visible: true })
      .first();
    if (!(await close.isVisible().catch(() => false))) break;

    await close.click();
    try {
      await expect(root).toBeHidden({ timeout: 5_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      console.warn('[new-card] карточка не закрылась с первого клика, повторяю');
      await page.waitForTimeout(500);
    }
  }

  await expect(root).toBeHidden({ timeout: 30_000 });
}

/** Повторно открывает карточку после закрытия. */
export async function reopenNewCard(
  page: Page,
  personName = NEW_CARD_PERSON,
): Promise<void> {
  let person = page.getByText(personName, { exact: true }).filter({ visible: true }).first();
  if (!(await person.isVisible().catch(() => false))) {
    await openContactsAsCardUser(page);
    person = page.getByText(personName, { exact: true }).filter({ visible: true }).first();
  }

  await expect(person).toBeVisible({ timeout: 30_000 });
  await person.click();
  await expect(newCardRoot(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.crm_IndividualCardNew__name')).toContainText(personName);
}

/** Проверяет ключевые данные заполненной карточки «Проверка Карточки Физика». */
export async function expectFilledNewCardData(page: Page): Promise<void> {
  const root = newCardRoot(page);
  for (const value of [
    NEW_CARD_PERSON,
    '+7 (953) 647-58-58',
    'test@yandex.ru',
    '29.01.2000',
    'Ярославская обл., Мышкинский р-н, д. Кологривцево',
    '583-613-036 94',
    '180189810730',
    '12 45',
    '152536',
  ]) {
    await expect(root).toContainText(value);
  }
}

/** Создаёт ФЛ с одной фамилией — карточка остаётся пустой по остальным полям. */
export async function createEmptyNewCardIndividual(
  page: Page,
  lastName: string,
): Promise<void> {
  await openContactsAsCardUser(page);
  await createEmptyIndividualCard(page);

  const card = miniCard(page);
  // Первое поле мини-карточки — фамилия; ищем его по стабильному классу,
  // потому что обычный input.first() может попасть в служебное поле.
  const lastNameInput = card.locator('input.Name-Input__field_lastName');
  await expect(lastNameInput).toBeVisible({ timeout: 30_000 });
  await lastNameInput.fill(lastName);

  const save = card.getByTitle('Сохранить').filter({ visible: true }).first();
  await expect(save).toBeVisible();
  await save.click();
  await expect(card).toBeHidden({ timeout: 30_000 });
  await expect(
    page.getByText(lastName, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

/** Удаляет созданную пустую карточку через новую карточку. */
export async function deleteNewCardIndividual(
  page: Page,
  personName: string,
): Promise<void> {
  await openContactsAsCardUser(page);
  const person = page.getByText(personName, { exact: true }).filter({ visible: true }).first();
  if (!(await person.isVisible().catch(() => false))) return;

  await person.click();
  await expect(newCardRoot(page)).toBeVisible({ timeout: 30_000 });

  const remove = page.locator('[data-qa="delete"]').filter({ visible: true }).first();
  await expect(remove).toBeVisible({ timeout: 30_000 });
  await remove.click();

  const confirm = page.locator('.controls-Confirmation_popup').filter({ visible: true }).last();
  await expect(confirm).toContainText('Удалить текущую запись?');
  await confirm.getByText('Да', { exact: true }).filter({ visible: true }).first().click();

  await expect(
    page.getByText('Клиент удален', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await closeNewCard(page);
  await expect(page.getByText(personName, { exact: true }).filter({ visible: true })).toHaveCount(
    0,
    { timeout: 60_000 },
  );
}

/** Меняет ширину карточки перетаскиванием разделителя. */
export async function dragNewCardToWidth(page: Page, width: number): Promise<void> {
  const line = page.locator('[data-qa="controls-ResizingLine"]').filter({ visible: true }).first();
  const box = await line.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('Не найден разделитель ширины карточки');

  const y = Math.round(viewport.height / 2);
  await page.mouse.move(box.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(viewport.width - width, y, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}
