import { describe, expect, it } from 'vitest';

import type { ActiveCall } from './call-registry.js';
import { callEndReason, callSummaryBody } from './call-summary.js';

const activeCall: ActiveCall = {
  id: 'call-1',
  conversationId: 'conversation-1',
  callerId: 'caller',
  calleeId: 'callee',
  callerSocketId: 'caller-socket',
  calleeSocketId: 'callee-socket',
  mode: 'audio',
  status: 'active',
  createdAt: 1_000,
  answeredAt: 2_000,
};

describe('call summary', () => {
  it('formats the accepted call duration', () => {
    expect(callSummaryBody(activeCall, 'completed', 67_000)).toBe('📞 Звонок завершён · 01:05');
  });

  it('distinguishes cancellation, rejection and missed calls', () => {
    const ringingCall = { ...activeCall, status: 'ringing' as const, answeredAt: null };
    expect(callEndReason(ringingCall, 'caller')).toBe('cancelled');
    expect(callEndReason(ringingCall, 'callee')).toBe('rejected');
    expect(callEndReason(ringingCall, 'callee', true)).toBe('missed');
    expect(callSummaryBody(ringingCall, 'cancelled')).toContain('отменён');
    expect(callSummaryBody(ringingCall, 'rejected')).toContain('отклонён');
    expect(callSummaryBody(ringingCall, 'missed')).toContain('Пропущенный');
  });
});
