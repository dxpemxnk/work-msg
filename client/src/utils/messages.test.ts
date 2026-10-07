import { describe, expect, it } from 'vitest';

import type { Message } from '@/types/messenger';

import { mergeMessages, recoverMessagePages } from './messages';

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

const messageAt = (sequence: number) => message(`message-${sequence}`, `client-${sequence}`, sequence);

describe('recoverMessagePages', () => {
  it('loads every page without skipping a concurrent higher sequence', async () => {
    const available = Array.from({ length: 250 }, (_, index) => messageAt(index + 1));
    const accepted: Message[] = [messageAt(400)];
    const cursors: number[] = [];
    const result = await recoverMessagePages({
      after: 0,
      limit: 100,
      isCurrent: () => true,
      loadPage: (after, limit) => {
        cursors.push(after);
        return Promise.resolve(available.filter(({ sequence }) => sequence > after).slice(0, limit));
      },
      acceptPage: (page) => {
        accepted.splice(0, accepted.length, ...mergeMessages(accepted, page));
      },
    });

    expect(cursors).toEqual([0, 100, 200]);
    expect(result).toEqual({ recoveredThrough: 250, completed: true });
    expect(accepted).toHaveLength(251);
    expect(accepted.slice(0, 250).map(({ sequence }) => sequence)).toEqual(
      Array.from({ length: 250 }, (_, index) => index + 1)
    );
    expect(accepted.at(-1)?.sequence).toBe(400);
  });

  it('stops applying pages when the selected conversation becomes stale', async () => {
    let current = true;
    const accepted: Message[] = [];
    const result = await recoverMessagePages({
      after: 0,
      limit: 2,
      isCurrent: () => current,
      loadPage: () => {
        current = false;
        return Promise.resolve([messageAt(1), messageAt(2)]);
      },
      acceptPage: (page) => accepted.push(...page),
    });
    expect(result).toEqual({ recoveredThrough: 0, completed: false });
    expect(accepted).toEqual([]);
  });
});

describe('mergeMessages', () => {
  it('deduplicates live and recovery messages and orders them by sequence', () => {
    expect(
      mergeMessages([message('second', 'client-2', 2)], [message('first', 'client-1', 1), message('second', 'client-2', 2)])
    ).toEqual([message('first', 'client-1', 1), message('second', 'client-2', 2)]);
  });
});
