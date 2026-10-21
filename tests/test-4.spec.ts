import { test, expect } from '@playwright/test';
import {
  cardBody,
  createEmptyIndividualCard,
  miniCard,
  miniCardDialog,
  openBusinessCard,
  openContacts,
  openFilledIndividualCard,
  openFullIndividualCard,
  selectIndividualTab,
} from './support/ui';

/**
 * Функциональные проверки дополняют визуальные тесты из test-1:
 * здесь проверяем наличие полей, доступные действия и переключение вкладок,
 * а не только эталонный скриншот.
 */
test.describe('Карточка ФЛ — функциональные проверки', () => {
  test.beforeEach(async ({ page }) => {
    await openContacts(page);
  });

  test('Пустая мини-карточка содержит ключевые поля и действия', async ({ page }) => {
    await createEmptyIndividualCard(page);
    const card = miniCard(page);

    for (const label of [
      'Фамилия',
      'Имя',
      'Отчество',
      'Дата рождения',
      'Пол',
      'Гражданство',
      'Паспорт',
      'Место рождения',
      'Населенный пункт',
    ]) {
      await expect(card.getByText(label, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    }

    await expect(card.getByTitle('Перейти в подробную карточку')).toBeVisible();
    await expect(card.getByTitle('Сохранить')).toBeVisible();
    await expect(card.getByTitle('Закрыть')).toBeVisible();
    await expect(card.getByTitle('Выдать дисконтную карту')).toBeVisible();
  });

  test('Пустая мини-карточка закрывается без сохранения', async ({ page }) => {
    await createEmptyIndividualCard(page);
    const card = miniCard(page);

    await card.getByTitle('Закрыть').click();

    await expect(card).toBeHidden();
  });

  test('Полная карточка последовательно переключает вкладки', async ({ page }) => {
    await createEmptyIndividualCard(page);
    await openFullIndividualCard(page);
    await selectIndividualTab(page, 'tabparams');

    await expect(cardBody(page)).toContainText('Можно добавить');

    await selectIndividualTab(page, 'tabpurchases');
    await expect(cardBody(page)).toContainText('Отгрузка');

    await selectIndividualTab(page, 'tabactivity');
    await expect(cardBody(page)).toContainText('Показать все события по клиенту');

    await selectIndividualTab(page, 'tabparams');
    await expect(cardBody(page)).toContainText('Можно добавить');
  });

  test('Заполненная карточка показывает контактные и паспортные данные', async ({ page }) => {
    await openFilledIndividualCard(page, 'Сизов', 'Сизов Виктор Генадьевич');
    await selectIndividualTab(page, 'tabparams');

    const body = cardBody(page);
    // ФИО в шапке карточки разбито на отдельные span-элементы.
    for (const part of ['Сизов', 'Виктор', 'Генадьевич']) {
      await expect(body).toContainText(part);
    }
    await expect(body).toContainText('+7 (953) 648-57-58');
    await expect(body).toContainText('vg.sizov76@yandex.ru');
    await expect(body).toContainText('12.05.1976');
    await expect(body).toContainText('г. Кострома');
    await expect(body).toContainText('Гражданство');
    await expect(body).toContainText('Россия');
    await expect(body).toContainText('Паспорт');
    await expect(body).toContainText('125001');
  });

  test('Заполненная карточка открывает покупки и активности', async ({ page }) => {
    await openFilledIndividualCard(page, 'Сизов', 'Сизов Виктор Генадьевич');

    await selectIndividualTab(page, 'tabpurchases');
    await expect(cardBody(page)).toContainText('Отгрузка');

    await selectIndividualTab(page, 'tabactivity');
    await expect(cardBody(page)).toContainText('Показать все события по клиенту');

    await selectIndividualTab(page, 'tabparams');
    await expect(cardBody(page)).toContainText('Паспорт');
  });
});

test('Заполненная визитка показывает контакты, паспорт и действия', async ({ page }) => {
  await openBusinessCard(page);
  const card = miniCardDialog(page);

  // В визитке ФИО также разбито на отдельные span-элементы.
  for (const part of ['Сизов', 'Виктор', 'Генадьевич']) {
    await expect(card).toContainText(part);
  }
  await expect(card).toContainText('+7 (953) 648-57-58');
  await expect(card).toContainText('vg.sizov76@yandex.ru');
  await expect(card.getByText('Паспорт', { exact: true })).toBeVisible();
  await expect(card.getByText('Место рождения', { exact: true })).toBeVisible();
  await expect(card.getByText('г. Кострома', { exact: true })).toBeVisible();
  await expect(card.getByTitle('Перейти в подробную карточку').first()).toBeVisible();
  await expect(card.getByTitle('Позвонить').first()).toBeVisible();
});
