import { describe, expect, it } from 'vitest';

import type { Message } from '@/types/messenger';

import { mergeMessages } from './messages';

const message = (id: string, clientMessageId: string, sequence: number): Message => ({
  id,
  clientMessageId,
  sequence,
  conversationId: 'conversation',
  senderId: 'sender',
  senderDisplayName: 'Пользователь',
  sender: { id: 'sender', login: 'sender', displayName: 'Пользователь', avatarColor: '#607d8b', status: 'ACTIVE' },
  body: id,
  replyTo: null,
  forwardedFrom: null,
  reactions: [],
  isPinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
});

describe('mergeMessages', () => {
  it('deduplicates live and recovery messages and orders them by sequence', () => {
    expect(
      mergeMessages([message('second', 'client-2', 2)], [message('first', 'client-1', 1), message('second', 'client-2', 2)])
    ).toEqual([message('first', 'client-1', 1), message('second', 'client-2', 2)]);
  });
});
