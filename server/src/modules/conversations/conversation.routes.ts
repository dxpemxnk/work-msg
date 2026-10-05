import type { FastifyInstance } from 'fastify';

import { idParamsSchema } from '../../shared/validation/common-schemas.js';
import {
  addMemberSchema,
  createDirectSchema,
  createGroupSchema,
  memberParamsSchema,
  updateTitleSchema,
} from './conversation.schemas.js';
import type { ConversationService } from './conversation.service.js';

export function registerConversationRoutes(app: FastifyInstance, conversations: ConversationService): void {
  app.get('/api/v1/conversations', (request) => ({
    conversations: conversations.list(request.currentUserId),
  }));

  app.get('/api/v1/conversations/:id', (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return { conversation: conversations.findById(request.currentUserId, id) };
  });

  app.post('/api/v1/conversations/direct', (request, reply) => {
    const { userId } = createDirectSchema.parse(request.body);
    const conversation = conversations.createDirect(request.currentUserId, userId);
    return reply.status(201).send({ conversation });
  });

  app.post('/api/v1/conversations/group', (request, reply) => {
    const { title, memberIds } = createGroupSchema.parse(request.body);
    const conversation = conversations.createGroup(request.currentUserId, title, memberIds);
    return reply.status(201).send({ conversation });
  });

  app.patch('/api/v1/conversations/:id', (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const { title } = updateTitleSchema.parse(request.body);
    return { conversation: conversations.updateTitle(request.currentUserId, id, title) };
  });

  app.post('/api/v1/conversations/:id/members', (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const { userId } = addMemberSchema.parse(request.body);
    return { conversation: conversations.addMember(request.currentUserId, id, userId) };
  });

  app.delete('/api/v1/conversations/:id/members/:userId', (request) => {
    const { id, userId } = memberParamsSchema.parse(request.params);
    return { conversation: conversations.removeMember(request.currentUserId, id, userId) };
  });

  app.post('/api/v1/conversations/:id/leave', (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    conversations.leave(request.currentUserId, id);
    return reply.status(204).send();
  });
}

