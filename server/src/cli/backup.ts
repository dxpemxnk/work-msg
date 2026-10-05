import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { loadConfig } from '../config.js';
import { openDatabase } from '../database/open-database.js';

const config = loadConfig();
if (config.databasePath === ':memory:') throw new Error('Cannot backup in-memory database');
const destination = resolve(process.argv[2] ?? `./data/backups/ems-messenger-${new Date().toISOString().replaceAll(':', '-')}.sqlite`);
mkdirSync(dirname(destination), { recursive: true });
const database = openDatabase(config.databasePath);
try {
  await database.backup(destination);
  console.log(`Backup created: ${destination}`);
} finally {
  database.close();
}
