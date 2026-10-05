import type { FastifyInstance } from 'fastify';

import type { SqliteDatabase } from '../../database/database.types.js';

export function registerHealthRoutes(app: FastifyInstance, database: SqliteDatabase): void {
  app.get('/health/live', { config: { public: true } }, () => ({ status: 'ok' }));
  app.get('/health/ready', { config: { public: true } }, () => {
    database.prepare('SELECT 1').get();
    return { status: 'ready' };
  });
}

