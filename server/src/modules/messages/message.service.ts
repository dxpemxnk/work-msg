import { randomUUID } from 'node:crypto';

import type { EventPublisher } from '../../application/event-publisher.js';
import { errors } from '../../shared/errors/errors.js';
import type { MessageRepository } from './message.repository.js';
import type { MessageCursor, SendMessageCommand } from './message.types.js';

export class MessageService {
  constructor(
    private readonly messages: MessageRepository,
    private readonly events: EventPublisher,
    private readonly maxLength: number
  ) {}

  list(userId: string, conversationId: string, cursor: MessageCursor) {
    return this.messages.list(conversationId, userId, cursor);
  }

  search(userId: string, conversationId: string, query: string, limit: number) {
    return this.messages.search(conversationId, userId, query, limit);
  }

  send(userId: string, command: SendMessageCommand) {
    const result = this.persist(userId, command);
    this.publishPersisted(result);
    return { ok: true as const, ...result };
  }

  persist(userId: string, command: SendMessageCommand) {
    const body = command.body.trim();
    if (!body || body.length > this.maxLength) {
      throw errors.validation(`Сообщение должно содержать от 1 до ${this.maxLength} символов`);
    }

    const result = this.messages.append(
      userId,
      command.conversationId,
      command.clientMessageId,
      body,
      command.replyToMessageId,
      command.forwardedFromMessageId
    );
    return result;
  }

  publishPersisted(result: ReturnType<MessageRepository['append']>): void {
    if (!result.deduplicated) this.events.messageCreated(result.message);
  }

  toggleReaction(userId: string, messageId: string, emoji: string) {
    const message = this.messages.toggleReaction(messageId, userId, emoji);
    this.events.messageChanged(message);
    return { message };
  }

  listPinned(userId: string, conversationId: string) {
    return this.messages.listPinned(conversationId, userId);
  }

  togglePin(userId: string, messageId: string) {
    const message = this.messages.togglePin(messageId, userId);
    this.events.messageChanged(message);
    if (message.isPinned) {
      this.send(userId, {
        conversationId: message.conversationId,
        clientMessageId: randomUUID(),
        body: `📌 Закреплено сообщение: ${message.body.slice(0, 120)}`,
        replyToMessageId: message.id,
      });
    }
    return { message };
  }

  markRead(userId: string, conversationId: string, sequence: number) {
    const persistedSequence = this.messages.updateRead(conversationId, userId, sequence);
    this.events.readChanged(conversationId, userId, persistedSequence);
    return { conversationId, lastReadSequence: persistedSequence };
  }
}
