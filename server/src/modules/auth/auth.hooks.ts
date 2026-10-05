import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../../config.js';
import { errors } from '../../shared/errors/errors.js';
import type { UserRepository } from '../users/user.repository.js';
import { userIdFromHttpRequest } from './session-reader.js';

export function registerAuthHooks(app: FastifyInstance, config: AppConfig, users: UserRepository): void {
  app.decorateRequest('currentUserId', '');

  app.addHook('preHandler', (request, _reply, done) => {
    if (request.routeOptions.config.public === true) {
      done();
      return;
    }
    request.currentUserId = userIdFromHttpRequest(request, users);
    done();
  });

  app.addHook('onRequest', (request, _reply, done) => {
    const { origin } = request.headers;
    if (origin && origin !== config.clientOrigin) {
      done(errors.forbidden('Недопустимый Origin'));
      return;
    }
    done();
  });
}

