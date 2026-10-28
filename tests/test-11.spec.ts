import { test, expect } from '@playwright/test';
import { EMPTY_STORAGE_STATE } from './support/constants';
import {
  cardBody,
  deleteCurrentIndividual,
  deleteIndividualByQuery,
  openContacts,
  workspace,
  type IndividualDraft,
} from './support/ui';
import {
  createContactPerson,
  createFolder,
  createOrganization,
  createSelection,
  createTag,
  createTemporaryIndividual,
  deleteContactPersonByName,
  deleteFolderByName,
  deleteOrganizationByName,
  deleteSelectionByName,
  deleteTagByName,
  expectContactsPageEmpty,
  expectEmptyContactsContent,
  expectEmptyContactsScreenshot,
  expectEmptyPlaceholderLayout,
  uniqueSuffix,
} from './support/unified-contacts';

/**
 * Проверки под пустым пользователем «Пустой44».
 *
 * Каждый тест создаёт только свои данные с уникальным суффиксом и удаляет их
 * в конце. Финальная проверка — страница снова показывает заглушку
 * «Здесь будет ваш контакт-лист», а тестовых записей не осталось.
 *
 * Тесты выполняются последовательно: они работают с одним и тем же аккаунтом
 * и общим реестром, параллельный запуск создал бы гонки за список и фильтры.
 */
test.describe.configure({ mode: 'serial' });
test.use({ storageState: EMPTY_STORAGE_STATE });

let personToDelete: string | undefined;
let contactToDelete: string | undefined;
let organizationToDelete: string | undefined;
let folderToDelete: string | undefined;
let probeToDelete: string | undefined;
let tagToDelete: string | undefined;
let selectionToDelete: string | undefined;

async function bestEffort(label: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.warn(`[cleanup] ${label}:`, error);
  }
}

test.afterEach(async ({ page }) => {
  const person = personToDelete;
  const contact = contactToDelete;
  const organization = organizationToDelete;
  const folder = folderToDelete;
  const probe = probeToDelete;
  const tag = tagToDelete;
  const selection = selectionToDelete;

  personToDelete = undefined;
  contactToDelete = undefined;
  organizationToDelete = undefined;
  folderToDelete = undefined;
  probeToDelete = undefined;
  tagToDelete = undefined;
  selectionToDelete = undefined;

  if (folder) await bestEffort('папка', () => deleteFolderByName(page, folder));
  if (selection) await bestEffort('выборка', () => deleteSelectionByName(page, selection));
  if (tag) await bestEffort('тег', () => deleteTagByName(page, tag));
  if (contact) await bestEffort('контактное лицо', () => deleteContactPersonByName(page, contact));
  if (organization) await bestEffort('организация', () => deleteOrganizationByName(page, organization));
  if (probe) await bestEffort('временный контакт', () => deleteIndividualByQuery(page, probe));
  if (person) await bestEffort('физическое лицо', () => deleteIndividualByQuery(page, person));
});

test.describe('Контактные лица — пустой пользователь', { tag: '@empty-user' }, () => {
  test('Заглушка пустого контакт-листа: скриншот и положение', async ({ page }) => {
    test.setTimeout(120_000);

    await openContacts(page);
    await expectEmptyContactsContent(page);
    await expectEmptyPlaceholderLayout(page);
    await expectEmptyContactsScreenshot(page);
  });

  test('Создаёт физическое лицо и удаляет его', async ({ page }) => {
    test.setTimeout(180_000);
    const suffix = uniqueSuffix();
    const lastName = `АТФЛ${suffix}`;
    const draft: IndividualDraft = {
      lastName,
      firstName: 'Тест',
      phone: '9991234567',
    };
    personToDelete = lastName;

    await createTemporaryIndividual(page, draft);
    await expect(
      page.getByText('+7 (999) 123-45-67', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();

    await page.getByText(lastName, { exact: false }).filter({ visible: true }).first().click();
    await expect(page.locator('.crm_IndividualCard__tabsArea')).toBeVisible({ timeout: 30_000 });
    await expect(cardBody(page)).toContainText(lastName);
    await expect(cardBody(page)).toContainText('+7 (999) 123-45-67');

    await deleteCurrentIndividual(page);
    await expect(page.locator('.crm_IndividualCard__tabsArea'))
      .toBeHidden({ timeout: 30_000 })
      .catch(() => undefined);
    await expect(
      page.getByText(lastName, { exact: false }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 30_000 });
    personToDelete = undefined;

    await expectContactsPageEmpty(page);
  });

  test('Создаёт контактное лицо и удаляет его', async ({ page }) => {
    test.setTimeout(240_000);
    const suffix = uniqueSuffix();
    const organization = `АТОрг${suffix}`;
    const lastName = `АТКонтакт${suffix}`;
    organizationToDelete = organization;

    // Контактное лицо в Saby обязательно привязано к организации,
    // поэтому организация создаётся как временное предусловие.
    await createOrganization(page, organization);
    contactToDelete = lastName;

    await createContactPerson(page, {
      lastName,
      firstName: 'Тест',
      phone: '9991112233',
      organization,
    });
    await expect(
      page.getByText(organization, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();

    await deleteContactPersonByName(page, lastName);
    contactToDelete = undefined;

    await deleteOrganizationByName(page, organization);
    organizationToDelete = undefined;

    await expectContactsPageEmpty(page);
  });

  test('Создаёт папку и удаляет её', async ({ page }) => {
    test.setTimeout(240_000);
    const suffix = uniqueSuffix();
    const folder = `АТПапка${suffix}`;
    const probe = `АТПроба${suffix}`;
    folderToDelete = folder;

    await createFolder(page, folder);

    // В пустом реестре мастер-панель с папками скрыта: временный контакт
    // нужен только для того, чтобы папка стала видимой и её можно было удалить.
    probeToDelete = probe;
    await createTemporaryIndividual(page, { lastName: probe, firstName: 'Тест', phone: '9990001122' });

    const folderItem = page.getByText(folder, { exact: true }).filter({ visible: true }).first();
    await expect(folderItem).toBeVisible({ timeout: 30_000 });

    const workspaceBox = await workspace(page).boundingBox();
    const folderBox = await folderItem.boundingBox();
    expect(workspaceBox, 'Рабочая область должна быть видима').not.toBeNull();
    expect(folderBox, 'Папка должна быть видима в мастер-панели').not.toBeNull();
    if (workspaceBox && folderBox) {
      expect(folderBox.x).toBeLessThan(workspaceBox.x + workspaceBox.width / 2);
    }

    await deleteFolderByName(page, folder);
    folderToDelete = undefined;

    await deleteIndividualByQuery(page, probe);
    probeToDelete = undefined;

    await expectContactsPageEmpty(page);
  });

  test('Создаёт тег и удаляет его', async ({ page }) => {
    test.setTimeout(180_000);
    const suffix = uniqueSuffix();
    const tag = `АТТег${suffix}`;
    tagToDelete = tag;

    await createTag(page, tag);
    await expect(
      page.locator('[data-qa="crm-MyContacts__tags"]').getByText(tag, { exact: true }),
    ).toBeVisible();

    await deleteTagByName(page, tag);
    tagToDelete = undefined;

    await expectContactsPageEmpty(page);
  });

  test('Создаёт выборку с фильтром «Пол» = «Мужской» и удаляет её', async ({ page }) => {
    test.setTimeout(240_000);
    const suffix = uniqueSuffix();
    const selection = `АТВыборка${suffix}`;
    const probe = `АТПроба${suffix}`;
    selectionToDelete = selection;

    await createSelection(page, selection);

    // В пустом реестре мастер-панель с выборками скрыта: временный контакт
    // делает выборку видимой и позволяет проверить её в интерфейсе.
    probeToDelete = probe;
    await createTemporaryIndividual(page, {
      lastName: probe,
      firstName: 'Тест',
      phone: '9990001133',
    });

    const selectionItem = page.getByText(selection, { exact: true }).filter({ visible: true }).first();
    await expect(selectionItem).toBeVisible({ timeout: 30_000 });

    const workspaceBox = await workspace(page).boundingBox();
    const selectionBox = await selectionItem.boundingBox();
    expect(workspaceBox, 'Рабочая область должна быть видима').not.toBeNull();
    expect(selectionBox, 'Выборка должна быть видима в мастер-панели').not.toBeNull();
    if (workspaceBox && selectionBox) {
      expect(selectionBox.x).toBeLessThan(workspaceBox.x + workspaceBox.width / 2);
    }

    await deleteSelectionByName(page, selection);
    selectionToDelete = undefined;

    await deleteIndividualByQuery(page, probe);
    probeToDelete = undefined;

    await expectContactsPageEmpty(page);
  });
});
