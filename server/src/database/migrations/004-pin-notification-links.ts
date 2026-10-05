import type { Migration } from './migration.types.js';

export const pinNotificationLinksMigration: Migration = {
  version: 4,
  name: 'pin_notification_links',
  sql: `
    UPDATE messages AS notice
    SET reply_to_message_id = (
      SELECT target.id
      FROM messages AS target
      WHERE target.conversation_id = notice.conversation_id
        AND target.sequence < notice.sequence
        AND substr(target.body, 1, 120) = substr(
          notice.body,
          length('📌 Закреплено сообщение: ') + 1
        )
      ORDER BY target.sequence DESC
      LIMIT 1
    )
    WHERE notice.reply_to_message_id IS NULL
      AND notice.body LIKE '📌 Закреплено сообщение: %'
      AND EXISTS (
        SELECT 1
        FROM messages AS target
        WHERE target.conversation_id = notice.conversation_id
          AND target.sequence < notice.sequence
          AND substr(target.body, 1, 120) = substr(
            notice.body,
            length('📌 Закреплено сообщение: ') + 1
          )
      );
  `,
};
