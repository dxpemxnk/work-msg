import type { Server as SocketServer } from 'socket.io';

import type { EventPublisher } from '../application/event-publisher.js';

export function createSocketEventPublisher(io: SocketServer): EventPublisher {
  return {
    messageCreated(message) {
      io.to(`conversation:${message.conversationId}`).emit('message:new', message);
    },
    messageChanged(message) {
      io.to(`conversation:${message.conversationId}`).emit('message:updated', message);
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
