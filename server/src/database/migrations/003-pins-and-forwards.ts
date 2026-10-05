import type { Migration } from './migration.types.js';

export const pinsAndForwardsMigration: Migration = {
  version: 3,
  name: 'pins_and_forwards',
  sql: `
    ALTER TABLE messages
      ADD COLUMN forwarded_from_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL;

    CREATE INDEX messages_forwarded_from_idx
      ON messages(forwarded_from_message_id)
      WHERE forwarded_from_message_id IS NOT NULL;

    CREATE TABLE conversation_pins (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      pinned_by_id TEXT NOT NULL REFERENCES users(id),
      pinned_at TEXT NOT NULL,
      PRIMARY KEY(conversation_id, message_id)
    );

    CREATE INDEX conversation_pins_order_idx
      ON conversation_pins(conversation_id, pinned_at DESC);
  `,
};
