import type { Server as SocketServer } from 'socket.io';

import type { EventPublisher } from '../application/event-publisher.js';
import type { ConversationRepository } from '../modules/conversations/conversation.repository.js';
import type { MessageRepository } from '../modules/messages/message.repository.js';
import type { GroupCallRegistry } from './group-call-registry.js';

export function createSocketEventPublisher(
  io: SocketServer,
  conversations: ConversationRepository,
  messages: MessageRepository,
  groupCalls: GroupCallRegistry
): EventPublisher {
  const emitVisibleMessage = (event: 'message:new' | 'message:updated', messageId: string, conversationId: string, sequence: number) => {
    for (const userId of conversations.activeUserIdsVisibleAt(conversationId, sequence)) {
      const visibleMessage = messages.findVisibleById(messageId, userId);
      if (visibleMessage) io.to(`user:${userId}`).emit(event, visibleMessage);
    }
  };

  return {
    messageCreated(message) {
      emitVisibleMessage('message:new', message.id, message.conversationId, message.sequence);
    },
    messageChanged(message) {
      emitVisibleMessage('message:updated', message.id, message.conversationId, message.sequence);
    },
    conversationChanged(conversation) {
      for (const { user } of conversation.members) {
        const userRoom = `user:${user.id}`;
        io.in(userRoom).socketsJoin(`conversation:${conversation.id}`);
        io.to(userRoom).emit('conversation:updated', { conversationId: conversation.id });
      }
    },
    membershipRemoved(conversationId, userId) {
      const userRoom = `user:${userId}`;
      const groupCall = groupCalls.leave(conversationId, userId);
      if (groupCall) {
        io.to(userRoom).emit('group-call:access-revoked', { conversationId });
        io.to(`conversation:${conversationId}`).emit('group-call:user-left', { conversationId, userId });
      }
      io.in(userRoom).socketsLeave(`conversation:${conversationId}`);
      io.to(userRoom).emit('membership:updated', { conversationId, active: false });
    },
    readChanged(conversationId, userId, sequence) {
      io.to(`conversation:${conversationId}`).emit('read:updated', {
        conversationId,
        userId,
        lastReadSequence: sequence,
      });
    },
  };
}
