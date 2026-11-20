import { test, expect } from '@playwright/test';
import {
  createEmptyIndividualCard,
  expectCardScreenshot,
  miniCard,
  miniCardDialog,
  openBusinessCard,
  openContacts,
  openFilledIndividualCard,
  openFullIndividualCard,
  selectIndividualTab,
  type IndividualTab,
} from './support/ui';
import { selectNewCardMode } from './support/new-individual-card';

test.describe('Карточка физического лица', () => {
  test.beforeEach(async ({ page }) => {
    await openContacts(page);
  });

  test('Интерфейсная проверка пустой карточки ФЛ', async ({ page }) => {
    await createEmptyIndividualCard(page);
    await expect(miniCard(page)).toHaveScreenshot('person-mini-card.png');
  });

  const cardCases: Array<{ title: string; tab: IndividualTab; snapshot: string }> = [
    {
      title: 'Проверка полной карточки ФЛ',
      tab: 'tabparams',
      snapshot: 'crm-individual-card.png',
    },
    {
      title: 'Проверка полной карточки ФЛ — Покупки',
      tab: 'tabpurchases',
      snapshot: 'crm-individual-card-Покупки.png',
    },
    {
      title: 'Проверка полной карточки ФЛ — Активности',
      tab: 'tabactivity',
      snapshot: 'crm-individual-card-Активности.png',
    },
  ];

  for (const { title, tab, snapshot } of cardCases) {
    test(title, async ({ page }) => {
      await createEmptyIndividualCard(page);
      await openFullIndividualCard(page);
      // Режим карточки — общее состояние пользователя: фиксируем его,
      // чтобы эталон не зависел от порядка тестов и test-14.
      await selectNewCardMode(page, 'Колонки');
      await selectIndividualTab(page, tab);
      await expectCardScreenshot(page, snapshot);
    });
  }

  test('Заполненная карточка ФЛ', async ({ page }) => {
    await openFilledIndividualCard(page, 'Сизов', 'Сизов Виктор Генадьевич');
    await selectNewCardMode(page, 'Колонки');
    await selectIndividualTab(page, 'tabparams');
    await expectCardScreenshot(page, 'crm-individual-card-Карточка ФЛ.png');
  });
});

test('Заполненная визитка ФЛ', async ({ page }) => {
  await openBusinessCard(page);
  await expect(miniCardDialog(page)).toHaveScreenshot('crm-individual-card-Визитка ФЛ.png', {
    mask: [
      page.locator('.crm_ClientSalesBlock__rublesKopeks'),
      page.getByText(/\d+ лет/),
    ],
    maxDiffPixelRatio: 0.05,
  });
});
