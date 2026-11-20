import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import {
  INDIVIDUAL_IMPORT_HEADERS,
  cancelImport,
  deleteImportedClients,
  expectImportFailed,
  expectImportedIndividualCard,
  expectNoClient,
  importMappingValues,
  importedFullName,
  individualImportRow,
  makeImportedIndividual,
  mapImportColumn,
  openIndividualImport,
  readImportErrorReport,
  startImport,
  switchImportToPhysicalPerson,
  writeImportWorkbook,
} from './support/individual-import';
import { openContacts, openWorkspace } from './support/ui';
import { CLIENTS_URL } from './support/constants';

async function expectMappingColumns(page: Parameters<typeof importMappingValues>[0], count: number) {
  await expect
    .poll(async () => (await importMappingValues(page)).length, { timeout: 30_000 })
    .toBe(count);
}

/**
 * Импорт физических лиц из Excel:
 * «Клиенты» → (+) → «Загрузить» → «Из файла» → «Физическое лицо» →
 * сопоставление столбцов → «Загрузить».
 *
 * Тесты изменяют общий реестр клиентов, поэтому выполняются последовательно.
 * Каждая строка получает уникальные ФИО, телефон и email; после теста
 * созданные карточки удаляются через реестр «Контактные лица».
 */
test.describe.configure({ mode: 'serial' });

test.describe('Импорт физических лиц из Excel @import', () => {
  const createdQueries: string[] = [];

  test.afterEach(async ({ page }) => {
    const queries = createdQueries.splice(0);
    if (!queries.length) return;

    await deleteImportedClients(page, queries).catch((error) => {
      console.warn(`[import] Не удалось удалить тестовые записи: ${error}`);
    });
  });

  test('Импорт одной строки: сопоставление столбцов и все поля в карточке', async ({
    page,
  }, testInfo) => {
    test.setTimeout(300_000);

    const person = makeImportedIndividual({ gender: 'Женский' });
    createdQueries.push(importedFullName(person));

    const file = await writeImportWorkbook(
      testInfo.outputPath('individual-import.xlsx'),
      INDIVIDUAL_IMPORT_HEADERS,
      [individualImportRow(person)],
    );

    await openIndividualImport(page, file);
    await switchImportToPhysicalPerson(page);
    await expectMappingColumns(page, 8);

    await mapImportColumn(page, 3, 'Мобильный телефон');
    await mapImportColumn(page, 4, 'Электронная почта');
    await mapImportColumn(page, 7, 'Примечание');

    await startImport(page);
    // Успешность импорта подтверждаем появлением карточки в реестре:
    // уведомление может переиспользоваться и не быть надёжным сигналом.
    await expectImportedIndividualCard(page, person);
  });

  test('Импорт двух строк создаёт две карточки с независимыми данными', async ({
    page,
  }, testInfo) => {
    test.setTimeout(360_000);

    const first = makeImportedIndividual({
      firstName: 'Первый',
      middleName: 'Тестович',
      gender: 'Мужской',
      note: 'Первая строка импорта',
    });
    const second = makeImportedIndividual({
      firstName: 'Вторая',
      middleName: 'Тестовна',
      gender: 'Женский',
      note: 'Вторая строка импорта',
    });
    createdQueries.push(importedFullName(first), importedFullName(second));

    const file = await writeImportWorkbook(
      testInfo.outputPath('individual-import-two-rows.xlsx'),
      INDIVIDUAL_IMPORT_HEADERS,
      [individualImportRow(first), individualImportRow(second)],
    );

    await openIndividualImport(page, file);
    await switchImportToPhysicalPerson(page);
    await expectMappingColumns(page, 8);

    await mapImportColumn(page, 3, 'Мобильный телефон');
    await mapImportColumn(page, 4, 'Электронная почта');
    await mapImportColumn(page, 7, 'Примечание');

    await startImport(page);

    await expectImportedIndividualCard(page, first);

    // Закрываем первую карточку переходом в реестр и проверяем вторую строку.
    await openWorkspace(page, CLIENTS_URL);
    await expectImportedIndividualCard(page, second);
  });

  test('Закрытие мастера импорта без загрузки не создаёт карточку', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);

    const person = makeImportedIndividual({ note: 'Импорт отменён' });
    createdQueries.push(importedFullName(person));

    const file = await writeImportWorkbook(
      testInfo.outputPath('individual-import-cancel.xlsx'),
      INDIVIDUAL_IMPORT_HEADERS,
      [individualImportRow(person)],
    );

    await openIndividualImport(page, file);
    await switchImportToPhysicalPerson(page);
    await expectMappingColumns(page, 8);

    await cancelImport(page);
    await page.waitForTimeout(2_000);
    await expectNoClient(page, importedFullName(person));
  });

  test('Строка без ФИО не импортируется и показывает ошибку', async ({
    page,
  }, testInfo) => {
    test.setTimeout(180_000);

    const person = makeImportedIndividual({
      lastName: '',
      firstName: '',
      middleName: '',
      note: '',
    });
    createdQueries.push(person.email);

    const file = await writeImportWorkbook(
      testInfo.outputPath('individual-import-no-name.xlsx'),
      ['Фамилия', 'Имя', 'Телефон', 'E-mail'],
      [[person.lastName, person.firstName, person.phone, person.email]],
    );

    await openIndividualImport(page, file);
    await switchImportToPhysicalPerson(page);
    await expectMappingColumns(page, 4);

    await mapImportColumn(page, 2, 'Мобильный телефон');
    await mapImportColumn(page, 3, 'Электронная почта');

    await startImport(page);
    await expectImportFailed(page);

    await openContacts(page);
    await expectNoClient(page, person.email);
  });

  test('Некорректная дата рождения: ошибка импорта и файл с ошибками', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);

    const person = makeImportedIndividual({
      birthDate: '32.13.2020',
      note: 'Импорт с некорректной датой',
    });
    createdQueries.push(importedFullName(person));

    const file = await writeImportWorkbook(
      testInfo.outputPath('individual-import-bad-date.xlsx'),
      INDIVIDUAL_IMPORT_HEADERS,
      [individualImportRow(person)],
    );

    await openIndividualImport(page, file);
    await switchImportToPhysicalPerson(page);
    await expectMappingColumns(page, 8);

    await startImport(page);
    const notification = await expectImportFailed(page);

    // На fix ссылка на файл ошибок есть прямо в уведомлении, на test —
    // через «Журнал» выполнения импорта. Поддерживаем оба варианта.
    const directLink = notification
      .getByText('Скачать файл с ошибками', { exact: true })
      .filter({ visible: true })
      .first();
    const journal = notification.getByText('Журнал', { exact: true }).filter({ visible: true }).first();

    const journalOpened = await journal.isVisible().catch(() => false);
    if (journalOpened) {
      // Журнал операции заполняется асинхронно уже после статуса «Есть ошибки».
      await page.waitForTimeout(5_000);
      await journal.click();
      await expect(page.getByText('Журнал выполнения', { exact: true }).first()).toBeVisible({
        timeout: 30_000,
      });
    }

    const downloadLink = (await directLink.isVisible().catch(() => false))
      ? directLink
      : page.getByText('Скачать файл', { exact: true }).filter({ visible: true }).first();
    await expect(downloadLink).toBeVisible({ timeout: 60_000 });

    const reportPath = testInfo.outputPath('import-errors.xlsx');
    const downloadByEvent = async (): Promise<void> => {
      const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
      await downloadLink.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe('Ошибки импорта.xlsx');
      await download.saveAs(reportPath);
    };

    if (journalOpened) {
      // На test журнал ведёт на подписанную ссылку test-go; download-event
      // для неё нестабилен, поэтому забираем файл запросом.
      const href = await downloadLink.evaluate((element) => element.closest('a')?.href ?? null);
      if (href && /^https?:/i.test(href)) {
        const response = await page.request.get(href);
        expect(response.ok()).toBeTruthy();
        await writeFile(reportPath, await response.body());
      } else {
        await downloadByEvent();
      }
    } else {
      // На fix ссылка в уведомлении скачивается обычным download-event.
      await downloadByEvent();
    }

    const report = await readImportErrorReport(reportPath);

    expect(report.headers).toEqual(['Лист', 'Строка', 'Ошибка']);
    const errorRow = report.rows.find((row) => row.error.includes('32.13.2020'));
    expect(errorRow).toBeTruthy();
    expect(errorRow?.sheet).toBe('Лист1');
    expect(errorRow?.row).toBe('2');
    expect(errorRow?.error).toContain('"Дата рождения"');
    expect(errorRow?.error).toContain('заполнено некорректно');

    await openContacts(page);
    await expectNoClient(page, importedFullName(person));
  });
});
