import { describe, expect, it } from 'vitest';

import { GroupCallRegistry } from './group-call-registry.js';

describe('GroupCallRegistry', () => {
  it('joins participants and removes the empty call', () => {
    const registry = new GroupCallRegistry();
    expect(registry.join('conversation', 'alice', 'socket-a', 'video').existingParticipantIds).toEqual([]);
    expect(registry.join('conversation', 'bob', 'socket-b', 'video').existingParticipantIds).toEqual(['alice']);
    expect(registry.requirePeer('conversation', 'alice', 'bob').participantIds.size).toBe(2);
    registry.leave('conversation', 'alice');
    registry.leave('conversation', 'bob');
    expect(registry.hasUser('bob')).toBe(false);
  });

  it('does not mix audio and video sessions', () => {
    const registry = new GroupCallRegistry();
    registry.join('conversation', 'alice', 'socket-a', 'audio');
    expect(() => registry.join('conversation', 'bob', 'socket-b', 'video')).toThrow('аудиозвонок');
  });

  it('binds signaling to the tab that joined the call', () => {
    const registry = new GroupCallRegistry();
    registry.join('conversation', 'alice', 'socket-a', 'audio');
    registry.join('conversation', 'bob', 'socket-b', 'audio');

    expect(() => registry.requirePeer('conversation', 'alice', 'bob', 'other-tab')).toThrow('вкладке');
    expect(registry.leaveForSocket('socket-a')).toMatchObject({ userId: 'alice' });
    expect(registry.hasUser('alice')).toBe(false);
    expect(registry.hasUser('bob')).toBe(true);
  });
});
