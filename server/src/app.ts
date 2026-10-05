import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Server as SocketServer } from 'socket.io';

import type { AppConfig } from './config.js';
import type { SqliteDatabase } from './database/database.types.js';
import { migrateDatabase } from './database/migrate-database.js';
import { openDatabase } from './database/open-database.js';
import { registerAuthHooks } from './modules/auth/auth.hooks.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { ConversationRepository } from './modules/conversations/conversation.repository.js';
import { registerConversationRoutes } from './modules/conversations/conversation.routes.js';
import { ConversationService } from './modules/conversations/conversation.service.js';
import { registerHealthRoutes } from './modules/health/health.routes.js';
import { MessageRepository } from './modules/messages/message.repository.js';
import { registerMessageRoutes } from './modules/messages/message.routes.js';
import { MessageService } from './modules/messages/message.service.js';
import { UserRepository } from './modules/users/user.repository.js';
import { registerUserRoutes } from './modules/users/user.routes.js';
import { UserService } from './modules/users/user.service.js';
import { createSocketServer } from './realtime/create-socket-server.js';
import { registerSocketHandlers } from './realtime/register-socket-handlers.js';
import { createSocketEventPublisher } from './realtime/socket-event-publisher.js';
import { registerErrorHandler } from './shared/http/error-response.js';
import './shared/http/fastify-types.js';

export interface BuiltApp {
  app: FastifyInstance;
  io: SocketServer;
  database: SqliteDatabase;
  repositories: {
    users: UserRepository;
    conversations: ConversationRepository;
    messages: MessageRepository;
  };
  services: {
    users: UserService;
    conversations: ConversationService;
    messages: MessageService;
  };
}

export async function buildApp(config: AppConfig): Promise<BuiltApp> {
  const app = Fastify({
    logger:
      config.nodeEnv === 'test'
        ? false
        : {
            level: config.nodeEnv === 'production' ? 'info' : 'debug',
            redact: ['req.headers.authorization', 'req.headers.cookie'],
          },
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cookie, { secret: config.sessionSecret, hook: 'onRequest' });
  await app.register(cors, {
    origin: config.clientOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  const database = openDatabase(config.databasePath);
  migrateDatabase(database);

  const userRepository = new UserRepository(database);
  userRepository.seed();
  const conversationRepository = new ConversationRepository(database, userRepository);
  const messageRepository = new MessageRepository(database, conversationRepository);

  const io = createSocketServer(app, config);
  const events = createSocketEventPublisher(io);

  const userService = new UserService(userRepository);
  const messageService = new MessageService(messageRepository, events, config.messageMaxLength);
  const conversationService = new ConversationService(conversationRepository, userRepository, events, messageService);

  registerAuthHooks(app, config, userRepository);
  registerErrorHandler(app);
  registerHealthRoutes(app, database);
  registerAuthRoutes(app, config, userRepository, userService);
  registerUserRoutes(app, userService);
  registerConversationRoutes(app, conversationService);
  registerMessageRoutes(app, messageService);
  registerSocketHandlers(app, io, userRepository, conversationRepository, messageService);

  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    database.close();
  });

  return {
    app,
    io,
    database,
    repositories: {
      users: userRepository,
      conversations: conversationRepository,
      messages: messageRepository,
    },
    services: {
      users: userService,
      conversations: conversationService,
      messages: messageService,
    },
  };
}
