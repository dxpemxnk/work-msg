// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conversation, Message, MessageAck, OutboxCommand, User } from '@/types/messenger';
import { useMessenger } from './useMessenger';

type PageRequest = { id: string; after?: number; before?: number; limit: number };
const mock = vi.hoisted(() => {
  const handlers = new Map<string, (data?: unknown) => void>();
  const socket = {
    connected: false,
    on: vi.fn((event: string, handler: (data?: unknown) => void) => { handlers.set(event, handler); }),
    removeAllListeners: () => handlers.clear(),
    disconnect: () => { socket.connected = false; },
    connect: () => { socket.connected = true; handlers.get('connect')?.(); },
    timeout: vi.fn(),
    emit: vi.fn(),
  };
  socket.timeout.mockReturnValue(socket);
  const load = vi.fn<(request: PageRequest) => Promise<Message[]>>();
  const getMessages = (request: PageRequest) => ({ unwrap: () => load(request) });
  const refetch = vi.fn(() => Promise.resolve());
  const commands = new Map<string, OutboxCommand>();
  const dispatch = vi.fn();
  const conversations: Conversation[] = [];
  return { socket, handlers, load, getMessages, refetch, commands, dispatch, conversations };
});

vi.mock('@services/api/messenger', () => ({
  useGetUsersQuery: () => ({ data: [], isLoading: false }),
  useGetConversationsQuery: () => ({ data: mock.conversations, isLoading: false, refetch: mock.refetch }),
  useLazyGetMessagesQuery: () => [mock.getMessages],
  useLazySearchMessagesQuery: () => [mock.getMessages],
  useMarkReadMutation: () => [mock.getMessages],
  useToggleReactionMutation: () => [mock.getMessages],
  useTogglePinMutation: () => [mock.getMessages],
  messengerApi: { util: { updateQueryData: vi.fn(), invalidateTags: vi.fn() } },
}));
vi.mock('@store/index', () => ({ useAppDispatch: () => mock.dispatch }));
vi.mock('@services/realtime/socket', () => ({ createMessengerSocket: () => mock.socket }));
vi.mock('@services/storage/outbox', () => ({
  listOutboxCommands: (userId: string) => Promise.resolve([...mock.commands.values()].filter(c => c.userId === userId)),
  saveOutboxCommand: (command: OutboxCommand) => { mock.commands.set(command.clientMessageId, command); return Promise.resolve(); },
  removeOutboxCommand: (id: string) => { mock.commands.delete(id); return Promise.resolve(); },
}));

const user: User = { id: 'user', login: 'user', displayName: 'User', status: 'ACTIVE', avatarColor: '#123' };
const conversation = (id: string): Conversation => ({
  id, type: 'GROUP', title: id, displayTitle: id, directKey: null, lastSequence: 0,
  lastReadSequence: 0, unreadCount: 0, role: 'OWNER', members: [], lastMessage: null, updatedAt: '',
});
const message = (sequence: number, conversationId = 'A'): Message => ({
  id: `${conversationId}-${sequence}`, clientMessageId: `${conversationId}-client-${sequence}`,
  conversationId, sequence, body: `Message ${sequence}`, senderId: user.id, sender: user,
  senderDisplayName: user.displayName, replyTo: null, forwardedFrom: null, reactions: [], isPinned: false, createdAt: '',
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
async function settle(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mock.commands.clear();
  mock.conversations.splice(0, mock.conversations.length, conversation('A'), conversation('B'));
  mock.load.mockReset().mockResolvedValue([]);
  mock.socket.emit.mockReset().mockImplementation((event: string, ...args: unknown[]) => {
    if (event === 'read:update') (args.at(-1) as (result: { ok: true }) => void)({ ok: true });
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('messenger fault scenarios', () => {
  it('recovers after a second-page HTTP failure without reconnecting the socket or duplicating messages', async () => {
    const { result } = renderHook(() => useMessenger(user));
    await settle();
    mock.load.mockResolvedValueOnce([message(1)]);
    await act(() => result.current.selectConversation(conversation('A')));
    // Fail the second page once, after successfully accepting the first page.
    let failed = false;
    mock.load.mockImplementation(({ after }) => {
      if (after === 1) return Promise.resolve(Array.from({ length: 100 }, (_, i) => message(i + 2)));
      if (!failed) { failed = true; return Promise.reject(new Error('HTTP 500')); }
      return Promise.resolve([message(102)]);
    });
    act(() => { void result.current.retrySynchronization(); });
    await settle(2000);
    expect(result.current.connection).toBe('online');
    expect(result.current.messages.map(m => m.sequence)).toEqual(Array.from({ length: 102 }, (_, i) => i + 1));
  });

  it('offers bounded manual recovery after repeated HTTP failures', async () => {
    const { result } = renderHook(() => useMessenger(user));
    await settle();
    await act(() => result.current.selectConversation(conversation('A')));
    mock.load.mockRejectedValue(new Error('HTTP 500'));
    act(() => { void result.current.retrySynchronization(); });
    await settle(3000);
    expect(result.current.connection).toBe('synchronizing');
    expect(result.current.error).toContain('повторить');
    mock.load.mockResolvedValue([message(1)]);
    await act(() => result.current.retrySynchronization());
    expect(result.current.connection).toBe('online');
  });

  it('clears A when B fails and ignores late A pagination after A → B → A', async () => {
    const { result } = renderHook(() => useMessenger(user));
    await settle();
    mock.load.mockResolvedValueOnce([message(10)]);
    await act(() => result.current.selectConversation(conversation('A')));
    const oldPage = deferred<Message[]>();
    mock.load.mockReturnValueOnce(oldPage.promise);
    act(() => { void result.current.loadOlder(); });
    expect(result.current.olderLoading).toBe(true);
    mock.load.mockRejectedValueOnce(new Error('B unavailable'));
    await act(() => result.current.selectConversation(conversation('B')));
    expect(result.current.messages).toEqual([]);
    expect(result.current.olderLoading).toBe(false);
    mock.load.mockResolvedValueOnce([message(20)]);
    await act(() => result.current.selectConversation(conversation('A')));
    await act(async () => { oldPage.resolve([message(9)]); await oldPage.promise; });
    expect(result.current.messages.map(m => m.sequence)).toEqual([20]);
  });

  it('cancels recovery retries when closing the conversation', async () => {
    const { result } = renderHook(() => useMessenger(user));
    await settle();
    await act(() => result.current.selectConversation(conversation('A')));
    mock.load.mockClear().mockRejectedValue(new Error('HTTP 500'));
    act(() => { void result.current.retrySynchronization(); });
    await settle();
    expect(result.current.connection).toBe('synchronizing');
    act(() => result.current.closeConversation());
    await settle(3000);
    expect(mock.load).toHaveBeenCalledOnce();
    expect(result.current.connection).toBe('online');
    expect(result.current.selectedId).toBeNull();
  });

  it('shares an in-progress recovery between repeated connect/retry requests', async () => {
    const { result } = renderHook(() => useMessenger(user));
    await settle();
    await act(() => result.current.selectConversation(conversation('A')));
    const page = deferred<Message[]>();
    mock.load.mockClear().mockReturnValue(page.promise);
    act(() => { void result.current.retrySynchronization(); void result.current.retrySynchronization(); mock.handlers.get('connect')?.(); });
    await settle();
    expect(mock.load).toHaveBeenCalledOnce();
    await act(async () => { page.resolve([message(1)]); await page.promise; });
    expect(result.current.connection).toBe('online');
  });

  it('does not roll back the recovery cursor after a second reconnect overtakes an old request', async () => {
    const { result } = renderHook(() => useMessenger(user));
    await settle();
    mock.load.mockResolvedValueOnce([message(1)]);
    await act(() => result.current.selectConversation(conversation('A')));
    const oldPage = deferred<Message[]>();
    mock.load.mockReturnValueOnce(oldPage.promise);
    act(() => { void result.current.retrySynchronization(); });
    await settle();
    mock.load.mockResolvedValueOnce([message(2), message(3)]);
    act(() => {
      mock.socket.connected = false; mock.handlers.get('disconnect')?.();
      mock.socket.connected = true; mock.handlers.get('connect')?.();
    });
    await settle();
    await act(async () => { oldPage.resolve([message(2)]); await oldPage.promise; });
    mock.load.mockClear().mockResolvedValue([]);
    await act(() => result.current.retrySynchronization());
    expect(mock.load).toHaveBeenCalledWith(expect.objectContaining({ after: 3 }));
    expect(result.current.messages.map(m => m.sequence)).toEqual([1, 2, 3]);
  });

  it('does not apply history after closing the chat or revoking membership', async () => {
    const { result } = renderHook(() => useMessenger(user));
    await settle();
    const page = deferred<Message[]>();
    mock.load.mockReturnValueOnce(page.promise);
    act(() => { void result.current.selectConversation(conversation('A')); });
    act(() => mock.handlers.get('membership:updated')?.({ conversationId: 'A', active: false }));
    await act(async () => { page.resolve([message(1)]); await page.promise; });
    expect(result.current.selectedId).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.historyLoading).toBe(false);
  });

  it('keeps the newest 500 messages when realtime advances through 499 → 500 → 501', async () => {
    const { result } = renderHook(() => useMessenger(user));
    await settle();
    mock.load.mockResolvedValueOnce(Array.from({ length: 499 }, (_, i) => message(i + 1)));
    await act(() => result.current.selectConversation(conversation('A')));
    act(() => { mock.handlers.get('message:new')?.(message(500)); mock.handlers.get('message:new')?.(message(501)); });
    await settle();
    expect(result.current.messages).toHaveLength(500);
    expect(result.current.messages[0]?.sequence).toBe(2);
    expect(result.current.messages.at(-1)?.sequence).toBe(501);
    expect(result.current.hasOlder).toBe(true);
  });

  it('retries a lost ACK with the same client id and merges duplicate server delivery', async () => {
    const { result } = renderHook(() => useMessenger(user));
    await settle();
    await act(() => result.current.selectConversation(conversation('A')));
    let attempts = 0;
    mock.socket.emit.mockImplementation((event: string, ...args: unknown[]) => {
      if (event !== 'message:send') return;
      const command = args[0] as OutboxCommand;
      const ack = args[1] as (error: Error | null, result?: MessageAck) => void;
      attempts += 1;
      if (attempts === 1) { ack(new Error('ACK timeout')); return; }
      const saved = { ...message(1), clientMessageId: command.clientMessageId };
      mock.handlers.get('message:new')?.(saved);
      ack(null, { ok: true, message: saved, deduplicated: true });
    });
    await act(() => result.current.sendMessage('Lost ACK'));
    await settle(2000);
    const sends = mock.socket.emit.mock.calls.filter(([event]) => event === 'message:send');
    expect(sends).toHaveLength(2);
    expect((sends[0]?.[1] as OutboxCommand).clientMessageId).toBe((sends[1]?.[1] as OutboxCommand).clientMessageId);
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.pending).toEqual([]);
    expect(mock.commands.size).toBe(0);
  });

  it('does not retry an old user command after changing users during backoff', async () => {
    const { result, rerender } = renderHook(({ currentUser }) => useMessenger(currentUser), { initialProps: { currentUser: user } });
    await settle();
    await act(() => result.current.selectConversation(conversation('A')));
    mock.socket.emit.mockImplementation((event: string, ...args: unknown[]) => {
      if (event === 'message:send') (args[1] as (error: Error) => void)(new Error('ACK timeout'));
    });
    await act(() => result.current.sendMessage('Old session'));
    rerender({ currentUser: { ...user, id: 'another-user' } });
    await settle(3000);
    expect(mock.socket.emit.mock.calls.filter(([event]) => event === 'message:send')).toHaveLength(1);
    expect(mock.commands.size).toBe(1);
  });
});
