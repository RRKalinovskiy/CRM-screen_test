import { expect, test } from '@playwright/test';
import { CARD_STORAGE_STATE } from './support/constants';
import {
  NEW_CARD_MODES,
  NEW_CARD_PERSON,
  NEW_CARD_TABS_BY_MODE,
  closeNewCard,
  countNewCardSalesRows,
  createEmptyNewCardIndividual,
  deleteNewCardIndividual,
  dragNewCardToWidth,
  expectFilledNewCardData,
  expectNewCardMode,
  expectNewCardTabBuilt,
  getNewCardMode,
  newCardModeNames,
  newCardPeriodPlate,
  newCardRoot,
  newCardTabNames,
  newCardWidth,
  openNewCardByLink,
  openNewCardForPerson,
  reopenNewCard,
  selectNewCardMode,
  selectNewCardTab,
  selectedNewCardModes,
  type NewCardTab,
} from './support/new-individual-card';
import { copyIndividualCardLink } from './support/ui';

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

  test('Не меняет ширину при переключении вкладок в режиме «Справа» после открытия по ссылке', async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    await openNewCardForPerson(page);

    const link = await copyIndividualCardLink(page);
    const newPage = await openNewCardByLink(context, link);

    try {
      await selectNewCardMode(newPage, 'Справа');
      const width = await newCardWidth(newPage);

      for (const tab of NEW_CARD_TABS_BY_MODE['Справа']) {
        await selectNewCardTab(newPage, 'Справа', tab);
        expect(Math.abs((await newCardWidth(newPage)) - width)).toBeLessThanOrEqual(1);
      }
    } finally {
      await newPage.close();
    }
  });

  test('При максимальной ширине включает «Колонки» и обновляет маркер', async ({ page }) => {
    test.setTimeout(180_000);
    await openNewCardForPerson(page);
    await selectNewCardMode(page, 'Справа');

    await dragNewCardToWidth(page, 1200);
    await expect.poll(() => getNewCardMode(page), { timeout: 15_000 }).toBe('Колонки');

    expect(await newCardWidth(page)).toBeGreaterThan(1000);
    expect(await selectedNewCardModes(page)).toEqual(['Колонки']);
  });

  test('Плашка периода в продажах не перекрывает правый список', async ({ page }) => {
    test.setTimeout(180_000);
    await openNewCardForPerson(page);
    await selectNewCardMode(page, 'Справа');
    await selectNewCardTab(page, 'Справа', 'Покупки');

    const period = newCardPeriodPlate(page);
    await expect(period).toBeVisible();

    const periodBox = await period.boundingBox();
    const masterBox = await newCardRoot(page)
      .locator('.controls-MasterDetail_master')
      .first()
      .boundingBox();
    const detailBox = await newCardRoot(page)
      .locator('.controls-MasterDetail_details')
      .first()
      .boundingBox();
    if (!periodBox || !masterBox || !detailBox) {
      throw new Error('Не удалось прочитать геометрию плашки периода');
    }

    // Плашка остаётся внутри блока продаж и не заходит на правый список вкладок.
    expect(periodBox.x).toBeGreaterThanOrEqual(detailBox.x);
    expect(periodBox.x + periodBox.width).toBeLessThanOrEqual(
      detailBox.x + detailBox.width + 1,
    );
    expect(periodBox.x + periodBox.width).toBeLessThanOrEqual(masterBox.x);
    expect(await countNewCardSalesRows(page)).toBe(20);
  });

  test('Не уменьшает карточку ниже 600px в режиме «Справа»', async ({ page }) => {
    test.setTimeout(180_000);
    await openNewCardForPerson(page);
    await selectNewCardMode(page, 'Справа');

    await dragNewCardToWidth(page, 600);
    await expect
      .poll(() => newCardWidth(page), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(599);
    const widthAtMin = await newCardWidth(page);
    expect(widthAtMin).toBeLessThanOrEqual(601);

    await selectNewCardTab(page, 'Справа', 'О клиенте');
    expect(await newCardWidth(page)).toBe(widthAtMin);

    // Дальнейшее перетаскивание вправо не должно уменьшать карточку ниже минимума.
    await dragNewCardToWidth(page, 400);
    await page.waitForTimeout(500);
    expect(await newCardWidth(page)).toBe(widthAtMin);
    await expectNewCardMode(page, 'Справа');
    await expect(newCardRoot(page)).toContainText('Гражданство');
  });

  test('Не дублирует загрузку продаж при переключении режимов', async ({ page }) => {
    test.setTimeout(240_000);
    const salesListRequests: string[] = [];
    page.on('request', (request) => {
      const body = request.postData() ?? '';
      if (
        body.includes('CRMActivity.listWithDocumentsEDO') &&
        body.includes('WithoutListEvents')
      ) {
        salesListRequests.push(body);
      }
    });

    await openNewCardForPerson(page);
    await page.waitForTimeout(1_000);
    const baseline = salesListRequests.length;

    await selectNewCardMode(page, 'В строку');
    await selectNewCardTab(page, 'В строку', 'Покупки');
    await expect
      .poll(() => salesListRequests.length - baseline, { timeout: 15_000 })
      .toBe(1);
    expect(await countNewCardSalesRows(page)).toBe(20);

    await selectNewCardMode(page, 'Справа');
    await selectNewCardTab(page, 'Справа', 'Покупки');
    await expect
      .poll(() => salesListRequests.length - baseline, { timeout: 15_000 })
      .toBe(2);
    expect(await countNewCardSalesRows(page)).toBe(20);

    await selectNewCardMode(page, 'Колонки');
    await selectNewCardTab(page, 'Колонки', 'Покупки');
    await expect
      .poll(() => salesListRequests.length - baseline, { timeout: 15_000 })
      .toBe(3);
    expect(await countNewCardSalesRows(page)).toBe(20);

    // Повторное открытие вкладки не должно вызывать метод ещё раз.
    await selectNewCardTab(page, 'Колонки', 'Покупки');
    await page.waitForTimeout(1_000);
    expect(salesListRequests.length - baseline).toBe(3);
    expect(await countNewCardSalesRows(page)).toBe(20);
  });
});
