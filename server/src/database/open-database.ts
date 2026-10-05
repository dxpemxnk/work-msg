import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

import type { SqliteDatabase } from './database.types.js';

export function openDatabase(path: string): SqliteDatabase {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const database = new Database(path);
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  if (path !== ':memory:') database.pragma('journal_mode = WAL');

  return database;
}

