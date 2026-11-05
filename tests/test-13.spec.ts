import { test, expect } from '@playwright/test';
import {
  closeFormulaEditor,
  closeOutcomePanel,
  closeThemeStageSettings,
  copyTheme,
  deleteCurrentTheme,
  deleteThemeByName,
  discardThemeDraft,
  dismissThemeInfoBox,
  editFormulaCode,
  expectCodeEditorHasNoErrors,
  getFormulaUuid,
  openThemeByName,
  openThemeFormula,
  openThemeOutcome,
  openThemeSection,
  openThemes,
  openThemeStageSettings,
  readStageInstruction,
  readThemeFormulaUuid,
  readThemeParameters,
  replaceThemeName,
  saveFormula,
  saveThemeDraft,
  startThemeCopy,
} from './support/ui';

const SOURCE_THEME = 'Проверка СПК';
const STAGE_NAME = 'Код при копировании';
const OUTCOME_NAME = 'Итоги пользователя';
const ORIGINAL_CODE = 'var test = 1;';
const UPDATED_CODE = 'var test = 2;';

const uniqueSuffix = (): string =>
  new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

/**
 * Сценарии копирования темы «Проверка СПК».
 *
 * Оригинальная тема используется как эталон и не изменяется. Все копии
 * получают уникальное имя и удаляются после проверки.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Копирование темы «Проверка СПК»', () => {
  let createdThemes: string[] = [];

  test.afterEach(async ({ page }) => {
    const themes = createdThemes;
    createdThemes = [];
    for (const theme of themes) {
      await deleteThemeByName(page, theme);
    }
  });

  test('Проверяет код этапа, итоги, формы, параметры и доп. поля копии', async ({ page }) => {
    test.setTimeout(420_000);
    const copyName = `АТ Копия СПК ${uniqueSuffix()}`;
    createdThemes = [copyName];

    // Эталонные параметры снимаем с оригинала до копирования.
    await openThemeByName(page, SOURCE_THEME);
    await openThemeSection(page, 'Параметры');
    const originalParameters = await readThemeParameters(page);

    await openThemes(page);
    await copyTheme(page, SOURCE_THEME, copyName);
    await expect(
      page.getByText(copyName, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();

    // Карточка этапа «Код при копировании».
    const { dialog, codeEditor } = await openThemeStageSettings(page, STAGE_NAME);
    await expect(codeEditor).toContainText(ORIGINAL_CODE);
    await expect(codeEditor).toContainText('return test;');
    await expectCodeEditorHasNoErrors(dialog);
    await closeThemeStageSettings(page, dialog);

    // Итог «Итоги пользователя» и формула видимости перехода.
    await openThemeOutcome(page, OUTCOME_NAME);
    const { codeEditor: formulaEditor } = await openThemeFormula(page);
    await expect(formulaEditor).toContainText(ORIGINAL_CODE);
    await expect(formulaEditor).toContainText('return test;');
    await expectCodeEditorHasNoErrors(page);
    const formulaUuid = await getFormulaUuid(page);
    expect(formulaUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    await closeFormulaEditor(page);
    await closeOutcomePanel(page);

    // Документы и формы: после копирования форма должна отображаться.
    await openThemeSection(page, 'Документы и формы');
    await expect(
      page.getByText('для копирования', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();

    // Параметры копии совпадают с оригиналом.
    await openThemeSection(page, 'Параметры');
    const copyParameters = await readThemeParameters(page);
    expect(copyParameters).toBe(originalParameters);

    // Доп. поля: папки и поля доступны, редактора кода на вкладке нет.
    await openThemeSection(page, 'Доп. поля');
    for (const text of [
      'Папка для копирования',
      'Пустое в папке',
      'Число',
      'Папка для группы',
      'Тестовое поле',
      'Булево',
    ]) {
      await expect(
        page.getByText(text, { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
    }
    await expect(page.getByText('Да', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.locator('.CodeMirror').filter({ visible: true })).toHaveCount(0);

    // Удаляем созданную копию.
    await deleteCurrentTheme(page);
    createdThemes = [];
    await expect(
      page.getByText(copyName, { exact: true }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 60_000 });
  });

  test('Изменяет код копии, проверяет уникальный UUID и независимость оригинала', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    const copyName = `АТ Копия СПК ${uniqueSuffix()}`;
    createdThemes = [copyName];

    await openThemes(page);
    await copyTheme(page, SOURCE_THEME, copyName);

    // UUID и исходный код копии.
    await openThemeOutcome(page, OUTCOME_NAME);
    let { codeEditor } = await openThemeFormula(page);
    await expect(codeEditor).toContainText(ORIGINAL_CODE);
    const copyUuid = await getFormulaUuid(page);
    expect(copyUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    // Меняем код копии и сохраняем изменения.
    await editFormulaCode(page, `${UPDATED_CODE} return test;`);
    await saveFormula(page);
    await page.waitForTimeout(2_000);
    await closeFormulaEditor(page);
    await closeOutcomePanel(page);

    // Повторное открытие копии подтверждает сохранение нового кода.
    await openThemeOutcome(page, OUTCOME_NAME);
    ({ codeEditor } = await openThemeFormula(page));
    await expect(codeEditor).toContainText(UPDATED_CODE);
    await expect(codeEditor).not.toContainText(ORIGINAL_CODE);
    const copyUuidAfter = await getFormulaUuid(page);
    expect(copyUuidAfter).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    await closeFormulaEditor(page);
    await closeOutcomePanel(page);

    // Оригинал не изменился, его UUID отличается от UUID копии.
    await openThemeByName(page, SOURCE_THEME);
    await openThemeOutcome(page, OUTCOME_NAME);
    ({ codeEditor } = await openThemeFormula(page));
    await expect(codeEditor).toContainText(ORIGINAL_CODE);
    await expect(codeEditor).not.toContainText(UPDATED_CODE);
    const originalUuid = await getFormulaUuid(page);
    expect(originalUuid).not.toBe(copyUuid);
    expect(originalUuid).not.toBe(copyUuidAfter);
    await closeFormulaEditor(page);
    await closeOutcomePanel(page);

    // Удаляем копию, оригинал оставляем без изменений.
    await deleteThemeByName(page, copyName);
    createdThemes = [];
    await expect(
      page.getByText(copyName, { exact: true }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 60_000 });
  });

  test('Проверяет валидацию имени при копировании темы', async ({ page }) => {
    test.setTimeout(300_000);

    // Пустое имя.
    await openThemes(page);
    await startThemeCopy(page, SOURCE_THEME);
    await replaceThemeName(page, '');
    await saveThemeDraft(page);
    await expect(
      page
        .getByText('Поле обязательно для заполнения', { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    await discardThemeDraft(page);

    // Имя только из пробелов.
    await openThemes(page);
    await startThemeCopy(page, SOURCE_THEME);
    await replaceThemeName(page, '   ');
    await saveThemeDraft(page);
    await expect(
      page
        .getByText('Создавать темы отношений без названия - запрещено!', { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    await dismissThemeInfoBox(page);
    await discardThemeDraft(page);

    // Имя уже существующей темы.
    await openThemes(page);
    await startThemeCopy(page, SOURCE_THEME);
    await saveThemeDraft(page);
    await expect(
      page
        .getByText('Регламент с таким названием уже существует', { exact: true })
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 30_000 });
    await dismissThemeInfoBox(page);
    await discardThemeDraft(page);

    // В реестре осталась только оригинальная тема.
    await openThemes(page);
    await expect(
      page.locator('[data-qa="row"]').filter({ hasText: SOURCE_THEME }),
    ).toHaveCount(1);
  });

  test('Проверяет уникальные UUID у двух копий и оригинала', async ({ page }) => {
    test.setTimeout(420_000);
    const suffix = uniqueSuffix();
    const copyA = `АТ Копия СПК A ${suffix}`;
    const copyB = `АТ Копия СПК B ${suffix}`;
    createdThemes = [copyA, copyB];

    await openThemes(page);
    await copyTheme(page, SOURCE_THEME, copyA);
    const uuidA = await readThemeFormulaUuid(page, copyA);

    await openThemes(page);
    await copyTheme(page, SOURCE_THEME, copyB);
    const uuidB = await readThemeFormulaUuid(page, copyB);

    const originalUuid = await readThemeFormulaUuid(page, SOURCE_THEME);

    expect(uuidA).not.toBe(uuidB);
    expect(uuidA).not.toBe(originalUuid);
    expect(uuidB).not.toBe(originalUuid);

    await deleteThemeByName(page, copyA);
    await deleteThemeByName(page, copyB);
    createdThemes = [];
    await expect(
      page.getByText(copyA, { exact: true }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 60_000 });
    await expect(
      page.getByText(copyB, { exact: true }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 60_000 });
  });

  test('Проверяет настройки итога «Отрицательно» без ошибок', async ({ page }) => {
    test.setTimeout(180_000);
    await openThemeByName(page, SOURCE_THEME);
    await openThemeOutcome(page, 'Отрицательно', 'Перевести на этап');

    await expect(
      page.getByText('Действия', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('Перевести на этап', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
    // У отрицательного итога в этой теме нет условия «Формула видимости перехода».
    await expect(
      page
        .getByText('Формула видимости перехода', { exact: true })
        .filter({ visible: true }),
    ).toHaveCount(0);
    await expect(page.locator('.CodeMirror').filter({ visible: true })).toHaveCount(0);

    await closeOutcomePanel(page, 'Отрицательно');
  });

  test('Переносит инструкцию этапа и вложения в копию', async ({ page }) => {
    test.setTimeout(300_000);
    const copyName = `АТ Копия СПК Инструкция ${uniqueSuffix()}`;
    createdThemes = [copyName];

    // Инструкция оригинала.
    await openThemeByName(page, SOURCE_THEME);
    let { dialog } = await openThemeStageSettings(page, STAGE_NAME);
    const originalInstruction = await readStageInstruction(dialog);
    await expect(
      dialog.locator('[data-qa="docview3-AddButton"]').filter({ visible: true }).first(),
    ).toBeVisible();
    await closeThemeStageSettings(page, dialog);

    // Инструкция и вложения копии.
    await openThemes(page);
    await copyTheme(page, SOURCE_THEME, copyName);
    ({ dialog } = await openThemeStageSettings(page, STAGE_NAME));
    const copyInstruction = await readStageInstruction(dialog);
    expect(copyInstruction.text).toBe(originalInstruction.text);
    expect(copyInstruction.attachments).toBe(originalInstruction.attachments);
    await expect(
      dialog.locator('[data-qa="docview3-AddButton"]').filter({ visible: true }).first(),
    ).toBeVisible();
    await expectCodeEditorHasNoErrors(dialog);
    await closeThemeStageSettings(page, dialog);

    await deleteThemeByName(page, copyName);
    createdThemes = [];
    await expect(
      page.getByText(copyName, { exact: true }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 60_000 });
  });
});
