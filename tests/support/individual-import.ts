import { expect, type Locator, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { CLIENTS_URL } from './constants';
import { openContacts, openWorkspace } from './ui';

/**
 * Хелперы импорта физических лиц из Excel через
 * «Клиенты» → (+) → «Загрузить» → «Из файла».
 */

export type ImportedIndividual = {
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  email: string;
  birthDate: string;
  gender: 'Мужской' | 'Женский';
  note: string;
};

export const INDIVIDUAL_IMPORT_HEADERS = [
  'Фамилия',
  'Имя',
  'Отчество',
  'Телефон',
  'E-mail',
  'Дата рождения',
  'Пол',
  'Комментарий',
] as const;

/**
 * После переключения на «Физическое лицо» Saby автоматически сопоставляет
 * столбцы, заголовки которых совпадают с полями карточки.
 */
export const AUTO_MAPPED_INDIVIDUAL_COLUMNS = [
  'Фамилия',
  'Имя',
  'Отчество',
  'Не задано',
  'Не задано',
  'Дата рождения',
  'Пол',
  'Не задано',
] as const;

export function uniqueImportSuffix(): string {
  const time = Date.now().toString().slice(-7);
  const random = Math.floor(Math.random() * 90 + 10);
  return `${time}${random}`;
}

export function makeImportedIndividual(
  overrides: Partial<ImportedIndividual> = {},
): ImportedIndividual {
  const suffix = uniqueImportSuffix();
  const digits = suffix.slice(-7).padStart(7, '0');

  return {
    lastName: `Импорт${suffix}`,
    firstName: 'Тест',
    middleName: 'Автоматический',
    phone: `+7 555 ${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`,
    email: `import.${suffix}@example.com`,
    birthDate: '05.06.1990',
    gender: 'Женский',
    note: `Импорт из Excel ${suffix}`,
    ...overrides,
  };
}

export function importedFullName(person: ImportedIndividual): string {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');
}

export function importedPhoneForCard(person: ImportedIndividual): string {
  const digits = person.phone.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('7') ? digits.slice(1) : digits;
  return `+7 (${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6, 8)}-${national.slice(8, 10)}`;
}

export function individualImportRow(person: ImportedIndividual): string[] {
  return [
    person.lastName,
    person.firstName,
    person.middleName,
    person.phone,
    person.email,
    person.birthDate,
    person.gender,
    person.note,
  ];
}

/** Создаёт xlsx-файл с заголовками и строками для мастера импорта. */
export async function writeImportWorkbook(
  path: string,
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<string>>,
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Лист1');
  sheet.addRow([...headers]);
  for (const row of rows) sheet.addRow([...row]);

  await mkdir(dirname(path), { recursive: true });
  await workbook.xlsx.writeFile(path);
  return path;
}

export type ImportErrorReport = {
  headers: string[];
  rows: Array<{ sheet: string; row: string; error: string }>;
};

/** Читает скачанный файл «Ошибки импорта.xlsx». */
export async function readImportErrorReport(path: string): Promise<ImportErrorReport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('В файле ошибок импорта нет листов');

  const headers = [1, 2, 3].map((column) => sheet.getRow(1).getCell(column).text);
  const rows: ImportErrorReport['rows'] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    rows.push({
      sheet: sheet.getRow(rowNumber).getCell(1).text,
      row: sheet.getRow(rowNumber).getCell(2).text,
      error: sheet.getRow(rowNumber).getCell(3).text,
    });
  }

  return { headers, rows };
}

const importDialog = (page: Page): Locator =>
  page.locator('[data-qa="import_Dialog"]').filter({ visible: true }).first();

const importMappingDropdowns = (page: Page): Locator =>
  page.locator('[data-qa="import_Dialog__tableHeaderDropdownSource"]').filter({ visible: true });

export async function importMappingValues(page: Page): Promise<string[]> {
  const values = await importMappingDropdowns(page).allInnerTexts();
  return values.map((value) => value.trim());
}

/** Ждёт, пока Saby уберёт глобальный preload-overlay, перекрывающий клики. */
async function waitForNoLoadingOverlay(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page
          .locator('[name="loadingOverlay"], .preload-overlay')
          .filter({ visible: true })
          .count(),
      { timeout: 60_000, message: 'Preload-overlay Saby не исчез' },
    )
    .toBe(0);
}

/** Открывает «Клиенты» → (+) → «Загрузить» → «Из файла» и передаёт файл. */
export async function openIndividualImport(page: Page, filePath: string): Promise<void> {
  await openWorkspace(page, CLIENTS_URL);
  await waitForNoLoadingOverlay(page);

  const addButton = page.locator('[data-qa="sabyPage-addButton"]').filter({ visible: true }).first();
  await expect(addButton).toBeVisible({ timeout: 30_000 });

  // В CI кнопка «+» иногда не открывает меню с первого клика: приложение
  // ещё дорисовывает панель. Повторяем клик, пока меню не появится.
  const addMenu = page.locator('.controls-Menu__popup').filter({ visible: true }).first();
  for (let attempt = 0; attempt < 3; attempt++) {
    if (await addMenu.isVisible().catch(() => false)) break;
    await waitForNoLoadingOverlay(page);
    await addButton.click({ timeout: 60_000 }).catch(() => undefined);
    await expect(addMenu).toBeVisible({ timeout: 15_000 }).catch(() => undefined);
  }
  await expect(addMenu).toBeVisible({ timeout: 30_000 });

  const upload = addMenu.getByText('Загрузить', { exact: true }).filter({ visible: true }).first();
  await expect(upload).toBeVisible({ timeout: 30_000 });

  // «Загрузить» — подменю. Наводим курсор, а если подменю не раскрылось,
  // кликаем: в разных состояниях Saby ведёт себя по-разному.
  await upload.hover();
  const fromFile = page.locator('[title="Из файла"]').filter({ visible: true }).first();
  if (!(await fromFile.isVisible().catch(() => false))) {
    await upload.click();
  }
  await expect(fromFile).toBeVisible({ timeout: 15_000 });

  // Пункт «Из файла» открывает системный выбор файла. Ловим filechooser,
  // чтобы не зависеть от того, появился ли в DOM скрытый input[type=file].
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 30_000 });
  await fromFile.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);

  await expect(importDialog(page)).toBeVisible({ timeout: 60_000 });

  // Уведомление об импорте переиспользуется для следующих операций и имеет
  // одинаковый заголовок. Закрываем завершённые уведомления прошлых импортов,
  // чтобы дождаться результата именно текущей операции.
  await dismissImportNotifications(page);
}

/** Переключает тип записей с «Компания» на «Физическое лицо». */
export async function switchImportToPhysicalPerson(page: Page): Promise<void> {
  const dialog = importDialog(page);
  const toggle = dialog.locator('[data-qa="controls-SwitchButton"]').filter({ visible: true }).first();
  const physical = dialog
    .locator('.controls-DoubleSwitch__text_enabled_selected, .controls-DoubleSwitch__text_enabled_unselected')
    .filter({ hasText: 'Физическое лицо' })
    .first();

  await expect(toggle).toBeVisible({ timeout: 30_000 });

  // Клик по подписи в CI иногда не срабатывает: переключаем сам тумблер,
  // затем проверяем, что подпись стала выбранной.
  for (let attempt = 0; attempt < 3; attempt++) {
    const className = (await physical.getAttribute('class')) ?? '';
    if (className.includes('controls-DoubleSwitch__text_enabled_selected')) break;

    await toggle.click({ timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
  }

  await expect(physical).toHaveClass(/controls-DoubleSwitch__text_enabled_selected/, {
    timeout: 30_000,
  });
}

/** Сопоставляет столбец Excel с полем карточки через выпадающий список. */
export async function mapImportColumn(page: Page, index: number, target: string): Promise<void> {
  const dropdown = importMappingDropdowns(page).nth(index);
  await expect(dropdown).toBeVisible();
  await dropdown.click();

  const menu = page.locator('.controls-Menu__popup').filter({ visible: true }).last();
  await expect(menu).toBeVisible();
  const item = menu.getByText(target, { exact: true }).filter({ visible: true }).first();
  await expect(item).toBeVisible();
  await item.click();

  await expect(dropdown).toContainText(target);
}

export async function startImport(page: Page): Promise<void> {
  const dialog = importDialog(page);
  const button = dialog
    .locator('[data-qa="import_Dialog__headerImportButton"]')
    .filter({ visible: true })
    .first();
  await expect(button).toBeVisible();
  await expect(button).toContainText('Загрузить');
  await button.click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
}

const importNotifications = (page: Page): Locator =>
  page
    .locator('.controls-Notification')
    .filter({ hasText: 'Загрузка записей из файла' })
    .filter({ visible: true });

async function dismissImportNotifications(page: Page): Promise<void> {
  const notifications = importNotifications(page);

  for (let pass = 0; pass < 2; pass++) {
    const count = await notifications.count();
    for (let index = count - 1; index >= 0; index--) {
      const notification = notifications.nth(index);

      // У выполняющейся операции нет кнопки «Закрыть» — сначала ждём её конца.
      const running = (await notification.innerText().catch(() => '')).includes(
        'Операция выполняется',
      );
      if (running) {
        await expect
          .poll(
            async () =>
              (await notification.innerText().catch(() => '')).includes('Операция выполняется'),
            { timeout: 60_000 },
          )
          .toBe(false)
          .catch(() => undefined);
      }

      const close = notification
        .locator('[title="Закрыть"]')
        .filter({ visible: true })
        .first();
      if (await close.isVisible().catch(() => false)) {
        await close.click({ timeout: 2_000 }).catch(() => undefined);
      }
    }

    await page.waitForTimeout(500);
  }

  const remaining = await notifications.count();
  if (remaining > 0) {
    console.warn(`[import] Не удалось закрыть уведомления прошлых импортов: ${remaining}`);
  }
}

async function waitForImportResult(page: Page, status: string): Promise<Locator> {
  const notifications = importNotifications(page);

  await expect(notifications.last()).toBeVisible({ timeout: 60_000 });
  await expect.poll(
    async () => {
      const last = notifications.last();
      const text = (await last.innerText().catch(() => '')).replace(/\s+/g, ' ');
      if (text.includes('Операция выполняется')) return 'running';
      if (text.includes(status)) return 'done';
      return text;
    },
    { timeout: 120_000, message: `Импорт не завершился со статусом «${status}»` },
  ).toBe('done');

  return notifications.last();
}

export async function expectImportSucceeded(page: Page): Promise<void> {
  await waitForImportResult(page, 'Выполнено успешно');
}

export async function expectImportFailed(page: Page): Promise<Locator> {
  return waitForImportResult(page, 'Есть ошибки');
}

export function individualCard(page: Page): Locator {
  return page.locator('.crm_IndividualCard').filter({ visible: true }).first();
}

const clientRows = (page: Page): Locator =>
  page.locator('[data-qa="row"]').filter({ visible: true });

async function searchInRegistry(page: Page, query: string): Promise<void> {
  await waitForNoLoadingOverlay(page);
  const search = page.getByPlaceholder('\uFEFF').filter({ visible: true }).first();
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(query);
}

/** Снимает фильтр ответственного/категории, чтобы импортированная запись была видна. */
async function selectAllFilter(page: Page): Promise<void> {
  const all = page.getByText('Все', { exact: true }).filter({ visible: true }).first();
  if (await all.isVisible().catch(() => false)) {
    await all.click().catch(() => undefined);
  }
}

/**
 * Клик по всей строке выделяет запись, но не открывает карточку.
 * Карточку открывает клик по названию/ФИО в главной колонке.
 */
async function openRowCard(page: Page, row: Locator): Promise<void> {
  const name = row.locator('[data-qa="crm_ClientMainInfo__name"]').filter({ visible: true }).first();
  if (await name.isVisible().catch(() => false)) {
    await name.click();
  } else {
    // В реестре «Контактные лица» другая разметка строки: ФИО лежит
    // в элементе с title, без data-qa главной колонки клиентов.
    const titled = row.locator('[title]').filter({ visible: true }).first();
    if (await titled.isVisible().catch(() => false)) {
      await titled.click();
    } else {
      await row.locator('[data-qa="cell"]').filter({ visible: true }).nth(1).click();
    }
  }

  const card = individualCard(page);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText('Параметры', { timeout: 30_000 });
}

/**
 * Ищет импортированную запись в «Клиентах», а если список ещё не обновился —
 * в «Контактных лицах». Возвращает открытую карточку.
 */
export async function openImportedClient(page: Page, query: string): Promise<Locator> {
  await selectAllFilter(page);
  await searchInRegistry(page, query);

  let row = clientRows(page).filter({ hasText: query }).first();
  let found = await row
    .waitFor({ state: 'visible', timeout: 60_000 })
    .then(() => true)
    .catch(() => false);

  if (!found) {
    // Реестр клиентов может обновиться позже контактного реестра.
    await openContacts(page);
    await selectAllFilter(page);
    await searchInRegistry(page, query);
    row = clientRows(page).filter({ hasText: query }).first();
    found = await row
      .waitFor({ state: 'visible', timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
  }

  if (!found) {
    throw new Error(`Импортированная запись не найдена ни в клиентах, ни в контактах: ${query}`);
  }

  await openRowCard(page, row);
  return individualCard(page);
}

/** Проверяет, что импортированные данные попали в карточку ФЛ. */
export async function expectImportedIndividualCard(
  page: Page,
  person: ImportedIndividual,
): Promise<void> {
  const card = await openImportedClient(page, importedFullName(person));

  for (const value of [
    person.lastName,
    person.firstName,
    person.middleName,
    importedPhoneForCard(person),
    person.email,
    person.birthDate,
    person.note,
  ]) {
    await expect(card).toContainText(value);
  }

  await expect(card.getByTitle(person.gender).filter({ visible: true }).first()).toBeVisible();
}

/** Закрывает мастер импорта без загрузки. */
export async function cancelImport(page: Page): Promise<void> {
  const dialog = importDialog(page);
  const close = dialog
    .locator('[data-qa="controls-stack-Button__close"]')
    .filter({ visible: true })
    .first();
  await expect(close).toBeVisible();
  await close.click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

/** Проверяет, что в текущем реестре нет записи с указанным значением. */
export async function expectNoClient(page: Page, query: string): Promise<void> {
  await selectAllFilter(page);
  await searchInRegistry(page, query);
  await expect(clientRows(page).filter({ hasText: query })).toHaveCount(0, { timeout: 15_000 });
}

/**
 * Удаляет импортированные записи через реестр «Контактные лица».
 * Запрос может быть ФИО, телефоном или email — ищем строку реестра по нему.
 */
export async function deleteImportedClients(
  page: Page,
  queries: readonly string[],
): Promise<void> {
  if (!queries.length) return;

  await page.keyboard.press('Escape').catch(() => undefined);
  await openContacts(page);

  for (const query of queries) {
    let deleted = false;

    // Контактный реестр может обновиться не сразу после импорта: если строки
    // нет, перезагружаем реестр и пробуем ещё раз.
    for (let attempt = 0; attempt < 3 && !deleted; attempt++) {
      await selectAllFilter(page);
      await searchInRegistry(page, query);
      const row = clientRows(page).filter({ hasText: query }).first();
      const found = await row
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(() => true)
        .catch(() => false);

      if (!found) {
        if (attempt < 2) await openContacts(page);
        continue;
      }

      await openRowCard(page, row);

      const remove = page.locator('[title="Удалить"]').filter({ visible: true }).first();
      const confirm = page.locator('.controls-Confirmation_popup').filter({ visible: true }).last();
      await expect(remove).toBeVisible({ timeout: 30_000 });

      for (let clickAttempt = 0; clickAttempt < 3; clickAttempt++) {
        await remove.click();
        try {
          await expect(confirm).toContainText('Удалить текущую запись?', { timeout: 5_000 });
          await confirm.getByText('Да', { exact: true }).filter({ visible: true }).first().click();
          break;
        } catch (error) {
          if (clickAttempt === 2) throw error;
          await page.waitForTimeout(500);
        }
      }

      await expect(clientRows(page).filter({ hasText: query })).toHaveCount(0, {
        timeout: 60_000,
      });
      deleted = true;
    }
  }
}
