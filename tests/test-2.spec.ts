import { test } from '@playwright/test';
import { expectThemeScreenshot, openTheme, openThemeSection } from './support/ui';

const sections = [
  { title: 'Воронка продаж', snapshot: 'crm-theme-card-Воронка.png' },
  { title: 'Документы и формы', snapshot: 'crm-theme-card-Документы.png' },
  { title: 'Шаблоны отправки', snapshot: 'crm-theme-card-Шаблоны-отправки.png' },
  { title: 'Скрипты', snapshot: 'crm-theme-card-Скрипты.png' },
  { title: 'Параметры', snapshot: 'crm-theme-card-Параметры.png' },
  { title: 'Триггеры', snapshot: 'crm-theme-card-Триггеры.png' },
  { title: 'Доп. поля', snapshot: 'crm-theme-card-Доп-поля.png' },
  { title: 'Команды в меню', snapshot: 'crm-theme-card-Команды-в-меню.png' },
  { title: 'Роли и права', snapshot: 'crm-theme-card-Роли.png' },
  { title: 'Связи', snapshot: 'crm-theme-card-Связи.png' },
  { title: 'Инструкция', snapshot: 'crm-theme-card-Инструкция.png' },
];

test.describe('Карточка темы «Лид»', () => {
  for (const { title, snapshot } of sections) {
    test(`Вкладка «${title}»`, async ({ page }) => {
      await openTheme(page);
      await openThemeSection(page, title);
      await expectThemeScreenshot(page, snapshot);
    });
  }
});
