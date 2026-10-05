# EMS Messenger Server

Локальный backend корпоративного мессенджера: Fastify, TypeScript, Socket.IO и SQLite в WAL-режиме.

## Требования

- Node.js 22 или новее
- npm 10 или новее

## Установка

```powershell
cd C:\Users\petvi\OneDrive\Desktop\ems-messenger\server
npm install
Copy-Item .env.example .env
```

Замените `SESSION_SECRET` в `.env` на случайную строку не короче 32 символов.

## Конфигурация

- `HOST=127.0.0.1` — по умолчанию сервер доступен только локально.
- `PORT=4100` — HTTP и Socket.IO.
- `CLIENT_ORIGIN=http://localhost:3000` — единственный разрешённый browser origin.
- `DATABASE_PATH=./data/ems-messenger.sqlite` — локальная БД.
- `DEV_AUTH_ENABLED=true` — регистрирует только локальные dev-session endpoints.
- `MESSAGE_MAX_LENGTH=8000` — максимальная длина сообщения.

При `NODE_ENV=production` dev-session endpoints не регистрируются, даже если flag выставлен ошибочно.

## Структура исходного кода

```text
src/
├── application/             общие интерфейсы сценариев приложения
├── cli/                     команды migrate, seed, reset и backup
├── database/                подключение к SQLite и запуск миграций
│   └── migrations/          по одному файлу на версию схемы
├── modules/
│   ├── auth/                cookie-сессия и проверка пользователя
│   ├── conversations/       маршруты, validation, service и repository бесед
│   ├── health/              проверки live/ready
│   ├── messages/            маршруты, validation, service и repository сообщений
│   └── users/               пользователи и тестовый seed
├── realtime/                Socket.IO и публикация событий
├── shared/                  общие ошибки, HTTP и validation
├── app.ts                   composition root: только собирает зависимости
├── config.ts                переменные окружения
└── index.ts                 запуск и остановка процесса
```

В каждом feature-модуле одинаковое правило:

- `*.routes.ts` принимает HTTP-запрос и формирует HTTP-ответ;
- `*.schemas.ts` проверяет входные данные;
- `*.service.ts` содержит бизнес-правила;
- `*.repository.ts` читает и записывает SQLite;
- `*.types.ts` описывает типы данных;
- `*.mapper.ts` преобразует строки SQLite в API-объекты.

Новый SQL схемы добавляется отдельной следующей миграцией, например
`002-add-message-edits.ts`. Уже применённые миграции не редактируются: таблица
`schema_migrations` запоминает их версии. SQL внутри migration — намеренный
низкоуровневый формат, потому что миграция должна точно и воспроизводимо описывать
изменение базы; обычные маршруты и services этот SQL не видят.

## Миграции и тестовые пользователи

При запуске сервера миграции применяются автоматически, а seed идемпотентно создаёт:

- Алексей Иванов (`alexey`)
- Мария Петрова (`maria`)
- Дмитрий Соколов (`dmitry`)
- Анна Смирнова (`anna`)

Команды также можно выполнить отдельно:

```powershell
npm run db:migrate
npm run db:seed
```

## Development

```powershell
npm run dev
```

Health endpoints:

- `GET http://127.0.0.1:4100/health/live`
- `GET http://127.0.0.1:4100/health/ready`

## Production build

```powershell
npm run build
npm start
```

Production authentication пока не реализована. Без dev auth защищённые endpoints возвращают `401`.

## Проверки

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Integration tests используют отдельную in-memory/temporary SQLite и не изменяют локальную рабочую БД.

## Reset local DB

Команда удаляет только точный файл из `DATABASE_PATH`, его WAL/SHM и заново создаёт schema/seed. В production она заблокирована.

```powershell
npm run db:reset
```

## Backup SQLite

Используется SQLite backup API, поэтому активный WAL учитывается корректно:

```powershell
npm run db:backup
npm run db:backup -- C:\backup\ems-messenger.sqlite
```

Для восстановления остановите server, установите восстановленный файл как `DATABASE_PATH`, затем выполните `npm run db:migrate` и проверки health/history.

## Проверка двумя пользователями

Frontend ещё подключается отдельно. Для API-проверки два клиента должны иметь разные cookies:

1. Получить UUID через `GET /api/v1/dev/users`.
2. Для каждого пользователя отдельно вызвать `POST /api/v1/dev/session` с `{ "userId": "..." }` и сохранить cookie.
3. Создать DIRECT через `POST /api/v1/conversations/direct`.
4. Подключить оба Socket.IO client с соответствующей cookie и Origin `http://localhost:3000`.
5. Отправить `message:send`; второй client получит `message:new` после commit.

Этот online-сценарий автоматизирован в `test/integration.test.ts`.

## Надёжность и права

- Сообщение подтверждается и публикуется только после SQLite commit.
- `(senderId, clientMessageId)` защищает retry от дублей.
- `Conversation.nextMessageSequence` выделяет порядок атомарно в транзакции.
- Recovery выполняется через persisted history с `afterSequence`.
- `lastReadSequence` обновляется только монотонно.
- Socket rooms назначаются сервером после проверки session/membership.
- Новый участник видит сообщения только с `visibleFromSequence`.
- Removed member теряет REST и real-time доступ.

## Известные ограничения

- Один backend instance.
- Dev session предназначена только для localhost.
- Нет Keycloak, EMS identity sync, вложений, звонков и полнотекстового поиска.
- Browser IndexedDB outbox и UI находятся в зоне ответственности client.
- Для production-пилота нужно отдельно согласовать PostgreSQL, Keycloak, HTTPS и централизованную эксплуатацию.
