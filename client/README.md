# EMS Messenger Client

Локальный React-клиент мессенджера. Он не зависит от `ems-frontend` и обращается
только к API `ems-messenger/server`.

## Стек

- React 18 + TypeScript
- MUI 5 + Emotion + Roboto
- Redux Toolkit и RTK Query
- Formik + Yup
- Socket.IO client
- IndexedDB для outbox
- Vite, ESLint и Vitest

## Структура

```text
src/
├── components/   переиспользуемые UI-компоненты без сценариев приложения
├── config/       URL backend и клиентские ограничения
├── containers/   stateful-сценарии и Formik-формы
├── pages/        страницы приложения
├── services/     RTK Query API, Socket.IO и IndexedDB
├── store/        конфигурация Redux store
├── types/        DTO и клиентские типы
├── utils/        форматирование, merge и hooks
├── App.tsx       bootstrap dev-сессии
└── main.tsx      React providers и запуск
```

Структура следует тем же принципам, что и `ems-frontend`, но содержит только
необходимые мессенджеру модули.

## Запуск

Сначала запустите backend на `localhost:4100`, затем:

```powershell
npm install
npm run dev
```

Клиент откроется на `http://localhost:3000`.

Для локальной cookie-сессии открывайте обе части через одно имя хоста
(`localhost`), не смешивая его с `127.0.0.1`.

## Проверки

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```
