import type { ActiveCall } from './call-registry.js';

export type CallEndReason = 'completed' | 'cancelled' | 'rejected' | 'missed';

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function callEndReason(call: ActiveCall, endedByUserId: string, peerWentOffline = false): CallEndReason {
  if (call.status === 'active') return 'completed';
  if (endedByUserId === call.callerId) return 'cancelled';
  return peerWentOffline ? 'missed' : 'rejected';
}

export function callSummaryBody(call: ActiveCall, reason: CallEndReason, endedAt = Date.now()): string {
  if (reason === 'completed') {
    const durationSeconds = call.answeredAt === null
      ? 0
      : Math.max(0, Math.floor((endedAt - call.answeredAt) / 1000));
    return `📞 Звонок завершён · ${formatDuration(durationSeconds)}`;
  }
  if (reason === 'cancelled') return '📞 Звонок отменён до ответа';
  if (reason === 'rejected') return '📞 Звонок отклонён';
  return '📞 Пропущенный звонок';
}
