# Запуск PupsikTV на GitHub Pages и Supabase

Сайт: `https://mahoitz.github.io/PupsikTV/`.

API: `https://shwekurmzyzivtworjup.supabase.co/functions/v1/pupsik-api`.

База данных и изображения в Supabase Storage остаются в существующем проекте.
Переносить таблицы или выполнять SQL-миграции для этого перехода не нужно.

## 1. Подготовить секреты Supabase

1. Откройте [Supabase Dashboard](https://supabase.com/dashboard), выберите проект
   `shwekurmzyzivtworjup`.
2. В левом меню откройте **Edge Functions → Secrets**.
3. Добавьте `EDIT_PASSWORD` и `ADMIN_SESSION_SECRET` из настроек старого проекта
   Vercel. Сохраните прежний секрет, чтобы формат подписей оставался совместимым.
   В браузере на новом домене всё равно потребуется войти заново: localStorage
   принадлежит каждому домену отдельно.
4. По необходимости перенесите дополнительные переменные:
   `ADMIN_SESSION_TTL_MS`, `KINOPOISK_API_KEY`, `KINOPOISK_API_KEY2`,
   `KINOPOISK_API_KEY3`, `TWITCH_IGDB_CLIENT_ID`, `TWITCH_IGDB_CLIENT_SECRET`,
   `TWITCH_CLIENT_ID`, `OPENROUTER_API`, `TMDB_API`, `STEAMGRIDDB_API_KEY`,
   `RAWG_API_KEY`. Отсутствие необязательного ключа отключает соответствующую
   интеграцию или приводит к ошибке только при её использовании.

Supabase автоматически предоставляет `SUPABASE_ANON_KEY` и
`SUPABASE_SERVICE_ROLE_KEY` внутри Edge Functions. Код использует первый как
публичный ключ, а второй только на сервере. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
можно задать отдельно, если требуется другой публичный ключ этого же проекта. Не пытайтесь
вручную создавать секреты с зарезервированным префиксом `SUPABASE_`.
Ключи и пароли нельзя добавлять в файлы репозитория или в Pages.

## 2. Подготовить доступ для публикации функции

1. В Supabase откройте меню аккаунта → **Account preferences → Access tokens**
   (также доступно по [прямой ссылке](https://supabase.com/dashboard/account/tokens)).
2. Нажмите **Generate new token**, задайте имя `PupsikTV GitHub deploy` и сохраните
   полученный токен в менеджере паролей.
3. В репозитории GitHub откройте **Settings → Secrets and variables → Actions**.
4. Нажмите **New repository secret**. Имя: `SUPABASE_ACCESS_TOKEN`.
   Значение: созданный токен. Нажмите **Add secret**.

Этот токен нужен только для деплоя. Это не ключ базы данных и не публичный ключ
браузера. Не добавляйте его в JavaScript сайта.

## 3. Опубликовать API

1. Загрузите изменения проекта в основную ветку `main` GitHub.
2. Откройте **Actions → Deploy Supabase API → Run workflow**.
3. Выберите `main`, нажмите зелёную кнопку **Run workflow** и дождитесь успешного
   завершения.
4. Откройте без VPN:
   `https://shwekurmzyzivtworjup.supabase.co/functions/v1/pupsik-api/health`.
   Ожидается `{"ok":true}`.
5. Откройте:
   `https://shwekurmzyzivtworjup.supabase.co/functions/v1/pupsik-api/admin?action=env`.
   Ожидается JSON с публичным ключом и `isAdmin: false`.

Workflow собирает Deno-модули из текущих файлов `api/` и `lib/`, затем публикует
одну функцию. Генерируемые файлы не нужно редактировать или коммитить.
`verify_jwt = false` задан в `supabase/config.toml` только для этой функции:
сайт использует собственные административные токены, проверяемые обработчиками.
Публичные маршруты, включая конфигурацию и рейтинги, сохраняют прежние правила
доступа. CORS разрешает `https://mahoitz.github.io` и локальную разработку на
порту 3000. CORS не заменяет проверки токенов.

Если деплой или запрос возвращает ошибку, откройте **Edge Functions → pupsik-api
→ Logs**. `401 Invalid JWT` до выполнения обработчика означает, что встроенная
JWT-проверка осталась включённой; повторите деплой с конфигурацией из репозитория.
`500` на `env` обычно означает отсутствие публичного ключа в окружении.

## 4. Переключить GitHub Pages

1. Откройте репозиторий → **Settings → Pages**.
2. В **Build and deployment → Source** выберите **GitHub Actions** вместо
   **Deploy from a branch**. Отдельный артефакт публикует только клиентские файлы.
3. Поле **Custom domain** оставьте пустым.
4. Откройте **Actions → Deploy GitHub Pages → Run workflow**, выберите `main`.
5. Дождитесь успешной публикации и откройте
   `https://mahoitz.github.io/PupsikTV/`. Обновите страницу с очисткой кеша
   (`Ctrl+F5`).

Изменения `main` автоматически обновляют Pages. После изменений в `api/` или
`lib/` повторно запускайте **Deploy Supabase API**. Секреты при каждом деплое
сохраняются в Supabase, повторно вводить их не требуется.

## 5. Проверить работу без VPN

- Домашний и мобильный интернет: главная, трейлеры, статистика; оформление,
  шрифты, изображения и данные из базы.
- Вход администратора правильным паролем; отказ при неверном пароле.
- Создание/изменение/удаление одной тестовой записи и загрузка тестового постера.
- Запись и изменение оценки; сохранение данных после обновления страницы.
- Поиск во внешних сервисах, если их ключи добавлены.
- В DevTools → Network запросы собственного API идут в Supabase, а не в Vercel
  или Netlify. Сторонние видеоплееры и CDN проверяются отдельно.

Сайт по-прежнему использует jsDelivr для браузерной библиотеки Supabase и cdnjs
для иконок. Перенос точки входа не гарантирует доступность стороннего видео или
внешних интеграций в конкретной сети.

## Локальная проверка

Требуются Node.js 22+ и Deno 2.x:

```powershell
npm ci
npm run build:edge
npm run build:pages
npm run test:migration
deno check supabase/functions/pupsik-api/index.ts
deno test --allow-env --allow-net --allow-read supabase/functions/pupsik-api/router_test.ts
npm run lint
```

Для локального запуска функций можно использовать Supabase CLI:

```powershell
npm run build:edge
npx supabase functions serve pupsik-api --env-file .env
```

Держите `.env` только локально. Для публикации через CLI:

```powershell
npm run build:edge
npx supabase login
npx supabase functions deploy pupsik-api --project-ref shwekurmzyzivtworjup
```
