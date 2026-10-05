import { loadConfig } from '../config.js';
import { migrateDatabase } from '../database/migrate-database.js';
import { openDatabase } from '../database/open-database.js';

const config = loadConfig();
const database = openDatabase(config.databasePath);
migrateDatabase(database);
database.close();
console.log(`Migrations applied: ${config.databasePath}`);
