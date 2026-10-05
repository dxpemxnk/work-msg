import { describe, expect, it } from 'vitest';

import { PresenceRegistry } from './presence-registry.js';

describe('PresenceRegistry', () => {
  it('keeps a user online while at least one socket remains connected', () => {
    const presence = new PresenceRegistry();

    expect(presence.connect('user')).toBe(true);
    expect(presence.connect('user')).toBe(false);
    expect(presence.onlineUserIds()).toEqual(['user']);
    expect(presence.disconnect('user')).toBe(false);
    expect(presence.onlineUserIds()).toEqual(['user']);
    expect(presence.disconnect('user')).toBe(true);
    expect(presence.onlineUserIds()).toEqual([]);
  });
});
