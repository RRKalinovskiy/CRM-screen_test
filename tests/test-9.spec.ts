import { test, expect } from '@playwright/test';
import {
  cardBody,
  createEmptyIndividualCard,
  deleteCurrentIndividual,
  deleteIndividualByQuery,
  editFullIndividualCardNote,
  fillFullIndividualCard,
  fillIndividualMiniCard,
  openContactByQuery,
  openContacts,
  openFullIndividualCard,
  saveFullIndividualCard,
  saveMiniIndividualCard,
  type IndividualDraft,
} from './support/ui';

const uniqueSuffix = (): string =>
  new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17);

/**
 * Сценарий создаёт реальную запись ФЛ, поэтому:
 * - данные уникальны (суффикс времени), чтобы не зависеть от предыдущих прогонов;
 * - после проверки запись удаляется;
 * - afterEach удаляет её и при падении теста.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Карточка ФЛ — создание и редактирование', () => {
  let createdQuery: string | undefined;

  test.afterEach(async ({ page }) => {
    const query = createdQuery;
    createdQuery = undefined;
    if (query) {
      await deleteIndividualByQuery(page, query);
    }
  });

  test('Создаёт ФЛ в мини-карточке и заполняет полную карточку', async ({ page }) => {
    test.setTimeout(120_000);
    const suffix = uniqueSuffix();
    const draft: IndividualDraft = {
      lastName: `АТТест${suffix}`,
      firstName: 'Иван',
      middleName: 'Иванович',
      phone: '9991234567',
      contactNote: `Мини-карточка АТ ${suffix}`,
      birthDate: '01.01.1990',
      gender: 'Мужской',
      address: 'г. Москва, ул. Тестовая, д. 1',
      passportSeries: '1234',
      passportNumber: '567890',
      passportIssueDate: '01.01.2015',
      passportDepartmentCode: '770001',
      passportIssuer: 'ОВД Тестовое',
      birthPlace: 'Москва',
    };
    const fullNote = `Полная карточка АТ ${suffix}`;
    createdQuery = draft.lastName;

    await openContacts(page);
    await createEmptyIndividualCard(page);
    await fillIndividualMiniCard(page, draft);
    await saveMiniIndividualCard(page);

    await openContactByQuery(page, draft.lastName);

    const body = cardBody(page);
    for (const value of [
      draft.lastName,
      draft.firstName,
      'Иванович',
      '+7 (999) 123-45-67',
      draft.contactNote,
      '01.01.1990',
      'г. Москва, ул. Тестовая, д. 1',
      '12 34',
      '567890',
      '01.01.15',
      '770-001',
      'ОВД Тестовое',
      'Москва',
    ]) {
      await expect(body).toContainText(value!);
    }

    await editFullIndividualCardNote(page, fullNote);
    await expect(
      page.getByText(fullNote, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();

    // Повторный заход в карточку подтверждает, что изменение сохранилось.
    await openContacts(page);
    await openContactByQuery(page, draft.lastName);
    await expect(
      page.getByText(fullNote, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();

    await deleteCurrentIndividual(page);
    createdQuery = undefined;
    await expect(
      page.getByText(draft.lastName, { exact: false }).filter({ visible: true }),
    ).toHaveCount(0);
  });

  test('Создаёт ФЛ, переходит в полную карточку и сохраняет наполнение', async ({ page }) => {
    test.setTimeout(120_000);
    const suffix = uniqueSuffix();
    const draft: IndividualDraft = {
      lastName: `АТПолная${suffix}`,
      firstName: 'Пётр',
      middleName: 'Петрович',
      phone: '9995554433',
      contactNote: `Контактное примечание ${suffix}`,
      birthDate: '02.02.1991',
      gender: 'Мужской',
      address: 'г. Москва, ул. Полная, д. 2',
    };
    const fullNote = `Заполнено в полной карточке ${suffix}`;
    createdQuery = draft.lastName;

    await openContacts(page);
    await createEmptyIndividualCard(page);
    await openFullIndividualCard(page);
    await fillFullIndividualCard(page, draft, fullNote);
    await saveFullIndividualCard(page);

    const expected = [
      draft.lastName,
      draft.firstName,
      'Петрович',
      '+7 (999) 555-44-33',
      draft.contactNote,
      '02.02.1991',
      'г. Москва, ул. Полная, д. 2',
      fullNote,
    ];

    for (const value of expected) {
      await expect(cardBody(page)).toContainText(value!);
    }

    // Повторно открываем карточку из реестра — данные должны сохраниться.
    await openContacts(page);
    await openContactByQuery(page, draft.lastName);
    for (const value of expected) {
      await expect(cardBody(page)).toContainText(value!);
    }

    await deleteCurrentIndividual(page);
    createdQuery = undefined;
    await expect(
      page.getByText(draft.lastName, { exact: false }).filter({ visible: true }),
    ).toHaveCount(0);
  });
});
