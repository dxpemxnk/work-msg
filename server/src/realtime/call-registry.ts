import { errors } from '../shared/errors/errors.js';

export type CallMode = 'audio' | 'video';
export type CallStatus = 'ringing' | 'active';

export interface ActiveCall {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  mode: CallMode;
  status: CallStatus;
  createdAt: number;
  answeredAt: number | null;
}

export class CallRegistry {
  private readonly calls = new Map<string, ActiveCall>();
  private readonly callIdByUser = new Map<string, string>();

  start(call: Omit<ActiveCall, 'status' | 'createdAt' | 'answeredAt'>): ActiveCall {
    if (this.calls.has(call.id)) throw errors.conflict('Звонок уже существует');
    if (this.callIdByUser.has(call.callerId)) throw errors.conflict('Вы уже участвуете в звонке');
    if (this.callIdByUser.has(call.calleeId)) throw errors.conflict('Пользователь занят');

    const activeCall: ActiveCall = {
      ...call,
      status: 'ringing',
      createdAt: Date.now(),
      answeredAt: null,
    };
    this.calls.set(call.id, activeCall);
    this.callIdByUser.set(call.callerId, call.id);
    this.callIdByUser.set(call.calleeId, call.id);
    return activeCall;
  }

  answer(callId: string, userId: string): ActiveCall {
    const call = this.requireParticipant(callId, userId);
    if (call.calleeId !== userId) throw errors.forbidden('Ответить может только вызываемый пользователь');
    if (call.status !== 'ringing') throw errors.conflict('Звонок уже принят');
    call.status = 'active';
    call.answeredAt = Date.now();
    return call;
  }

  requireParticipant(callId: string, userId: string): ActiveCall {
    const call = this.calls.get(callId);
    if (!call) throw errors.notFound('Звонок не найден');
    if (call.callerId !== userId && call.calleeId !== userId) throw errors.forbidden();
    return call;
  }

  peerId(call: ActiveCall, userId: string): string {
    return call.callerId === userId ? call.calleeId : call.callerId;
  }

  end(callId: string, userId: string): ActiveCall {
    const call = this.requireParticipant(callId, userId);
    this.calls.delete(call.id);
    this.callIdByUser.delete(call.callerId);
    this.callIdByUser.delete(call.calleeId);
    return call;
  }

  endForUser(userId: string): ActiveCall | null {
    const callId = this.callIdByUser.get(userId);
    if (!callId) return null;
    return this.end(callId, userId);
  }

  hasUser(userId: string): boolean {
    return this.callIdByUser.has(userId);
  }
}
