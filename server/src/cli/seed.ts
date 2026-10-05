import { loadConfig } from '../config.js';
import { migrateDatabase } from '../database/migrate-database.js';
import { openDatabase } from '../database/open-database.js';
import { UserRepository } from '../modules/users/user.repository.js';

const config = loadConfig();
const database = openDatabase(config.databasePath);
migrateDatabase(database);
const users = new UserRepository(database);
users.seed();
console.log(`Seed complete: ${users.list().length} users`);
database.close();
