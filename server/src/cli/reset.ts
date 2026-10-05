import { existsSync, rmSync } from 'node:fs';

import { loadConfig } from '../config.js';
import { migrateDatabase } from '../database/migrate-database.js';
import { openDatabase } from '../database/open-database.js';
import { UserRepository } from '../modules/users/user.repository.js';

const config = loadConfig();
if (config.nodeEnv === 'production') throw new Error('Database reset is disabled in production');
if (config.databasePath === ':memory:') throw new Error('Cannot reset in-memory database');
for (const suffix of ['', '-wal', '-shm']) {
  const path = `${config.databasePath}${suffix}`;
  if (existsSync(path)) rmSync(path);
}
const database = openDatabase(config.databasePath);
migrateDatabase(database);
const users = new UserRepository(database);
users.seed();
database.close();
console.log(`Database reset: ${config.databasePath}`);
