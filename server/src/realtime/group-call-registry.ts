import { errors } from '../shared/errors/errors.js';
import type { CallMode } from './call-registry.js';

export interface GroupCall {
  conversationId: string;
  mode: CallMode;
  participantIds: Set<string>;
  createdAt: number;
}

export class GroupCallRegistry {
  private readonly calls = new Map<string, GroupCall>();
  private readonly conversationIdByUser = new Map<string, string>();

  join(conversationId: string, userId: string, mode: CallMode): { call: GroupCall; existingParticipantIds: string[] } {
    const activeConversationId = this.conversationIdByUser.get(userId);
    if (activeConversationId && activeConversationId !== conversationId) throw errors.conflict('Вы уже участвуете в другом звонке');

    let call = this.calls.get(conversationId);
    if (!call) {
      call = { conversationId, mode, participantIds: new Set(), createdAt: Date.now() };
      this.calls.set(conversationId, call);
    }
    if (call.mode !== mode) throw errors.conflict(`В группе уже идёт ${call.mode === 'video' ? 'видеозвонок' : 'аудиозвонок'}`);

    const existingParticipantIds = [...call.participantIds].filter((id) => id !== userId);
    call.participantIds.add(userId);
    this.conversationIdByUser.set(userId, conversationId);
    return { call, existingParticipantIds };
  }

  requireParticipant(conversationId: string, userId: string): GroupCall {
    const call = this.calls.get(conversationId);
    if (!call || !call.participantIds.has(userId)) throw errors.forbidden('Вы не участвуете в групповом звонке');
    return call;
  }

  requirePeer(conversationId: string, userId: string, peerId: string): GroupCall {
    const call = this.requireParticipant(conversationId, userId);
    if (!call.participantIds.has(peerId)) throw errors.notFound('Участник звонка не найден');
    return call;
  }

  leave(conversationId: string, userId: string): GroupCall | null {
    const call = this.calls.get(conversationId);
    if (!call?.participantIds.delete(userId)) return null;
    this.conversationIdByUser.delete(userId);
    if (call.participantIds.size === 0) this.calls.delete(conversationId);
    return call;
  }

  leaveForUser(userId: string): GroupCall | null {
    const conversationId = this.conversationIdByUser.get(userId);
    return conversationId ? this.leave(conversationId, userId) : null;
  }

  hasUser(userId: string): boolean {
    return this.conversationIdByUser.has(userId);
  }
}
