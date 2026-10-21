import { test, expect, type Page } from '@playwright/test';
import { APP_ORIGIN } from './support/constants';
import {
  cardBody,
  copyIndividualCardLink,
  openContacts,
  openFilledIndividualCard,
  openIndividualCardByLink,
} from './support/ui';

type Client = {
  query: string;
  name: string;
  nameParts: string[];
  phone: string;
};

const clients: Client[] = [
  {
    query: 'Сизов',
    name: 'Сизов Виктор Генадьевич',
    nameParts: ['Сизов', 'Виктор', 'Генадьевич'],
    phone: '+7 (953) 648-57-58',
  },
  {
    query: 'Горохов',
    name: 'Горохов Евгений Олегович',
    nameParts: ['Горохов', 'Евгений', 'Олегович'],
    phone: '+7 (999) 666-22-11',
  },
];

function expectLiveCardLink(link: string): void {
  const url = new URL(link);
  expect(url.origin).toBe(APP_ORIGIN);
  expect(url.pathname).toMatch(/^\/crm\/individual\/card\/[A-Za-z0-9_-]+$/);
}

async function openLiveCard(page: Page, client: Client): Promise<void> {
  await openContacts(page);
  await openFilledIndividualCard(page, client.query, client.name);
}

async function expectClientCard(page: Page, client: Client): Promise<void> {
  const body = cardBody(page);
  // ФИО в карточке разбито на отдельные span-элементы.
  for (const part of client.nameParts) {
    await expect(body).toContainText(part);
  }
  await expect(body).toContainText(client.phone);
}

/**
 * Ссылка каждый раз читается из открытой живой карточки через
 * «Ссылка/Поделиться» → «Скопировать», поэтому тест не зависит от
 * захардкоженного URL и проверяет актуальный маршрут карточки.
 */
test.describe('Открытие карточки ФЛ по ссылке в новой вкладке', () => {
  for (const client of clients) {
    test(`Ссылка из живой карточки «${client.name}» открывает карточку`, async ({
      page,
      context,
    }) => {
      await openLiveCard(page, client);

      const link = await copyIndividualCardLink(page);
      expectLiveCardLink(link);

      const newPage = await openIndividualCardByLink(context, link);
      try {
        await expect(newPage).toHaveURL(link);
        await expectClientCard(newPage, client);
      } finally {
        await newPage.close();
      }
    });
  }

  test('Пункт «В новой вкладке» открывает карточку по свежей ссылке', async ({
    page,
    context,
  }) => {
    const client = clients[1];
    await openLiveCard(page, client);

    const link = await copyIndividualCardLink(page);
    expectLiveCardLink(link);

    // После копирования меню закрывается, поэтому открываем его повторно.
    await page
      .locator('[title="Ссылка/Поделиться"]')
      .filter({ visible: true })
      .first()
      .click();

    const newTabItem = page
      .getByText('В новой вкладке', { exact: true })
      .filter({ visible: true })
      .first();
    await expect(newTabItem).toBeVisible();

    const newPagePromise = context.waitForEvent('page');
    await newTabItem.click();
    const newPage = await newPagePromise;

    try {
      await newPage.waitForLoadState('domcontentloaded');
      await expect(newPage).toHaveURL(link);
      await expect(newPage.locator('.crm_IndividualCard__tabsArea')).toBeVisible({
        timeout: 90_000,
      });
      await expectClientCard(newPage, client);
    } finally {
      await newPage.close();
    }
  });
});
