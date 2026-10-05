# EMS Messenger

Локальный демонстрационный сервис корпоративного мессенджера. Проект разрабатывается
отдельно от `ems-frontend` и не изменяет его код.

## Стек

- React 18, TypeScript, MUI, Formik, Redux Toolkit и RTK Query;
- Fastify, Socket.IO и TypeScript;
- SQLite с версионируемыми миграциями;
- WebRTC для личных и групповых звонков.

## Возможности

- личные диалоги и групповые беседы;
- ответы, пересылка, реакции и статусы прочтения;
- поиск по истории и закреплённые сообщения;
- управление участниками группы;
- статусы присутствия и карточки пользователей;
- личные аудио/видеозвонки и групповые звонки;
- восстановление неподтверждённых отправок из IndexedDB.

## Требования

- Node.js 22 или новее;
- npm 10 или новее.

## Запуск

В первом PowerShell-окне:

```powershell
cd server
npm install
Copy-Item .env.example .env
npm run dev
```

Во втором PowerShell-окне:

```powershell
cd client
npm install
npm run dev
```

Клиент: <http://localhost:3000>  
Backend health: <http://127.0.0.1:4100/health/ready>

При первом запуске backend сам применит миграции и создаст тестовых пользователей.
Локальная SQLite-база в Git не публикуется.

## Проверки

Команды выполняются отдельно в `client` и `server`:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## Документация

- [Подробный разбор архитектуры](docs/PROJECT_GUIDE.md)
- [Backend](server/README.md)
- [Frontend](client/README.md)

## Статус

Это локальный демостенд. Production-аутентификация, STUN/TURN-инфраструктура и интеграция
с основной EMS-системой относятся к следующему этапу.
