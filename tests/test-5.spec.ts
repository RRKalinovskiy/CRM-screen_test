import { test, expect } from '@playwright/test';
import { openTheme, openThemeSection, workspace } from './support/ui';
import { THEME_TYPE, THEME_UUID } from './support/constants';

const themeSections = [
  'Воронка продаж',
  'Документы и формы',
  'Шаблоны отправки',
  'Скрипты',
  'Параметры',
  'Триггеры',
  'Доп. поля',
  'Команды в меню',
  'Роли и права',
  'Связи',
  'Инструкция',
];

/**
 * Функциональные проверки дополняют скриншоты test-2:
 * проверяем состав меню, бизнес-содержимое разделов и переходы между ними.
 */
test.describe('Карточка темы «Лид» — функциональные проверки', () => {
  test('Меню содержит все разделы темы', async ({ page }) => {
    await openTheme(page);
    const menu = workspace(page);

    for (const section of themeSections) {
      await expect(menu.getByText(section, { exact: true }).filter({ visible: true }).last()).toBeVisible();
    }
  });

  test('Воронка показывает этапы и итоги', async ({ page }) => {
    await openTheme(page);

    for (const label of ['Этапы', 'Итоги', 'Новый', 'Стартовый', 'Подтверждение', 'С настройками', 'Положительно', 'Отрицательно']) {
      await expect(page.getByText(label, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    }

    // «Обсуждение» встречается и как этап, и как подэтап.
    await expect(page.getByText('Обсуждение', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  });

  test('Параметры показывают тип темы и правила сделки', async ({ page }) => {
    await openTheme(page);
    await openThemeSection(page, 'Параметры');

    for (const label of [
      'Тип темы',
      'Продажи',
      'Аудит',
      'Обслуживание',
      'Классическая воронка продаж с этапами и итогами',
      'Открытых сделок по клиенту',
      'Планирование следующей активности',
      'Закрывать сделку положительным итогом, если счета входящие в сумму полностью',
      'Плановые активности после закрытия сделки',
      'Неотгруженные и неоплаченные счета после положительного закрытия сделки',
    ]) {
      await expect(page.getByText(label, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    }
  });

  test('Роли и права содержат базовые роли', async ({ page }) => {
    await openTheme(page);
    await openThemeSection(page, 'Роли и права');

    for (const role of ['Автор', 'Ответственный', 'Руководитель подразделения']) {
      await expect(page.getByText(role, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    }
    await expect(page.getByText('Создает документ с этим регламентом', { exact: true })).toBeVisible();
    await expect(page.getByText(/Укажите роли\s*,\s*участвующие в работе со сделкой/)).toBeVisible();
  });

  test('Верхняя навигация передаёт контекст темы', async ({ page }) => {
    await openTheme(page);

    const links: Array<{ name: string | RegExp; path: string }> = [
      { name: 'Клиенты', path: '/page/crm-clients' },
      { name: 'Контактные лица', path: '/page/crm-unified-contacts' },
      { name: 'Темы', path: '/page/crm-subjects' },
      { name: 'Списки', path: '/page/crm-client-lists' },
      { name: /^Сделки/, path: '/page/crm-deals' },
    ];

    // Ссылки ищем только в рабочей области: в глобальном меню Saby есть
    // одноимённые пункты без контекста темы.
    const topNavigation = workspace(page);

    for (const { name, path } of links) {
      const link =
        typeof name === 'string'
          ? topNavigation.getByRole('link', { name, exact: true })
          : topNavigation.getByRole('link', { name });
      const visibleLink = link.filter({ visible: true }).last();

      await expect(visibleLink).toBeVisible();
      const href = await visibleLink.getAttribute('href');
      expect(href, `У ссылки «${String(name)}» должен быть href`).toBeTruthy();
      expect(href).toContain(path);
      expect(href).toContain(`themeType=${encodeURIComponent(THEME_TYPE)}`);
      expect(href).toContain(`uuid=${THEME_UUID}`);
    }
  });

  test('Разделы темы переключаются последовательно', async ({ page }) => {
    test.setTimeout(120_000);
    await openTheme(page);

    for (const section of themeSections) {
      await openThemeSection(page, section);
      await expect(page.getByText('Тема для статистики', { exact: true }).last()).toBeVisible();
    }

    // Возврат в начало проверяет, что навигация не «залипает» на последнем разделе.
    await openThemeSection(page, 'Воронка продаж');
    await expect(page.getByText('Этапы', { exact: true })).toBeVisible();
  });
});
