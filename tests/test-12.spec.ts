import { test, expect } from '@playwright/test';
import {
  cardBody,
  cleanupIndividualWithDocuments,
  createEmptyIndividualCard,
  createSalesDocument,
  deleteAllDocuments,
  deleteCurrentIndividual,
  deleteDocumentByComment,
  expectDocumentInList,
  expectDocumentTypesInFilter,
  expectFilterWithoutDocumentType,
  fillAndSaveDocument,
  fillIndividualMiniCard,
  openContactByQuery,
  openContacts,
  SALES_DOCUMENT_TYPES,
  saveMiniIndividualCard,
  selectIndividualTab,
  type IndividualDraft,
} from './support/ui';

const uniqueSuffix = (): string =>
  new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17);

const makeDraft = (suffix: string): IndividualDraft => ({
  lastName: `АТДок${suffix}`,
  firstName: 'Иван',
  phone: `999${suffix.slice(-7)}`,
});

/**
 * Сценарии создания документов продаж из карточки ФЛ.
 *
 * В текущем интерфейсе Saby вкладка называется «Покупки», но документы
 * продаж создаются из неё через «Добавить» → «Продажи» → тип документа.
 * Тесты создают уникальный контакт, поэтому после проверки удаляют все
 * созданные документы и сам контакт.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Документы продаж в карточке ФЛ', () => {
  let createdQuery: string | undefined;

  test.afterEach(async ({ page }) => {
    const query = createdQuery;
    createdQuery = undefined;
    if (query) {
      await cleanupIndividualWithDocuments(page, query);
    }
  });

  test('Создаёт документы каждого типа и показывает их типы в фильтре', async ({ page }) => {
    test.setTimeout(420_000);
    const suffix = uniqueSuffix();
    const draft = makeDraft(suffix);
    createdQuery = draft.lastName;

    await openContacts(page);
    await createEmptyIndividualCard(page);
    await fillIndividualMiniCard(page, draft);
    await saveMiniIndividualCard(page);
    await openContactByQuery(page, draft.lastName);
    await selectIndividualTab(page, 'tabpurchases');

    for (const type of SALES_DOCUMENT_TYPES) {
      const comment = `АТ ${type.listTitle} ${suffix}`;
      await createSalesDocument(page, type);
      await fillAndSaveDocument(page, comment);
      await expectDocumentInList(page, type, comment);
    }

    await expectDocumentTypesInFilter(page, [
      'Документы',
      ...SALES_DOCUMENT_TYPES.map((type) => type.filterTitle),
    ]);

    await deleteAllDocuments(page);
    await deleteCurrentIndividual(page);
    createdQuery = undefined;
    await expect(
      page.getByText(draft.lastName, { exact: false }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 60_000 });
  });

  test('Удаляет созданный счёт и убирает его тип из фильтра', async ({ page }) => {
    test.setTimeout(300_000);
    const suffix = uniqueSuffix();
    const draft = makeDraft(suffix);
    const invoice = SALES_DOCUMENT_TYPES[0];
    const comment = `АТ ${invoice.listTitle} ${suffix}`;
    createdQuery = draft.lastName;

    await openContacts(page);
    await createEmptyIndividualCard(page);
    await fillIndividualMiniCard(page, draft);
    await saveMiniIndividualCard(page);
    await openContactByQuery(page, draft.lastName);
    await selectIndividualTab(page, 'tabpurchases');

    await createSalesDocument(page, invoice);
    await fillAndSaveDocument(page, comment);
    await expectDocumentInList(page, invoice, comment);

    await expectDocumentTypesInFilter(page, ['Документы', invoice.filterTitle]);

    await deleteDocumentByComment(page, comment);
    await expect(
      cardBody(page).getByText(comment, { exact: true }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 30_000 });

    await expectFilterWithoutDocumentType(page, invoice.filterTitle);

    await deleteCurrentIndividual(page);
    createdQuery = undefined;
    await expect(
      page.getByText(draft.lastName, { exact: false }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 60_000 });
  });
});
