import type { FastifyInstance } from 'fastify';
import { Server as SocketServer } from 'socket.io';

import type { AppConfig } from '../config.js';

export function createSocketServer(app: FastifyInstance, config: AppConfig): SocketServer {
  return new SocketServer(app.server, {
    cors: { origin: config.clientOrigin, credentials: true },
    serveClient: false,
    allowRequest(request, callback) {
      callback(null, request.headers.origin === config.clientOrigin);
    },
  });
}

