import type { FastifyInstance } from 'fastify';

import { idParamsSchema } from '../../shared/validation/common-schemas.js';
import { messageHistoryQuerySchema, messageSearchQuerySchema, sendMessageBodySchema, toggleReactionBodySchema, updateReadBodySchema } from './message.schemas.js';
import type { MessageService } from './message.service.js';
import type { MessageCursor } from './message.types.js';

export function registerMessageRoutes(app: FastifyInstance, messages: MessageService): void {
  app.get('/api/v1/conversations/:id/messages/search', (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const { query, limit } = messageSearchQuerySchema.parse(request.query);
    return { messages: messages.search(request.currentUserId, id, query, limit) };
  });

  app.get('/api/v1/conversations/:id/messages/pinned', (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return { messages: messages.listPinned(request.currentUserId, id) };
  });

  app.get('/api/v1/conversations/:id/messages', (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const { beforeSequence, afterSequence, limit } = messageHistoryQuerySchema.parse(request.query);
    const cursor: MessageCursor = { limit };
    if (beforeSequence !== undefined) cursor.before = beforeSequence;
    if (afterSequence !== undefined) cursor.after = afterSequence;
    return { messages: messages.list(request.currentUserId, id, cursor) };
  });

  app.post('/api/v1/conversations/:id/messages', (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const { clientMessageId, body, replyToMessageId, forwardedFromMessageId } = sendMessageBodySchema.parse(request.body);
    const command = {
      conversationId: id,
      clientMessageId,
      body,
      ...(replyToMessageId ? { replyToMessageId } : {}),
      ...(forwardedFromMessageId ? { forwardedFromMessageId } : {}),
    };
    const result = messages.send(request.currentUserId, command);
    return reply.status(result.deduplicated ? 200 : 201).send(result);
  });

  app.post('/api/v1/messages/:id/reactions', (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const { emoji } = toggleReactionBodySchema.parse(request.body);
    return messages.toggleReaction(request.currentUserId, id, emoji);
  });

  app.post('/api/v1/messages/:id/pin', (request) => {
    const { id } = idParamsSchema.parse(request.params);
    return messages.togglePin(request.currentUserId, id);
  });

  app.post('/api/v1/conversations/:id/read', (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const { sequence } = updateReadBodySchema.parse(request.body);
    return messages.markRead(request.currentUserId, id, sequence);
  });
}
