import { resolve } from 'node:path';

/**
 * Копия suite для тестового стенда test-online.
 * При необходимости стенд можно переопределить через env.
 */
export const APP_ORIGIN = process.env.SABY_APP_ORIGIN ?? 'https://test-online.sbis.ru';
export const APP_HOST = new URL(APP_ORIGIN).hostname;

/**
 * SSO-страница, на которой всегда показывается форма входа.
 * После успешного входа Saby уводит на APP_HOST.
 */
export const AUTH_URL =
  process.env.SABY_AUTH_URL ??
  'https://test-sso.saby.ru/auth-online/test-online.sbis.ru/?ret=test-online.sbis.ru/page/crm-unified-contacts';
export const SSO_HOST = new URL(AUTH_URL).hostname;

export const CONTACTS_URL = `${APP_ORIGIN}/page/crm-unified-contacts`;
export const CLIENTS_URL = `${APP_ORIGIN}/page/crm-clients`;
export const DEALS_URL = `${APP_ORIGIN}/page/crm-deals`;
export const LOANS_URL = `${APP_ORIGIN}/page/loans-and-credits`;

export const THEME_UUID =
  process.env.SABY_THEME_UUID ?? '01a03962-b5ad-787c-a0f4-e78c18ca888a';
export const THEME_TYPE = process.env.SABY_THEME_TYPE ?? 'Лид';

export const THEME_URL =
  `${APP_ORIGIN}/page/crm-subjects-edit?themeType=${encodeURIComponent(THEME_TYPE)}` +
  `&uuid=${THEME_UUID}`;

export const THEMES_URL =
  `${APP_ORIGIN}/page/crm-subjects?themeType=${encodeURIComponent(THEME_TYPE)}` +
  `&uuid=${THEME_UUID}`;

export const LOGIN = process.env.SABY_LOGIN || 'screencrm';
export const PASSWORD = process.env.SABY_PASSWORD || 'screencrm!44';

/**
 * Пустой тестовый пользователь для проверок заглушки и создания временных
 * сущностей реестра «Контактные лица». У него нет ни контактов, ни папок,
 * ни тегов, ни выборок.
 */
export const EMPTY_LOGIN = process.env.SABY_EMPTY_LOGIN || 'Пустой44';
export const EMPTY_PASSWORD = process.env.SABY_EMPTY_PASSWORD || 'пустой44!44';

/** Файл с cookies/localStorage, который создаётся в global-setup. */
export const STORAGE_STATE = resolve(__dirname, '../../playwright/.auth/user.json');
export const EMPTY_STORAGE_STATE = resolve(__dirname, '../../playwright/.auth/empty44.json');
