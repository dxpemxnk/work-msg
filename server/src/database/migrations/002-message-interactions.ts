import type { Migration } from './migration.types.js';

export const messageInteractionsMigration: Migration = {
  version: 2,
  name: 'message_interactions',
  sql: `
    ALTER TABLE messages
      ADD COLUMN reply_to_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL;

    CREATE INDEX messages_reply_to_idx
      ON messages(reply_to_message_id)
      WHERE reply_to_message_id IS NOT NULL;

    CREATE TABLE message_reactions (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(message_id, user_id, emoji)
    );

    CREATE INDEX message_reactions_message_idx
      ON message_reactions(message_id);
  `,
};
