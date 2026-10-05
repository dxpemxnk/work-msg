import type { FastifyInstance } from 'fastify';
import type { Server as SocketServer } from 'socket.io';
import { z } from 'zod';

import type { ConversationRepository } from '../modules/conversations/conversation.repository.js';
import { socketSendMessageSchema, socketUpdateReadSchema } from '../modules/messages/message.schemas.js';
import type { MessageService } from '../modules/messages/message.service.js';
import type { MessageAck } from '../modules/messages/message.types.js';
import { userIdFromSocketRequest } from '../modules/auth/session-reader.js';
import type { UserRepository } from '../modules/users/user.repository.js';
import { errors } from '../shared/errors/errors.js';
import { uuidSchema } from '../shared/validation/common-schemas.js';
import { CallRegistry } from './call-registry.js';
import {
  answerCallSchema,
  callIceSchema,
  callIdSchema,
  groupCallIceSchema,
  groupCallJoinSchema,
  groupCallLeaveSchema,
  groupCallRelaySchema,
  startCallSchema,
} from './call.schemas.js';
import { callEndReason, callSummaryBody, type CallEndReason } from './call-summary.js';
import { GroupCallRegistry } from './group-call-registry.js';
import { PresenceRegistry } from './presence-registry.js';
import { toSocketFailure } from './socket-failure.js';

const socketDataSchema = z.object({ userId: uuidSchema });

export function registerSocketHandlers(
  app: FastifyInstance,
  io: SocketServer,
  users: UserRepository,
  conversations: ConversationRepository,
  messages: MessageService
): void {
  const presence = new PresenceRegistry();
  const calls = new CallRegistry();
  const groupCalls = new GroupCallRegistry();
  const publishCallSummary = (call: ReturnType<CallRegistry['end']>, reason: CallEndReason) => {
    try {
      messages.send(call.callerId, {
        conversationId: call.conversationId,
        clientMessageId: `call-summary:${call.id}`,
        body: callSummaryBody(call, reason),
      });
    } catch (error) {
      app.log.error({ err: error, callId: call.id }, 'call summary persistence failed');
    }
  };

  io.use((socket, next) => {
    try {
      Object.assign(socket.data as object, { userId: userIdFromSocketRequest(app, socket.request, users) });
      next();
    } catch (error) {
      next(new Error(toSocketFailure(error).error.code));
    }
  });

  io.on('connection', async (socket) => {
    const { userId } = socketDataSchema.parse(socket.data as unknown);
    await socket.join(`user:${userId}`);
    await socket.join(conversations.activeIdsForUser(userId).map((id) => `conversation:${id}`));
    const becameOnline = presence.connect(userId);
    app.log.info({ socketId: socket.id, userId }, 'socket connected');
    socket.emit('connection:ready', { userId });
    socket.emit('presence:snapshot', { userIds: presence.onlineUserIds() });
    if (becameOnline) io.emit('presence:updated', { userId, online: true });

    socket.on('message:send', (payload: unknown, acknowledge: (result: MessageAck) => void) => {
      try {
        const { conversationId, clientMessageId, body, replyToMessageId, forwardedFromMessageId } = socketSendMessageSchema.parse(payload);
        acknowledge(messages.send(userId, {
          conversationId,
          clientMessageId,
          body,
          ...(replyToMessageId ? { replyToMessageId } : {}),
          ...(forwardedFromMessageId ? { forwardedFromMessageId } : {}),
        }));
      } catch (error) {
        app.log.warn({ err: error, userId }, 'message send failed');
        acknowledge(toSocketFailure(error));
      }
    });

    socket.on('read:update', (payload: unknown, acknowledge?: (result: unknown) => void) => {
      try {
        const { conversationId, sequence } = socketUpdateReadSchema.parse(payload);
        acknowledge?.({ ok: true, ...messages.markRead(userId, conversationId, sequence) });
      } catch (error) {
        acknowledge?.(toSocketFailure(error));
      }
    });

    socket.on('call:start', (payload: unknown, acknowledge?: (result: unknown) => void) => {
      try {
        const { callId, conversationId, mode, offer } = startCallSchema.parse(payload);
        const conversation = conversations.getById(conversationId, userId);
        if (conversation.type !== 'DIRECT') throw errors.validation('Звонки пока доступны только в личных диалогах');
        const peer = conversation.members.find(({ user }) => user.id !== userId)?.user;
        if (!peer) throw errors.notFound('Собеседник не найден');
        if (!presence.isOnline(peer.id)) throw errors.conflict('Пользователь не в сети');
        if (groupCalls.hasUser(userId)) throw errors.conflict('Сначала завершите групповой звонок');
        if (groupCalls.hasUser(peer.id)) throw errors.conflict('Пользователь участвует в групповом звонке');

        calls.start({ id: callId, conversationId, callerId: userId, calleeId: peer.id, mode });
        io.to(`user:${peer.id}`).emit('call:incoming', {
          callId,
          conversationId,
          mode,
          offer,
          caller: users.requireActive(userId),
        });
        acknowledge?.({ ok: true });
      } catch (error) {
        acknowledge?.(toSocketFailure(error));
      }
    });

    socket.on('call:answer', (payload: unknown, acknowledge?: (result: unknown) => void) => {
      try {
        const { callId, answer } = answerCallSchema.parse(payload);
        const call = calls.answer(callId, userId);
        io.to(`user:${call.callerId}`).emit('call:answered', { callId, answer });
        acknowledge?.({ ok: true });
      } catch (error) {
        acknowledge?.(toSocketFailure(error));
      }
    });

    socket.on('call:ice', (payload: unknown) => {
      try {
        const { callId, candidate } = callIceSchema.parse(payload);
        const call = calls.requireParticipant(callId, userId);
        io.to(`user:${calls.peerId(call, userId)}`).emit('call:ice', { callId, candidate });
      } catch (error) {
        app.log.warn({ err: error, userId }, 'call ICE relay failed');
      }
    });

    socket.on('call:reject', (payload: unknown, acknowledge?: (result: unknown) => void) => {
      try {
        const { callId } = callIdSchema.parse(payload);
        const call = calls.requireParticipant(callId, userId);
        if (call.calleeId !== userId) throw errors.forbidden('Отклонить звонок может только вызываемый пользователь');
        calls.end(callId, userId);
        publishCallSummary(call, 'rejected');
        io.to(`user:${call.callerId}`).emit('call:rejected', { callId });
        acknowledge?.({ ok: true });
      } catch (error) {
        acknowledge?.(toSocketFailure(error));
      }
    });

    socket.on('call:end', (payload: unknown, acknowledge?: (result: unknown) => void) => {
      try {
        const { callId } = callIdSchema.parse(payload);
        const call = calls.end(callId, userId);
        publishCallSummary(call, callEndReason(call, userId));
        io.to(`user:${calls.peerId(call, userId)}`).emit('call:ended', { callId, reason: 'peer-ended' });
        acknowledge?.({ ok: true });
      } catch (error) {
        acknowledge?.(toSocketFailure(error));
      }
    });

    socket.on('group-call:join', (payload: unknown, acknowledge?: (result: unknown) => void) => {
      try {
        const { conversationId, mode } = groupCallJoinSchema.parse(payload);
        const conversation = conversations.getById(conversationId, userId);
        if (conversation.type !== 'GROUP') throw errors.validation('Групповой звонок доступен только в беседе');
        if (calls.hasUser(userId)) throw errors.conflict('Сначала завершите личный звонок');

        const { existingParticipantIds } = groupCalls.join(conversationId, userId, mode);
        const participantIds = existingParticipantIds.filter((id) =>
          conversation.members.some(({ user }) => user.id === id)
        );
        socket.to(`conversation:${conversationId}`).emit('group-call:user-joined', {
          conversationId,
          mode,
          user: users.requireActive(userId),
        });
        acknowledge?.({
          ok: true,
          mode,
          participants: participantIds.map((id) => users.requireActive(id)),
        });
      } catch (error) {
        acknowledge?.(toSocketFailure(error));
      }
    });

    socket.on('group-call:offer', (payload: unknown) => {
      try {
        const { conversationId, targetUserId, description } = groupCallRelaySchema.parse(payload);
        if (description.type !== 'offer') throw errors.validation('Ожидалось предложение соединения');
        groupCalls.requirePeer(conversationId, userId, targetUserId);
        io.to(`user:${targetUserId}`).emit('group-call:offer', {
          conversationId,
          fromUser: users.requireActive(userId),
          description,
        });
      } catch (error) {
        app.log.warn({ err: error, userId }, 'group call offer relay failed');
      }
    });

    socket.on('group-call:answer', (payload: unknown) => {
      try {
        const { conversationId, targetUserId, description } = groupCallRelaySchema.parse(payload);
        if (description.type !== 'answer') throw errors.validation('Ожидался ответ соединения');
        groupCalls.requirePeer(conversationId, userId, targetUserId);
        io.to(`user:${targetUserId}`).emit('group-call:answer', {
          conversationId,
          fromUserId: userId,
          description,
        });
      } catch (error) {
        app.log.warn({ err: error, userId }, 'group call answer relay failed');
      }
    });

    socket.on('group-call:ice', (payload: unknown) => {
      try {
        const { conversationId, targetUserId, candidate } = groupCallIceSchema.parse(payload);
        groupCalls.requirePeer(conversationId, userId, targetUserId);
        io.to(`user:${targetUserId}`).emit('group-call:ice', {
          conversationId,
          fromUserId: userId,
          candidate,
        });
      } catch (error) {
        app.log.warn({ err: error, userId }, 'group call ICE relay failed');
      }
    });

    socket.on('group-call:leave', (payload: unknown, acknowledge?: (result: unknown) => void) => {
      try {
        const { conversationId } = groupCallLeaveSchema.parse(payload);
        groupCalls.requireParticipant(conversationId, userId);
        groupCalls.leave(conversationId, userId);
        socket.to(`conversation:${conversationId}`).emit('group-call:user-left', { conversationId, userId });
        acknowledge?.({ ok: true });
      } catch (error) {
        acknowledge?.(toSocketFailure(error));
      }
    });

    socket.on('disconnect', (reason) => {
      if (presence.disconnect(userId)) {
        const groupCall = groupCalls.leaveForUser(userId);
        if (groupCall) {
          socket.to(`conversation:${groupCall.conversationId}`).emit('group-call:user-left', {
            conversationId: groupCall.conversationId,
            userId,
          });
        }
        io.emit('presence:updated', { userId, online: false });
        const call = calls.endForUser(userId);
        if (call) {
          publishCallSummary(call, callEndReason(call, userId, true));
          io.to(`user:${calls.peerId(call, userId)}`).emit('call:ended', { callId: call.id, reason: 'peer-offline' });
        }
      }
      app.log.info({ socketId: socket.id, userId, reason }, 'socket disconnected');
    });
    socket.on('error', (error) => {
      app.log.warn({ socketId: socket.id, userId, err: error }, 'socket error');
    });
  });
}
