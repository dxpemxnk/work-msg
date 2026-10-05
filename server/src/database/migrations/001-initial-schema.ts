import type { Migration } from './migration.types.js';

// SQL in a migration is intentional: it is the exact, versioned description
// of the database change. Application code never imports or executes this SQL directly.
export const initialSchemaMigration: Migration = {
  version: 1,
  name: 'initial_schema',
  sql: `
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      login TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar_color TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DISABLED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE external_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      subject TEXT NOT NULL,
      external_user_id TEXT,
      external_clerk_id TEXT,
      login_snapshot TEXT,
      UNIQUE(provider, subject)
    );

    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('DIRECT', 'GROUP')),
      title TEXT,
      direct_key TEXT,
      next_message_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_message_sequence > 0),
      status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DELETED')),
      created_by_id TEXT NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (type = 'DIRECT' AND direct_key IS NOT NULL AND title IS NULL) OR
        (type = 'GROUP' AND direct_key IS NULL AND title IS NOT NULL)
      )
    );

    CREATE UNIQUE INDEX conversations_direct_key_uq
      ON conversations(direct_key)
      WHERE direct_key IS NOT NULL;

    CREATE TABLE conversation_members (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK (role IN ('OWNER', 'MEMBER')),
      visible_from_sequence INTEGER NOT NULL CHECK (visible_from_sequence > 0),
      last_read_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_read_sequence >= 0),
      joined_at TEXT NOT NULL,
      left_at TEXT,
      UNIQUE(conversation_id, user_id)
    );

    CREATE INDEX conversation_members_user_idx
      ON conversation_members(user_id, left_at);

    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id),
      client_message_id TEXT NOT NULL,
      sequence INTEGER NOT NULL CHECK (sequence > 0),
      body TEXT NOT NULL CHECK (length(body) > 0),
      created_at TEXT NOT NULL,
      UNIQUE(sender_id, client_message_id),
      UNIQUE(conversation_id, sequence)
    );

    CREATE INDEX messages_conversation_sequence_idx
      ON messages(conversation_id, sequence);
  `,
};

