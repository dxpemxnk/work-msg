import type { ConversationDto } from '../modules/conversations/conversation.types.js';
import type { MessageDto } from '../modules/messages/message.types.js';

export interface EventPublisher {
  messageCreated(message: MessageDto): void;
  messageChanged(message: MessageDto): void;
  conversationChanged(conversation: ConversationDto): void;
  membershipRemoved(conversationId: string, userId: string): void;
  readChanged(conversationId: string, userId: string, sequence: number): void;
}

export const noEvents: EventPublisher = {
  messageCreated() {},
  messageChanged() {},
  conversationChanged() {},
  membershipRemoved() {},
  readChanged() {},
};
