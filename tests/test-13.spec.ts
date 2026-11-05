import { test, expect } from '@playwright/test';
import {
  closeFormulaEditor,
  closeOutcomePanel,
  closeThemeStageSettings,
  copyTheme,
  deleteCurrentTheme,
  deleteThemeByName,
  editFormulaCode,
  expectCodeEditorHasNoErrors,
  getFormulaUuid,
  openThemeByName,
  openThemeFormula,
  openThemeOutcome,
  openThemeSection,
  openThemes,
  openThemeStageSettings,
  readThemeParameters,
  saveFormula,
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
  let createdTheme: string | undefined;

  test.afterEach(async ({ page }) => {
    const theme = createdTheme;
    createdTheme = undefined;
    if (theme) {
      await deleteThemeByName(page, theme);
    }
  });

  test('Проверяет код этапа, итоги, формы, параметры и доп. поля копии', async ({ page }) => {
    test.setTimeout(420_000);
    const copyName = `АТ Копия СПК ${uniqueSuffix()}`;
    createdTheme = copyName;

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
    createdTheme = undefined;
    await expect(
      page.getByText(copyName, { exact: true }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 60_000 });
  });

  test('Изменяет код копии, проверяет уникальный UUID и независимость оригинала', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    const copyName = `АТ Копия СПК ${uniqueSuffix()}`;
    createdTheme = copyName;

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
    createdTheme = undefined;
    await expect(
      page.getByText(copyName, { exact: true }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 60_000 });
  });
});
