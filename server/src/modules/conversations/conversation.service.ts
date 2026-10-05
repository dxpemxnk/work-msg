import { randomUUID } from 'node:crypto';

import type { EventPublisher } from '../../application/event-publisher.js';
import { errors } from '../../shared/errors/errors.js';
import type { UserRepository } from '../users/user.repository.js';
import type { MessageService } from '../messages/message.service.js';
import type { ConversationRepository } from './conversation.repository.js';

export class ConversationService {
  constructor(
    private readonly conversations: ConversationRepository,
    private readonly users: UserRepository,
    private readonly events: EventPublisher,
    private readonly messages: MessageService
  ) {}

  list(userId: string) {
    this.users.requireActive(userId);
    return this.conversations.listForUser(userId);
  }

  findById(userId: string, conversationId: string) {
    return this.conversations.getById(conversationId, userId);
  }

  createDirect(userId: string, peerId: string) {
    const conversation = this.conversations.createDirect(userId, peerId);
    this.events.conversationChanged(conversation);
    return conversation;
  }

  createGroup(userId: string, title: string, memberIds: string[]) {
    const cleanTitle = this.cleanTitle(title);
    const conversation = this.conversations.createGroup(userId, cleanTitle, memberIds);
    this.events.conversationChanged(conversation);
    return conversation;
  }

  updateTitle(userId: string, conversationId: string, title: string) {
    const conversation = this.conversations.updateTitle(conversationId, userId, this.cleanTitle(title));
    this.events.conversationChanged(conversation);
    return conversation;
  }

  addMember(userId: string, conversationId: string, memberId: string) {
    const addedUser = this.users.requireActive(memberId);
    this.conversations.addMember(conversationId, userId, memberId);
    this.messages.send(userId, {
      conversationId,
      clientMessageId: randomUUID(),
      body: `👤 ${addedUser.displayName} добавлен(а) в беседу`,
    });
    const updatedConversation = this.conversations.getById(conversationId, userId);
    this.events.conversationChanged(updatedConversation);
    return updatedConversation;
  }

  removeMember(userId: string, conversationId: string, memberId: string) {
    const removedUser = this.users.requireActive(memberId);
    this.conversations.removeMember(conversationId, userId, memberId);
    this.messages.send(userId, {
      conversationId,
      clientMessageId: randomUUID(),
      body: `👤 ${removedUser.displayName} исключён(а) из беседы`,
    });
    this.events.membershipRemoved(conversationId, memberId);
    const updatedConversation = this.conversations.getById(conversationId, userId);
    this.events.conversationChanged(updatedConversation);
    return updatedConversation;
  }

  leave(userId: string, conversationId: string): void {
    const leavingUser = this.users.requireActive(userId);
    this.messages.send(userId, {
      conversationId,
      clientMessageId: randomUUID(),
      body: `👤 ${leavingUser.displayName} покинул(а) беседу`,
    });
    this.conversations.leaveGroup(conversationId, userId);
    this.events.membershipRemoved(conversationId, userId);
  }

  private cleanTitle(title: string): string {
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 120) {
      throw errors.validation('Название группы должно содержать от 1 до 120 символов');
    }
    return cleanTitle;
  }
}
