# Копия suite для стенда test

Это отдельный worktree ветки `test-stand`, настроенный на `https://test-online.sbis.ru`.
Основной репозиторий и ветка `main` не затрагиваются.

## Настройки стенда

| Параметр | Значение по умолчанию |
|---|---|
| `APP_ORIGIN` | `https://test-online.sbis.ru` |
| `AUTH_URL` | `https://test-sso.saby.ru/auth-online/test-online.sbis.ru/?ret=test-online.sbis.ru/page/crm-unified-contacts` |
| Логин | те же `SABY_LOGIN` / `SABY_PASSWORD`, что и на fix |
| Пустой пользователь | по умолчанию **не** логинится: на стенде test профиля `Пустой44` нет |

Стенд можно переопределить без правки кода:

```powershell
$env:SABY_APP_ORIGIN='https://test-online.sbis.ru'
$env:SABY_AUTH_URL='https://test-sso.saby.ru/auth-online/test-online.sbis.ru/?ret=test-online.sbis.ru/page/crm-unified-contacts'
```

## Запуск

```powershell
npm ci
npx playwright install chromium

# основной набор без сценариев пустого пользователя
npx playwright test --grep-invert "@empty-user"

# отдельные наборы
npx playwright test tests/test-14.spec.ts   # новая карточка ФЛ
npx playwright test tests/test-17.spec.ts   # импорт ФЛ из Excel
```

Для сценариев `@empty-user` нужен профиль `Пустой44` на стенде test и
`SABY_SETUP_EMPTY=1`.

## Что уже проверено на test

- вход основным пользователем `screencrm` через `test-sso` работает;
- `tests/test-3.spec.ts` проходит;
- `tests/test-14.spec.ts` упирается в данные: на стенде test нет человека
  «Проверка Карточки Физика» с ожидаемыми телефоном, email, паспортом и СНИЛС.
  Для запуска нужен либо этот демо-набор, либо параметризация `NEW_CARD_PERSON`
  и ожидаемых значений через env.

## Отличия от main

- `tests/support/constants.ts` — origin и SSO вынесены в env с дефолтами test;
- `tests/support/auth.ts` — проверка домена после входа берётся из `APP_ORIGIN`;
- `tests/support/ui.ts`, `tests/support/new-individual-card.ts` — проверка SSO
  по `SSO_HOST`, а не по жёстко заданному `fix-sso`;
- `tests/support/global-setup.ts` — пустой пользователь по умолчанию выключен.
