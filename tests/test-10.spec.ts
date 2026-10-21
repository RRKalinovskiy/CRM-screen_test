import { test, expect } from '@playwright/test';
import {
  createTheme,
  deleteCurrentTheme,
  deleteThemeByName,
  editThemeStage,
  openThemes,
  saveTheme,
} from './support/ui';

const uniqueSuffix = (): string =>
  new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

/**
 * Сценарий создаёт реальную тему, меняет этап «Новый» и удаляет тему.
 * Уникальное имя и afterEach не дают оставить данные на общем стенде.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Новая тема — этап «Новый»', () => {
  let createdTheme: string | undefined;

  test.afterEach(async ({ page }) => {
    const theme = createdTheme;
    createdTheme = undefined;
    if (theme) {
      await deleteThemeByName(page, theme);
    }
  });

  test('Создаёт тему, открывает этап «Новый» и сохраняет его изменение', async ({ page }) => {
    test.setTimeout(120_000);
    const suffix = uniqueSuffix();
    const themeName = `АТ тема ${suffix}`;
    const stageName = `Новый АТ ${suffix}`;
    createdTheme = themeName;

    await createTheme(page, themeName);
    await expect(
      page.getByText(themeName, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
    await expect(
      page
        .locator('.controls-GridReact__row')
        .filter({ hasText: 'Новый' })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    await editThemeStage(page, 'Новый', stageName);
    await saveTheme(page);

    // Возвращаемся в реестр и открываем тему заново — проверяем сохранение этапа.
    await openThemes(page);
    await page.getByText(themeName, { exact: true }).filter({ visible: true }).first().click();
    await expect(
      page.getByText('Воронка продаж', { exact: true }).filter({ visible: true }).last(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page
        .locator('.controls-GridReact__row')
        .filter({ hasText: stageName })
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    await deleteCurrentTheme(page);
    createdTheme = undefined;
    await expect(
      page.getByText(themeName, { exact: true }).filter({ visible: true }),
    ).toHaveCount(0);
  });
});
