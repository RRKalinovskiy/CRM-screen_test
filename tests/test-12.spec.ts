import { test, expect } from '@playwright/test';
import {
  cardBody,
  cleanupIndividualWithDocuments,
  clearDocumentsSearch,
  closeDocumentEditor,
  createEmptyIndividualCard,
  createSalesDocument,
  deleteAllDocuments,
  deleteCurrentIndividual,
  deleteDocumentByComment,
  editDocumentComment,
  expectDocumentCommentValue,
  expectDocumentFilterState,
  expectDocumentHidden,
  expectDocumentInList,
  expectDocumentTypesInFilter,
  expectDocumentVisible,
  expectFilterWithoutDocumentType,
  fillAndSaveDocument,
  fillIndividualMiniCard,
  filterDocumentsByType,
  openContactByQuery,
  openContacts,
  openDocumentByComment,
  resetDocumentFilter,
  SALES_DOCUMENT_TYPES,
  saveMiniIndividualCard,
  searchDocuments,
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

  test('Фильтрует документы по типу, ищет по комментарию и сохраняет изменения', async ({
    page,
  }) => {
    test.setTimeout(360_000);
    const suffix = uniqueSuffix();
    const draft = makeDraft(suffix);
    const invoice = SALES_DOCUMENT_TYPES[0];
    const order = SALES_DOCUMENT_TYPES[1];
    const invoiceComment = `АТ ${invoice.listTitle} ${suffix}`;
    const orderComment = `АТ ${order.listTitle} ${suffix}`;
    const editedComment = `АТ ${invoice.listTitle} изменён ${suffix}`;
    createdQuery = draft.lastName;

    await openContacts(page);
    await createEmptyIndividualCard(page);
    await fillIndividualMiniCard(page, draft);
    await saveMiniIndividualCard(page);
    await openContactByQuery(page, draft.lastName);
    await selectIndividualTab(page, 'tabpurchases');

    await createSalesDocument(page, invoice);
    await fillAndSaveDocument(page, invoiceComment);
    await createSalesDocument(page, order);
    await fillAndSaveDocument(page, orderComment);

    await expectDocumentInList(page, invoice, invoiceComment);
    await expectDocumentInList(page, order, orderComment);

    // Фильтр по типу счёта оставляет только счёт.
    await filterDocumentsByType(page, invoice);
    await expectDocumentVisible(page, invoiceComment);
    await expectDocumentHidden(page, orderComment);

    // Фильтр по типу заказа оставляет только заказ.
    await filterDocumentsByType(page, order);
    await expectDocumentVisible(page, orderComment);
    await expectDocumentHidden(page, invoiceComment);

    // «Все» сбрасывает фильтр и возвращает оба документа.
    await resetDocumentFilter(page);
    await expectDocumentVisible(page, invoiceComment);
    await expectDocumentVisible(page, orderComment);

    // Поиск по комментарию оставляет только счёт.
    await searchDocuments(page, invoiceComment);
    await expectDocumentVisible(page, invoiceComment);
    await expectDocumentHidden(page, orderComment);
    await clearDocumentsSearch(page);
    await expectDocumentVisible(page, orderComment);

    // Редактирование комментария сохранённого документа.
    await editDocumentComment(page, invoiceComment, editedComment);
    await expectDocumentVisible(page, editedComment);
    await expectDocumentHidden(page, invoiceComment);

    // Повторное открытие подтверждает, что изменение сохранилось.
    await openDocumentByComment(page, editedComment);
    await expectDocumentCommentValue(page, editedComment);
    await closeDocumentEditor(page);

    // После удаления счёта его тип пропадает из фильтра, заказ остаётся.
    await deleteDocumentByComment(page, editedComment);
    await expectDocumentHidden(page, editedComment);
    await expectDocumentFilterState(page, ['Документы', order.filterTitle], [
      invoice.filterTitle,
    ]);

    await deleteDocumentByComment(page, orderComment);
    await deleteCurrentIndividual(page);
    createdQuery = undefined;
    await expect(
      page.getByText(draft.lastName, { exact: false }).filter({ visible: true }),
    ).toHaveCount(0, { timeout: 60_000 });
  });
});
