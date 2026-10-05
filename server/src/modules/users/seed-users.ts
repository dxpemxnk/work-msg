import { randomUUID } from 'node:crypto';

import type { SqliteDatabase } from '../../database/database.types.js';

const demoUsers = [
  ['alexey', 'Алексей Иванов', '#3766D5'],
  ['maria', 'Мария Петрова', '#B04BB3'],
  ['dmitry', 'Дмитрий Соколов', '#E07824'],
  ['anna', 'Анна Смирнова', '#168A72'],
] as const;

export function seedUsers(database: SqliteDatabase): void {
  const now = new Date().toISOString();
  const insertUser = database.prepare(`
    INSERT OR IGNORE INTO users(
      id, login, display_name, avatar_color, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
  `);

  const seed = database.transaction(() => {
    for (const [login, displayName, avatarColor] of demoUsers) {
      insertUser.run(randomUUID(), login, displayName, avatarColor, now, now);
    }
  });

  seed();
}

