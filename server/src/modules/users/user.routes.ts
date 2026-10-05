import type { FastifyInstance } from 'fastify';

import type { UserService } from './user.service.js';

export function registerUserRoutes(app: FastifyInstance, users: UserService): void {
  app.get('/api/v1/me', (request) => ({ user: users.findById(request.currentUserId) }));
  app.get('/api/v1/users', () => ({ users: users.list() }));
}

