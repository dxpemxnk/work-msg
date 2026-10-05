import type { SqliteDatabase } from './database.types.js';
import { migrations } from './migrations/index.js';

interface AppliedMigrationRow {
  version: number;
}

export function migrateDatabase(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const rows = database.prepare('SELECT version FROM schema_migrations').all() as AppliedMigrationRow[];
  const appliedVersions = new Set(rows.map(({ version }) => version));

  const applyMigration = database.transaction((version: number, name: string, sql: string) => {
    database.exec(sql);
    database
      .prepare('INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)')
      .run(version, name, new Date().toISOString());
  });

  for (const { version, name, sql } of migrations) {
    if (!appliedVersions.has(version)) applyMigration(version, name, sql);
  }
}

