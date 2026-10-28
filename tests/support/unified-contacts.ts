import { expect, type Locator, type Page } from '@playwright/test';
import { CLIENTS_URL } from './constants';
import {
  deleteIndividualByQuery,
  dismissNotifications,
  openContacts,
  workspace,
  type IndividualDraft,
} from './ui';

/**
 * Хелперы для реестра «Контактные лица» под пустым тестовым пользователем.
 *
 * Все сущности создаются с префиксом «АТ» и удаляются после проверки.
 * Пустой пользователь нужен, чтобы финальное состояние страницы было
 * предсказуемым: заглушка «Здесь будет ваш контакт-лист».
 */

export const uniqueSuffix = (): string =>
  new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17);

const addButton = (page: Page): Locator => page.locator('[data-qa="sabyPage-addButton"]');

const visibleMenu = (page: Page): Locator =>
  page.locator('.controls-Menu__popup').filter({ visible: true }).last();

const addMenuItem = (page: Page, name: string): Locator =>
  visibleMenu(page).getByText(name, { exact: true }).filter({ visible: true }).first();

async function openAddMenu(page: Page, item: string): Promise<void> {
  // После перехода страница Saby ещё инициализируется, и первый клик
  // по «+» может потеряться. Повторяем, пока меню не откроется.
  for (let attempt = 0; attempt < 3; attempt++) {
    const button = addButton(page);
    await expect(button).toBeVisible({ timeout: 30_000 });
    await button.click();
    try {
      await expect(visibleMenu(page)).toBeVisible({ timeout: 5_000 });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await addMenuItem(page, item).click();
}

/** Открывает реестр клиентов (нужен для создания организации). */
export async function openClients(page: Page): Promise<void> {
  await page.goto(CLIENTS_URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await expect(workspace(page)).toBeVisible({ timeout: 90_000 });
  await dismissNotifications(page);
}

export const emptyTitle = (page: Page): Locator =>
  page.locator('[data-qa="hint-EmptyView__title"]');

export const emptyImage = (page: Page): Locator =>
  page.locator('[data-qa="hint-Template__imageWrapper"]');

/** Проверяет содержимое заглушки без перезагрузки страницы. */
export async function expectEmptyContactsContent(page: Page): Promise<void> {
  await expect(page.getByText('Здесь будет ваш контакт-лист', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(emptyTitle(page)).toBeVisible();
  await expect(emptyImage(page)).toBeVisible();
  await expect(
    page.getByText(/^АТ(ФЛ|Контакт|Орг|Папка|Тег|Выборка|Проба)/).filter({ visible: true }),
  ).toHaveCount(0);
}

/**
 * Финальное состояние после удаления данных: страница открывается заново
 * и показывает исходную заглушку.
 */
export async function expectContactsPageEmpty(page: Page): Promise<void> {
  await openContacts(page);
  // Теги и мастер-панель Saby подгружает асинхронно уже после заглушки:
  // без паузы удалённый тег может появиться после проверки.
  await page.waitForTimeout(2_000);
  await expectEmptyContactsContent(page);
}

/**
 * Проверяет положение заглушки: текст слева от центра рабочей области,
 * иллюстрация справа, обе части целиком помещаются в рабочую область.
 */
export async function expectEmptyPlaceholderLayout(page: Page): Promise<void> {
  const workspaceBox = await workspace(page).boundingBox();
  const titleBox = await emptyTitle(page).boundingBox();
  const imageBox = await emptyImage(page).boundingBox();

  expect(workspaceBox, 'Рабочая область должна быть видима').not.toBeNull();
  expect(titleBox, 'Заголовок заглушки должен быть видим').not.toBeNull();
  expect(imageBox, 'Иллюстрация заглушки должна быть видима').not.toBeNull();
  if (!workspaceBox || !titleBox || !imageBox) return;

  const centerX = workspaceBox.x + workspaceBox.width / 2;
  const titleCenterX = titleBox.x + titleBox.width / 2;
  const imageCenterX = imageBox.x + imageBox.width / 2;

  expect(titleCenterX, 'Текст заглушки должен быть слева от центра').toBeLessThan(centerX);
  expect(imageCenterX, 'Иллюстрация должна быть справа от центра').toBeGreaterThan(centerX);

  expect(titleBox.x).toBeGreaterThanOrEqual(workspaceBox.x);
  expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(workspaceBox.x + workspaceBox.width);
  expect(imageBox.x + imageBox.width).toBeLessThanOrEqual(workspaceBox.x + workspaceBox.width);

  expect(titleBox.y).toBeGreaterThanOrEqual(workspaceBox.y);
  expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(workspaceBox.y + workspaceBox.height);
  expect(imageBox.y + imageBox.height).toBeLessThanOrEqual(workspaceBox.y + workspaceBox.height);

  const titleCenterY = titleBox.y + titleBox.height / 2;
  const imageCenterY = imageBox.y + imageBox.height / 2;
  expect(Math.abs(titleCenterY - imageCenterY), 'Части заглушки должны быть на одной высоте').toBeLessThan(120);
}

/** Скрывает уведомления и длительные операции, чтобы они не попадали в эталон. */
async function hideFloatingNotifications(page: Page): Promise<() => Promise<void>> {
  await dismissNotifications(page);
  const styleHandle = await page.addStyleTag({
    content: `
      .controls-Notification,
      .LongOperations-Notifier,
      [data-qa="longOperations_notifier__popup"] {
        visibility: hidden !important;
      }
    `,
  });
  return async () => {
    await styleHandle
      .evaluate((element) => element.remove())
      .catch(() => undefined);
  };
}

export async function expectEmptyContactsScreenshot(page: Page): Promise<void> {
  const restore = await hideFloatingNotifications(page);
  try {
    await expect(workspace(page)).toHaveScreenshot('crm-contacts-empty.png');
  } finally {
    await restore();
  }
}

async function confirmDeletion(page: Page, expectedText: RegExp): Promise<void> {
  const popup = page.locator('.controls-Confirmation_popup').filter({ visible: true }).last();
  await expect(popup).toBeVisible({ timeout: 10_000 });
  await expect(popup).toContainText(expectedText);
  await popup.getByText('Да', { exact: true }).filter({ visible: true }).first().click();
  await expect(popup).toBeHidden({ timeout: 30_000 });
}

/** Подтверждение нужно не для всех действий (например, удаление тега). */
async function confirmIfAsked(page: Page): Promise<void> {
  const popup = page.locator('.controls-Confirmation_popup').filter({ visible: true }).last();
  const appeared = await popup
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return;
  await popup.getByText('Да', { exact: true }).filter({ visible: true }).first().click();
  await expect(popup).toBeHidden({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Физическое лицо
// ---------------------------------------------------------------------------

/** Создаёт временное ФЛ, сохраняет мини-карточку и ждёт строку в реестре. */
export async function createTemporaryIndividual(
  page: Page,
  draft: IndividualDraft,
): Promise<void> {
  await openContacts(page);
  await openAddMenu(page, 'Физическое лицо');

  const card = page.locator('.PersonCard-MiniCard__container');  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.locator('input.Name-Input__field_lastName').fill(draft.lastName);
  await card.locator('input.Name-Input__field_firstName').fill(draft.firstName);
  if (draft.phone) {
    await card.locator('.cd-MultipleInput__field_Value input').fill(draft.phone);
  }
  const save = card.getByTitle('Сохранить');
  await expect(save).toBeVisible();
  await save.click();
  await expect(card).toBeHidden({ timeout: 30_000 });

  await expect(
    page.getByText(draft.lastName, { exact: false }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

// ---------------------------------------------------------------------------
// Контактное лицо и организация
// ---------------------------------------------------------------------------

export type ContactPersonDraft = {
  lastName: string;
  firstName: string;
  phone: string;
  organization: string;
};

/** Создаёт организацию на странице «Клиенты» — она нужна контактному лицу. */
export async function createOrganization(page: Page, name: string): Promise<void> {
  await openClients(page);
  await openAddMenu(page, 'Организация');

  const nameInput = page.locator('.contractor-MiniCard-New__title input').first();
  await expect(nameInput).toBeVisible({ timeout: 30_000 });
  await nameInput.fill(name);
  await expect(nameInput).toHaveValue(name);

  const save = page.getByTitle('Сохранить').filter({ visible: true }).first();
  await expect(save).toBeVisible();
  await save.click();

  await expect(page.getByText(name, { exact: true }).filter({ visible: true }).first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Создаёт контактное лицо, привязывая его к существующей организации. */
export async function createContactPerson(
  page: Page,
  draft: ContactPersonDraft,
): Promise<void> {
  await openContacts(page);
  await openAddMenu(page, 'Контактное лицо');

  const editor = page.locator('[data-qa="cd-ContactPersonEditor"]').filter({ visible: true }).last();
  await expect(editor).toBeVisible({ timeout: 30_000 });
  await editor.locator('input.Name-Input__field_lastName').fill(draft.lastName);
  await editor.locator('input.Name-Input__field_firstName').fill(draft.firstName);

  // Телефон вводится посимвольно: маска Saby не принимает значение через fill().
  const phoneInput = editor.locator('.cd-MultipleInput__field_Value input').first();
  await phoneInput.click();
  await phoneInput.pressSequentially(draft.phone, { delay: 60 });

  // Организация обязательна, выбирается из справочника по названию.
  const organizationInput = editor.locator('[data-qa="cd-OrganizationLookup"] input').first();
  await organizationInput.click();
  await organizationInput.fill(draft.organization);
  const suggestion = page.getByText(draft.organization, { exact: true }).filter({ visible: true }).last();
  await expect(suggestion).toBeVisible({ timeout: 30_000 });
  await suggestion.click();

  const save = editor.getByTitle('Сохранить').first();
  await expect(save).toBeVisible();
  await save.click();
  await expect(editor).toBeHidden({ timeout: 60_000 });

  await expect(
    page.getByText(draft.lastName, { exact: false }).filter({ visible: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

async function findContactRow(page: Page, name: string): Promise<Locator> {
  const row = page.getByText(name, { exact: false }).filter({ visible: true }).first();
  if (await row.isVisible().catch(() => false)) return row;

  const search = page.getByPlaceholder('\uFEFF').filter({ visible: true }).first();
  if (!(await search.isVisible().catch(() => false))) return row;
  await search.fill(name);
  await expect(row).toBeVisible({ timeout: 30_000 }).catch(() => undefined);
  return row;
}

export async function deleteContactPersonByName(page: Page, name: string): Promise<void> {
  await openContacts(page);
  const row = await findContactRow(page, name);
  if (!(await row.isVisible().catch(() => false))) return;

  await row.click({ button: 'right' });
  const menu = visibleMenu(page);
  await expect(menu).toBeVisible();
  await menu.getByText('Удалить', { exact: true }).filter({ visible: true }).first().click();
  await confirmDeletion(page, /Удалить текущую запись/);

  await expect(page.getByText(name, { exact: false }).filter({ visible: true })).toHaveCount(0, {
    timeout: 30_000,
  });
}

export async function deleteOrganizationByName(page: Page, name: string): Promise<void> {
  await openClients(page);
  const row = page.getByText(name, { exact: true }).filter({ visible: true }).first();
  if (!(await row.isVisible().catch(() => false))) return;

  await row.click({ button: 'right' });
  const menu = visibleMenu(page);
  await expect(menu).toBeVisible();
  await menu.getByText('Удалить', { exact: true }).filter({ visible: true }).first().click();
  await confirmDeletion(page, /Удалить текущую запись/);

  await expect(page.getByText(name, { exact: true }).filter({ visible: true })).toHaveCount(0, {
    timeout: 30_000,
  });
}

// ---------------------------------------------------------------------------
// Папка
// ---------------------------------------------------------------------------

export async function createFolder(page: Page, name: string): Promise<void> {
  await openContacts(page);
  await openAddMenu(page, 'Папку');

  const dialog = page
    .locator('.controls-DialogTemplate')
    .filter({ visible: true })
    .filter({ hasText: 'Папка' })
    .last();
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  const nameInput = dialog.locator('[data-qa="crm_FolderDialog__folderInputName"] input');
  await nameInput.fill(name);
  await expect(nameInput).toHaveValue(name);
  await dialog.locator('[data-qa="crm_FolderDialog__saveButton"]').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

/**
 * Удаляет папку по названию. В пустом реестре мастер-панель с папками
 * скрыта, поэтому при необходимости создаётся временный контакт и
 * удаляется после папки.
 */
export async function deleteFolderByName(page: Page, name: string): Promise<void> {
  await openContacts(page);
  const folder = page.getByText(name, { exact: true }).filter({ visible: true }).first();

  let probe: string | undefined;
  if (!(await folder.isVisible().catch(() => false))) {
    probe = `АТПроба${uniqueSuffix()}`;
    await createTemporaryIndividual(page, { lastName: probe, firstName: 'Тест', phone: '9990000000' });
    await expect(folder).toBeVisible({ timeout: 30_000 });
  }

  await folder.click({ button: 'right' });
  const menu = visibleMenu(page);
  await expect(menu).toBeVisible();
  await menu.getByText('Удалить', { exact: true }).filter({ visible: true }).first().click();
  await confirmDeletion(page, /Удалить папку/);
  await expect(folder).toBeHidden({ timeout: 30_000 });

  if (probe) {
    await deleteIndividualByQuery(page, probe);
  }
}

// ---------------------------------------------------------------------------
// Тег
// ---------------------------------------------------------------------------

export async function createTag(page: Page, name: string): Promise<void> {
  await openContacts(page);
  await openAddMenu(page, 'Тег');

  const dialog = page
    .locator('.controls-DialogTemplate')
    .filter({ visible: true })
    .filter({ hasText: 'Тег' })
    .last();
  await expect(dialog).toBeVisible({ timeout: 30_000 });

  await dialog.locator('input').first().fill(name);
  await dialog.getByTitle('Сохранить').click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });

  await expect(
    page.locator('[data-qa="crm-MyContacts__tags"]').getByText(name, { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
}

export async function deleteTagByName(page: Page, name: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await openContacts(page);
    // Saby подгружает теги и перерисовывает список уже после заглушки.
    // Без паузы контекстное меню может относиться к заменённому узлу.
    await page.waitForTimeout(4_000);
    const tag = page
      .locator('[data-qa="crm-MyContacts__tags"]')
      .getByText(name, { exact: true })
      .first();
    if (!(await tag.isVisible().catch(() => false))) return;

    await tag.hover();
    await page.waitForTimeout(500);
    if (!(await tag.isVisible().catch(() => false))) continue;

    await tag.click({ button: 'right' });
    const menu = visibleMenu(page);
    await expect(menu).toBeVisible();
    const remove = menu.getByText('Удалить', { exact: true }).filter({ visible: true }).first();
    if (!(await remove.count())) {
      await page.keyboard.press('Escape');
      continue;
    }
    await remove.click();
    await confirmIfAsked(page);

    // Проверяем результат после перезагрузки: без неё удаление могло
    // «потеряться» при перерисовке списка тегов и вернуться позже.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(workspace(page)).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(5_000);
    if ((await page.getByText(name, { exact: true }).filter({ visible: true }).count()) === 0) {
      return;
    }
  }

  throw new Error(`Не удалось удалить тег «${name}»`);
}

// ---------------------------------------------------------------------------
// Выборка
// ---------------------------------------------------------------------------

/**
 * Создаёт выборку с условием «Пол» = «Мужчины» (в интерфейсе Saby —
 * «Мужчины», бизнес-значение сценария — «Мужской»).
 */
export async function createSelection(page: Page, name: string): Promise<void> {
  await openContacts(page);
  await openAddMenu(page, 'Выборку');

  const panel = page.locator('[data-qa="SelectionPanelExt-Popup__container"]');
  await expect(panel).toBeVisible({ timeout: 30_000 });

  await page.locator('[data-qa="filter_item__gender"]').click();
  const male = page.locator('#popup').getByText('Мужчины', { exact: true }).filter({ visible: true }).first();
  await expect(male).toBeVisible({ timeout: 10_000 });
  await male.click({ force: true });
  await expect(panel).toContainText('Мужчины');

  const nameInput = page.locator('[data-qa="SelectionPanel-Popup__name"] input');
  await nameInput.click();
  await nameInput.fill(name);
  await expect(nameInput).toHaveValue(name);

  await page.locator('[data-qa="SelectionPanel-Popup__saveButton"]').click();
  await expect(panel).toBeHidden({ timeout: 60_000 });
}

export async function deleteSelectionByName(page: Page, name: string): Promise<void> {
  await openContacts(page);
  const item = page.getByText(name, { exact: true }).filter({ visible: true }).first();
  if (!(await item.isVisible().catch(() => false))) return;

  await item.click({ button: 'right' });
  const menu = visibleMenu(page);
  await expect(menu).toBeVisible();
  await menu.getByText('Удалить', { exact: true }).filter({ visible: true }).first().click();
  await confirmDeletion(page, /Удалить выборку/);
  await expect(item).toBeHidden({ timeout: 30_000 });
}
