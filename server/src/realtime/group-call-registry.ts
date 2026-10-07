import { errors } from '../shared/errors/errors.js';
import type { CallMode } from './call-registry.js';

export interface GroupCall {
  conversationId: string;
  mode: CallMode;
  participantIds: Set<string>;
  socketIdByUser: Map<string, string>;
  createdAt: number;
}

export class GroupCallRegistry {
  private readonly calls = new Map<string, GroupCall>();
  private readonly conversationIdByUser = new Map<string, string>();

  join(conversationId: string, userId: string, socketId: string, mode: CallMode): { call: GroupCall; existingParticipantIds: string[] } {
    const activeConversationId = this.conversationIdByUser.get(userId);
    if (activeConversationId && activeConversationId !== conversationId) throw errors.conflict('Вы уже участвуете в другом звонке');

    let call = this.calls.get(conversationId);
    if (!call) {
      call = { conversationId, mode, participantIds: new Set(), socketIdByUser: new Map(), createdAt: Date.now() };
      this.calls.set(conversationId, call);
    }
    if (call.mode !== mode) throw errors.conflict(`В группе уже идёт ${call.mode === 'video' ? 'видеозвонок' : 'аудиозвонок'}`);

    const existingParticipantIds = [...call.participantIds].filter((id) => id !== userId);
    call.participantIds.add(userId);
    call.socketIdByUser.set(userId, socketId);
    this.conversationIdByUser.set(userId, conversationId);
    return { call, existingParticipantIds };
  }

  requireParticipant(conversationId: string, userId: string, socketId?: string): GroupCall {
    const call = this.calls.get(conversationId);
    if (!call || !call.participantIds.has(userId)) throw errors.forbidden('Вы не участвуете в групповом звонке');
    if (socketId && call.socketIdByUser.get(userId) !== socketId) {
      throw errors.forbidden('Сигнализация доступна только вкладке, начавшей звонок');
    }
    return call;
  }

  requirePeer(conversationId: string, userId: string, peerId: string, socketId?: string): GroupCall {
    const call = this.requireParticipant(conversationId, userId, socketId);
    if (!call.participantIds.has(peerId)) throw errors.notFound('Участник звонка не найден');
    return call;
  }

  leave(conversationId: string, userId: string): GroupCall | null {
    const call = this.calls.get(conversationId);
    if (!call?.participantIds.delete(userId)) return null;
    call.socketIdByUser.delete(userId);
    this.conversationIdByUser.delete(userId);
    if (call.participantIds.size === 0) this.calls.delete(conversationId);
    return call;
  }

  leaveForUser(userId: string): GroupCall | null {
    const conversationId = this.conversationIdByUser.get(userId);
    return conversationId ? this.leave(conversationId, userId) : null;
  }

  leaveForSocket(socketId: string): { call: GroupCall; userId: string } | null {
    for (const call of this.calls.values()) {
      for (const [userId, participantSocketId] of call.socketIdByUser) {
        if (participantSocketId === socketId) {
          const leftCall = this.leave(call.conversationId, userId);
          return leftCall ? { call: leftCall, userId } : null;
        }
      }
    }
    return null;
  }

  hasUser(userId: string): boolean {
    return this.conversationIdByUser.has(userId);
  }
}
