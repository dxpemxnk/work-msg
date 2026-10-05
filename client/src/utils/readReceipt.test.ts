import { describe, expect, it } from 'vitest';

import type { Member } from '@/types/messenger';

import { getReadReceipt, readReceiptLabel } from './readReceipt';

const member = (id: string, lastReadSequence: number): Member => ({
  user: { id, login: id, displayName: id, avatarColor: '#000', status: 'ACTIVE' },
  role: 'MEMBER',
  joinedAt: '2026-01-01T00:00:00.000Z',
  visibleFromSequence: 1,
  lastReadSequence,
});

describe('message read receipt', () => {
  it('marks a direct message as read when the peer cursor reaches its sequence', () => {
    const receipt = getReadReceipt(3, [member('me', 3), member('peer', 3)], 'me');

    expect(receipt.allRead).toBe(true);
    expect(readReceiptLabel(receipt)).toBe('Прочитано');
  });

  it('reports partial reads in a group', () => {
    const receipt = getReadReceipt(
      4,
      [member('me', 4), member('first', 4), member('second', 3)],
      'me'
    );

    expect(receipt).toMatchObject({ readCount: 1, recipientCount: 2, allRead: false });
    expect(readReceiptLabel(receipt)).toBe('Прочитали 1 из 2');
  });
});
