import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { AppConfig } from '../../config.js';
import { uuidSchema } from '../../shared/validation/common-schemas.js';
import type { UserRepository } from '../users/user.repository.js';
import type { UserService } from '../users/user.service.js';
import { SESSION_COOKIE } from './auth.constants.js';

const createDevSessionSchema = z.object({ userId: uuidSchema });

export function registerAuthRoutes(
  app: FastifyInstance,
  config: AppConfig,
  userRepository: UserRepository,
  userService: UserService
): void {
  if (config.devAuthEnabled && config.nodeEnv !== 'production') {
    app.post('/api/v1/dev/session', { config: { public: true } }, (request, reply) => {
      const { userId } = createDevSessionSchema.parse(request.body);
      const user = userRepository.requireActive(userId);
      void reply.setCookie(SESSION_COOKIE, userId, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        signed: true,
        maxAge: 60 * 60 * 12,
      });
      return { user };
    });

    app.get('/api/v1/dev/users', { config: { public: true } }, () => ({ users: userService.list() }));
  }

  app.delete('/api/v1/session', (_request, reply) => {
    void reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send();
  });
}

