import { describe, expect, it } from 'vitest';

import { GroupCallRegistry } from './group-call-registry.js';

describe('GroupCallRegistry', () => {
  it('joins participants and removes the empty call', () => {
    const registry = new GroupCallRegistry();
    expect(registry.join('conversation', 'alice', 'video').existingParticipantIds).toEqual([]);
    expect(registry.join('conversation', 'bob', 'video').existingParticipantIds).toEqual(['alice']);
    expect(registry.requirePeer('conversation', 'alice', 'bob').participantIds.size).toBe(2);
    registry.leave('conversation', 'alice');
    registry.leave('conversation', 'bob');
    expect(registry.hasUser('bob')).toBe(false);
  });

  it('does not mix audio and video sessions', () => {
    const registry = new GroupCallRegistry();
    registry.join('conversation', 'alice', 'audio');
    expect(() => registry.join('conversation', 'bob', 'video')).toThrow('аудиозвонок');
  });
});
