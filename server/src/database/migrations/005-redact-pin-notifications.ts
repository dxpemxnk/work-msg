import type { Migration } from './migration.types.js';

export const redactPinNotificationsMigration: Migration = {
  version: 5,
  name: 'redact_pin_notifications',
  sql: `
    UPDATE messages
    SET body = '📌 Закреплено сообщение'
    WHERE body LIKE '📌 Закреплено сообщение: %';
  `,
};
