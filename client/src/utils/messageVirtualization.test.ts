import { describe, expect, it } from 'vitest';

import { resolveMessageListUpdate, type MessageScrollSnapshot } from './messageVirtualization';

const snapshot = (overrides: Partial<MessageScrollSnapshot> = {}): MessageScrollSnapshot => ({
  firstKey: 'message-1',
  lastKey: 'message-500',
  anchorKey: 'message-495',
  offsetWithinAnchor: 10,
  nearBottom: true,
  ...overrides,
});

describe('resolveMessageListUpdate', () => {
  it('continues following the end when a 500-message window shifts', () => {
    expect(resolveMessageListUpdate(snapshot(), 'message-2', 'message-501')).toBe('follow-end');
  });

  it('preserves the archive anchor when the same window shifts away from the end', () => {
    expect(resolveMessageListUpdate(snapshot({ nearBottom: false, anchorKey: 'message-200' }), 'message-2', 'message-501'))
      .toBe('preserve-anchor');
  });

  it('preserves the anchor when older history is prepended', () => {
    expect(resolveMessageListUpdate(snapshot({ nearBottom: false }), 'message-0', 'message-500'))
      .toBe('preserve-anchor');
  });
});
