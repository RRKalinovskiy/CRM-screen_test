import { test, expect, type Locator, type Page } from '@playwright/test';
import { openContacts, workspace } from './support/ui';

type Contact = {
  name: string;
  phone: string;
  email?: string;
};

const contacts: Contact[] = [
  {
    name: 'Горохов Евгений Олегович',
    phone: '+7 (999) 666-22-11',
    email: 'game_test@gmail.com',
  },
  {
    name: 'Сизов Виктор Генадьевич',
    phone: '+7 (953) 648-57-58',
    email: 'vg.sizov76@yandex.ru',
  },
  {
    name: 'Тестов Винамин',
    phone: '+7 (953) 669-58-47',
  },
];

const FILTERS = ['Все', 'Мужчины', 'Женщины', 'до 18', 'от 18 до 40', 'от 40', 'Папка2'];

const person = (page: Page, name: string): Locator =>
  page.getByText(name, { exact: true }).filter({ visible: true }).first();

async function clickFilter(page: Page, label: string): Promise<void> {
  await page.getByText(label, { exact: true }).filter({ visible: true }).first().click();
}

async function filterContactsBySearch(
  page: Page,
  query: string,
  visibleNames: string[],
  hiddenNames: string[] = [],
): Promise<void> {
  // Поле поиска и список могут перерисоваться после загрузки страницы.
  // Повторяем ввод, пока не получим именно ожидаемый результат фильтрации.
  await expect
    .poll(
      async () => {
        const search = page.getByPlaceholder('\uFEFF').filter({ visible: true }).first();
        if ((await search.count()) === 0) {
          return false;
        }

        await search.fill(query).catch(() => undefined);
        await page.waitForTimeout(500);
        if ((await search.inputValue().catch(() => '')) !== query) {
          return false;
        }

        const visible = await Promise.all(
          visibleNames.map(async (name) => person(page, name).isVisible().catch(() => false)),
        );
        const hidden = await Promise.all(
          hiddenNames.map(async (name) => !(await person(page, name).isVisible().catch(() => true))),
        );

        return visible.every(Boolean) && hidden.every(Boolean);
      },
      {
        timeout: 30_000,
        message: `Поиск «${query}» не привёл к ожидаемому списку контактов`,
      },
    )
    .toBe(true);
}

async function expectContactsVisible(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    await expect(person(page, name)).toBeVisible();
  }
}

async function expectContactsHidden(page: Page, names: string[]): Promise<void> {
  for (const name of names) {
    await expect(person(page, name)).toBeHidden();
  }
}

test.describe('Реестр «Контактные лица»', () => {
  test('Активный раздел, фильтры и список контактов', async ({ page }) => {
    await openContacts(page);

    await expect(
      page.getByRole('link', { name: 'Контактные лица', exact: true }),
    ).toHaveClass(/controls-Tabs__item_view_selected/);
    await expect(page.getByPlaceholder('\uFEFF').first()).toBeVisible();

    for (const filter of FILTERS) {
      await expect(
        page.getByText(filter, { exact: true }).filter({ visible: true }).first(),
      ).toBeVisible();
    }
    await expectContactsVisible(
      page,
      contacts.map((contact) => contact.name),
    );
    for (const contact of contacts) {
      await expect(workspace(page)).toContainText(contact.phone);
      if (contact.email) {
        await expect(workspace(page)).toContainText(contact.email);
      }
    }

    const dealsCounter = page
      .locator('.NavigationPanels-Counter__tabs_counter')
      .filter({ visible: true })
      .first();
    await expect(dealsCounter).toHaveAttribute('title', /\d+ новых\. Всего \d+/);
  });

  test('Поиск фильтрует список по имени', async ({ page }) => {
    await openContacts(page);
    // После первичной отрисовки Saby может пересоздать поле поиска.
    await page.waitForTimeout(2_000);

    await filterContactsBySearch(
      page,
      'Сизов',
      ['Сизов Виктор Генадьевич'],
      ['Горохов Евгений Олегович', 'Тестов Винамин'],
    );

    await filterContactsBySearch(
      page,
      'Горохов',
      ['Горохов Евгений Олегович'],
      ['Сизов Виктор Генадьевич', 'Тестов Винамин'],
    );

    await filterContactsBySearch(
      page,
      '',
      contacts.map((contact) => contact.name),
    );
  });

  test('Фильтр по полу: мужчины и женщины', async ({ page }) => {
    await openContacts(page);

    await clickFilter(page, 'Мужчины');
    // Состав данных может меняться, поэтому проверяем только тех,
    // кто гарантированно относится к мужскому полу.
    await expectContactsVisible(page, ['Горохов Евгений Олегович', 'Сизов Виктор Генадьевич']);

    await clickFilter(page, 'Женщины');
    await expectContactsHidden(page, ['Горохов Евгений Олегович', 'Сизов Виктор Генадьевич']);

    await clickFilter(page, 'Все');
    await expectContactsVisible(
      page,
      contacts.map((contact) => contact.name),
    );
  });

  test('Фильтр по возрасту: 18–40 и старше 40', async ({ page }) => {
    await openContacts(page);

    await clickFilter(page, 'от 18 до 40');
    await expectContactsVisible(page, ['Горохов Евгений Олегович']);
    await expectContactsHidden(page, ['Сизов Виктор Генадьевич', 'Тестов Винамин']);

    await clickFilter(page, 'от 40');
    await expectContactsVisible(page, ['Сизов Виктор Генадьевич']);
    await expectContactsHidden(page, ['Горохов Евгений Олегович', 'Тестов Винамин']);

    await clickFilter(page, 'Все');
    await expectContactsVisible(
      page,
      contacts.map((contact) => contact.name),
    );
  });
});
