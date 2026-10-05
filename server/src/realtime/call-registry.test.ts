import { describe, expect, it } from 'vitest';

import { CallRegistry } from './call-registry.js';

const call = {
  id: 'call-1',
  conversationId: 'conversation-1',
  callerId: 'user-1',
  calleeId: 'user-2',
  mode: 'audio' as const,
};

describe('CallRegistry', () => {
  it('reserves both participants until the call ends', () => {
    const registry = new CallRegistry();
    registry.start(call);

    expect(() => registry.start({ ...call, id: 'call-2', callerId: 'user-3' })).toThrow('занят');
    expect(registry.end(call.id, call.callerId)).toMatchObject(call);
    expect(registry.start({ ...call, id: 'call-2' })).toMatchObject({ id: 'call-2' });
  });

  it('allows only the callee to answer', () => {
    const registry = new CallRegistry();
    registry.start(call);

    expect(() => registry.answer(call.id, call.callerId)).toThrow('вызываемый');
    expect(registry.answer(call.id, call.calleeId).status).toBe('active');
  });

  it('ends a call when one of its users goes offline', () => {
    const registry = new CallRegistry();
    registry.start(call);

    expect(registry.endForUser(call.calleeId)?.id).toBe(call.id);
    expect(registry.endForUser(call.callerId)).toBeNull();
  });
});
