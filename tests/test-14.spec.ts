import { expect, test } from '@playwright/test';
import { CARD_STORAGE_STATE } from './support/constants';
import {
  NEW_CARD_MODES,
  NEW_CARD_PERSON,
  NEW_CARD_TABS_BY_MODE,
  closeNewCard,
  createEmptyNewCardIndividual,
  deleteNewCardIndividual,
  dragNewCardToWidth,
  expectFilledNewCardData,
  expectNewCardMode,
  expectNewCardTabBuilt,
  getNewCardMode,
  newCardModeNames,
  newCardRoot,
  newCardTabNames,
  openNewCardForPerson,
  reopenNewCard,
  selectNewCardMode,
  selectNewCardTab,
  selectedNewCardModes,
  type NewCardTab,
} from './support/new-individual-card';

test.use({ storageState: CARD_STORAGE_STATE });

// В основном job'е сессия пользователя с фичей не создаётся: сценарии
// новой карточки выполняются отдельным job'ом.
test.skip(
  process.env.SABY_SETUP_CARD === '0',
  'Сценарии новой карточки выполняются отдельным job',
);

/**
 * Новая карточка ФЛ под фичей crm_new_individual.
 *
 * Сценарии работают под отдельным пользователем: у основного пользователя
 * фича выключена. Оригинальный контакт «Проверка Карточки Физика» не
 * изменяется; пустая карточка создаётся и удаляется внутри сценария.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Новая карточка ФЛ @new-card', () => {
  let createdIndividual: string | undefined;

  test.afterEach(async ({ page }) => {
    const name = createdIndividual;
    createdIndividual = undefined;
    if (name) {
      await deleteNewCardIndividual(page, name).catch(() => undefined);
    }
  });

  test('Показывает данные «Проверка Карточки Физика» во всех режимах', async ({ page }) => {
    test.setTimeout(180_000);
    await openNewCardForPerson(page);

    for (const mode of NEW_CARD_MODES) {
      await selectNewCardMode(page, mode);
      await expectNewCardMode(page, mode);

      const tab: NewCardTab = mode === 'Справа' ? 'О клиенте' : 'Параметры';
      await selectNewCardTab(page, mode, tab);
      await expectFilledNewCardData(page);
    }
  });

  test('Переключает режим при изменении ширины карточки', async ({ page }) => {
    test.setTimeout(180_000);
    await openNewCardForPerson(page);
    await selectNewCardMode(page, 'Колонки');

    await dragNewCardToWidth(page, 700);
    await expect.poll(() => getNewCardMode(page), { timeout: 15_000 }).toBe('В строку');
    await expectNewCardMode(page, 'В строку');
    expect(await selectedNewCardModes(page)).toEqual(['В строку']);
    await expect(newCardRoot(page)).toContainText(NEW_CARD_PERSON);

    await dragNewCardToWidth(page, 1000);
    await expect.poll(() => getNewCardMode(page), { timeout: 15_000 }).toBe('Колонки');
    await expectNewCardMode(page, 'Колонки');
    expect(await selectedNewCardModes(page)).toEqual(['Колонки']);
  });

  test('Запоминает режим после закрытия и повторного открытия', async ({ page }) => {
    test.setTimeout(240_000);
    await openNewCardForPerson(page);

    for (const mode of NEW_CARD_MODES) {
      await selectNewCardMode(page, mode);
      await closeNewCard(page);
      await reopenNewCard(page);
      await expectNewCardMode(page, mode);
    }

    await closeNewCard(page);
  });

  test('Показывает список режимов в окне навигации', async ({ page }) => {
    test.setTimeout(120_000);
    await openNewCardForPerson(page);
    expect(await newCardModeNames(page)).toEqual([...NEW_CARD_MODES]);
  });

  test('Строит каждую вкладку в каждом режиме', async ({ page }) => {
    test.setTimeout(300_000);
    await openNewCardForPerson(page);

    for (const mode of NEW_CARD_MODES) {
      await selectNewCardMode(page, mode);
      expect(await newCardTabNames(page, mode)).toEqual(NEW_CARD_TABS_BY_MODE[mode]);

      for (const tab of NEW_CARD_TABS_BY_MODE[mode]) {
        await expectNewCardTabBuilt(page, mode, tab);
      }
    }
  });

  test('Строит вкладку после изменения режима', async ({ page }) => {
    test.setTimeout(240_000);
    await openNewCardForPerson(page);

    await selectNewCardMode(page, 'Колонки');
    await expectNewCardTabBuilt(page, 'Колонки', 'Покупки');

    await selectNewCardMode(page, 'В строку');
    await expectNewCardTabBuilt(page, 'В строку', 'Параметры');

    await selectNewCardMode(page, 'Справа');
    await expectNewCardTabBuilt(page, 'Справа', 'Документы');

    await selectNewCardMode(page, 'Колонки');
    await expectNewCardTabBuilt(page, 'Колонки', 'Активности');
  });

  test('Строит все вкладки пустой карточки', async ({ page }) => {
    test.setTimeout(300_000);
    const name = `АТ Пустая Карточка ${Date.now().toString().slice(-6)}`;
    createdIndividual = name;

    await createEmptyNewCardIndividual(page, name);
    await openNewCardForPerson(page, name);

    for (const mode of NEW_CARD_MODES) {
      await selectNewCardMode(page, mode);
      expect(await newCardTabNames(page, mode)).toEqual(NEW_CARD_TABS_BY_MODE[mode]);

      for (const tab of NEW_CARD_TABS_BY_MODE[mode]) {
        await expectNewCardTabBuilt(page, mode, tab);
      }
    }

    await deleteNewCardIndividual(page, name);
    createdIndividual = undefined;
  });

  test('Обновляет маркер режима в окне навигации при ручном переключении', async ({ page }) => {
    test.setTimeout(180_000);
    await openNewCardForPerson(page);
    await selectNewCardMode(page, 'Колонки');
    expect(await selectedNewCardModes(page)).toEqual(['Колонки']);

    for (const mode of NEW_CARD_MODES) {
      await selectNewCardMode(page, mode);
      await expectNewCardMode(page, mode);
      expect(await selectedNewCardModes(page)).toEqual([mode]);
    }
  });
});
