import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import {
  messengerApi,
  useGetConversationsQuery,
  useGetUsersQuery,
  useLazyGetMessagesQuery,
  useLazySearchMessagesQuery,
  useMarkReadMutation,
  useToggleReactionMutation,
  useTogglePinMutation,
} from '@services/api/messenger';
import { createMessengerSocket } from '@services/realtime/socket';
import { listOutboxCommands, removeOutboxCommand, saveOutboxCommand } from '@services/storage/outbox';
import { useAppDispatch } from '@store/index';
import type {
  ConnectionState,
  Conversation,
  Message,
  MessageAck,
  OutboxCommand,
  PendingMessage,
  ReadAck,
  User,
} from '@/types/messenger';
import { apiErrorMessage } from '@utils/apiError';
import { limitMessageWindow, mergeMessages, recoverMessagePages, retryTask } from '@utils/messages';
import { SerialCommandQueue } from '@utils/serialCommandQueue';

type SendOutcome = 'sent' | 'retryable' | 'blocked' | 'cancelled';

export function useMessenger(currentUser: User) {
  const dispatch = useAppDispatch();
  const { data: users = [], isLoading: usersLoading } = useGetUsersQuery();
  const { data: conversations = [], isLoading: conversationsLoading, refetch: refetchConversations } = useGetConversationsQuery();
  const [getMessages] = useLazyGetMessagesQuery();
  const [searchMessagesRequest] = useLazySearchMessagesQuery();
  const [markRead] = useMarkReadMutation();
  const [toggleReactionRequest] = useToggleReactionMutation();
  const [togglePinRequest] = useTogglePinMutation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());
  const [historyLoading, setHistoryLoading] = useState(false);
  const [olderLoading, setOlderLoading] = useState(false);
  const [newerLoading, setNewerLoading] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [hasNewer, setHasNewer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeSocket, setRealtimeSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const selectionGenerationRef = useRef(0);
  const recoveredThroughRef = useRef(new Map<string, number>());
  const hasNewerRef = useRef(false);
  const synchronizationRunRef = useRef<Promise<boolean> | null>(null);
  const commandQueueRef = useRef(new SerialCommandQueue<OutboxCommand, SendOutcome>());
  const sessionEpochRef = useRef(0);
  const transportEpochRef = useRef(0);
  const sessionUserIdRef = useRef(currentUser.id);

  const selectedConversation = useMemo(
    () => conversations.find(({ id }) => id === selectedId) ?? null,
    [conversations, selectedId]
  );

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const updateHasNewer = useCallback((value: boolean) => {
    hasNewerRef.current = value;
    setHasNewer(value);
  }, []);

  const updateMessages = useCallback((updater: (current: Message[]) => Message[]) => {
    const next = updater(messagesRef.current);
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const clearSelectedMessages = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
  }, []);

  const updateConversationSummary = useCallback((message: Message) => {
    dispatch(messengerApi.util.updateQueryData('getConversations', undefined, (draft) => {
      const conversation = draft.find(({ id }) => id === message.conversationId);
      if (!conversation || message.sequence < conversation.lastSequence) return;
      const isNewSequence = message.sequence > conversation.lastSequence;
      conversation.lastMessage = message;
      conversation.lastSequence = message.sequence;
      conversation.updatedAt = message.createdAt;
      if (
        isNewSequence
        && message.senderId !== currentUser.id
        && selectedIdRef.current !== message.conversationId
      ) {
        conversation.unreadCount += 1;
      }
      draft.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }));
  }, [currentUser.id, dispatch]);

  const completeMessage = useCallback(async (message: Message) => {
    if (message.conversationId === selectedIdRef.current) {
      if (hasNewerRef.current) {
        updateHasNewer(true);
      } else {
        updateMessages((current) => {
          if (message.conversationId !== selectedIdRef.current) return current;
          const window = limitMessageWindow(mergeMessages(current, [message]), 'newest');
          if (window.trimmed) setHasOlder(true);
          return window.messages;
        });
      }
      const recoveredThrough = recoveredThroughRef.current.get(message.conversationId);
      if (recoveredThrough !== undefined && message.sequence === recoveredThrough + 1) {
        recoveredThroughRef.current.set(message.conversationId, message.sequence);
      }
    }
    updateConversationSummary(message);
    setPending((current) => current.filter(({ clientMessageId }) => clientMessageId !== message.clientMessageId));
    await removeOutboxCommand(message.clientMessageId);
  }, [updateConversationSummary, updateHasNewer, updateMessages]);

  const sendCommand = useCallback((command: OutboxCommand): Promise<SendOutcome> => new Promise((resolve) => {
    const epoch = sessionEpochRef.current;
    if (command.userId !== sessionUserIdRef.current) {
      resolve('cancelled');
      return;
    }
    const socket = socketRef.current;
    if (!socket?.connected) {
      setPending((current) => current.map((item) => item.clientMessageId === command.clientMessageId ? { ...item, status: 'failed' } : item));
      resolve('retryable');
      return;
    }

    setPending((current) => current.map((item) => item.clientMessageId === command.clientMessageId ? { ...item, status: 'sending' } : item));
    socket.timeout(8000).emit(
      'message:send',
      {
        conversationId: command.conversationId,
        clientMessageId: command.clientMessageId,
        body: command.body,
        ...(command.replyToMessageId ? { replyToMessageId: command.replyToMessageId } : {}),
        ...(command.forwardedFromMessageId ? { forwardedFromMessageId: command.forwardedFromMessageId } : {}),
      },
      (timeoutError: Error | null, result?: MessageAck) => {
        if (epoch !== sessionEpochRef.current || socket !== socketRef.current) {
          resolve('cancelled');
          return;
        }
        if (timeoutError || !result?.ok) {
          setPending((current) => current.map((item) => item.clientMessageId === command.clientMessageId ? { ...item, status: 'failed' } : item));
          if (result && !result.ok) {
            setError(result.error.message);
            if (!result.error.retryable) {
              void saveOutboxCommand({ ...command, blocked: true })
                .catch(() => setError('Не удалось сохранить статус отказа в outbox'))
                .finally(() => resolve('blocked'));
              return;
            }
          }
          resolve('retryable');
          return;
        }
        void completeMessage(result.message)
          .catch(() => setError('Сообщение сохранено, но локальный outbox не очистился'))
          .finally(() => resolve('sent'));
      }
    );
  }), [completeMessage]);

  const runCommandWithRetries = useCallback(async (command: OutboxCommand): Promise<SendOutcome> => {
    const epoch = sessionEpochRef.current;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (epoch !== sessionEpochRef.current || command.userId !== sessionUserIdRef.current) return 'cancelled';
      const outcome = await sendCommand(command);
      if (outcome !== 'retryable') return outcome;
      if (attempt < 2 && socketRef.current?.connected) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 500 * (2 ** attempt)));
      }
    }
    return 'retryable';
  }, [sendCommand]);

  const enqueueCommand = useCallback((command: OutboxCommand): Promise<SendOutcome> => {
    const epoch = sessionEpochRef.current;
    return commandQueueRef.current.enqueue(command, (queued) => epoch === sessionEpochRef.current
      ? runCommandWithRetries(queued) : Promise.resolve('cancelled'));
  }, [runCommandWithRetries]);

  const replayOutbox = useCallback(async () => {
    const epoch = sessionEpochRef.current;
    const commands = await listOutboxCommands(currentUser.id);
    for (const command of commands) {
      if (epoch !== sessionEpochRef.current) return;
      if (command.blocked || !socketRef.current?.connected) continue;
      await enqueueCommand(command);
    }
  }, [currentUser.id, enqueueCommand]);

  const markConversationRead = useCallback((conversationId: string, sequence: number) => {
    if (document.visibilityState !== 'visible') return;

    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit(
        'read:update',
        { conversationId, sequence },
        (result: ReadAck) => {
          if (!result.ok) {
            setError(result.error.message);
            return;
          }
          void refetchConversations();
        }
      );
      return;
    }

    void markRead({ conversationId, sequence })
      .unwrap()
      .then(() => refetchConversations())
      .catch((requestError: unknown) => setError(apiErrorMessage(requestError)));
  }, [markRead, refetchConversations]);

  const recoverSelected = useCallback(async (isActive: () => boolean): Promise<boolean> => {
    const conversationId = selectedIdRef.current;
    if (!conversationId) return true;
    const generation = selectionGenerationRef.current;
    const recoveredThrough = recoveredThroughRef.current.get(conversationId)
      ?? messagesRef.current.at(-1)?.sequence
      ?? 0;
    try {
      const result = await recoverMessagePages({
        after: recoveredThrough,
        limit: 100,
        isCurrent: () => isActive() && selectedIdRef.current === conversationId && selectionGenerationRef.current === generation,
        loadPage: (after, limit) => getMessages({ id: conversationId, after, limit }).unwrap(),
        acceptPage: (page, pageEnd) => {
          recoveredThroughRef.current.set(conversationId, pageEnd);
          if (hasNewerRef.current) return;
          updateMessages((current) => {
            if (selectedIdRef.current !== conversationId || selectionGenerationRef.current !== generation) return current;
            const window = limitMessageWindow(mergeMessages(current, page), 'newest');
            if (window.trimmed) setHasOlder(true);
            return window.messages;
          });
        },
      });
      if (!result.completed) return false;
      if (result.recoveredThrough > 0 && selectedIdRef.current === conversationId) {
        markConversationRead(conversationId, result.recoveredThrough);
      }
      return true;
    } catch (requestError) {
      if (isActive() && selectedIdRef.current === conversationId && selectionGenerationRef.current === generation) {
        setError(`История синхронизирована не полностью: ${apiErrorMessage(requestError)}`);
      }
      return false;
    }
  }, [getMessages, markConversationRead, updateMessages]);

  const synchronizeSelected = useCallback((): Promise<boolean> => {
    if (synchronizationRunRef.current) return synchronizationRunRef.current;

    const generation = selectionGenerationRef.current;
    const epoch = sessionEpochRef.current;
    const transportEpoch = transportEpochRef.current;
    const socket = socketRef.current;
    const isCurrent = () => epoch === sessionEpochRef.current && transportEpoch === transportEpochRef.current
      && generation === selectionGenerationRef.current && socket === socketRef.current && Boolean(socket?.connected);
    const run = (async () => {
      setConnection('synchronizing');
      const synchronized = await retryTask({
        attempts: 3,
        isActive: isCurrent,
        task: () => recoverSelected(isCurrent),
        wait: (delay) => new Promise<void>((resolve) => window.setTimeout(resolve, delay)),
      });
      if (!isCurrent()) return false;
      if (synchronized) {
        if (socketRef.current?.connected) setConnection('online');
        return true;
      }
      if (socketRef.current?.connected) {
        setError('Не удалось синхронизировать историю. Нажмите на статус «Синхронизация», чтобы повторить.');
      }
      return false;
    })();

    synchronizationRunRef.current = run;
    void run.finally(() => {
      if (synchronizationRunRef.current === run) synchronizationRunRef.current = null;
    });
    return run;
  }, [recoverSelected]);

  const retrySynchronization = useCallback(async () => {
    if (await synchronizeSelected()) await replayOutbox();
  }, [replayOutbox, synchronizeSelected]);

  useEffect(() => {
    let active = true;
    void listOutboxCommands(currentUser.id)
      .then((commands) => {
        if (!active) return;
        setPending(commands.map((command) => ({
          clientMessageId: command.clientMessageId,
          conversationId: command.conversationId,
          senderId: currentUser.id,
          senderDisplayName: currentUser.displayName,
          body: command.body,
          replyTo: command.replyTo ?? null,
          forwardedFrom: command.forwardedFrom ?? null,
          createdAt: command.createdAt,
          status: 'failed',
        })));
      })
      .catch(() => setError('Не удалось прочитать очередь неотправленных сообщений'));
    return () => { active = false; };
  }, [currentUser]);

  useEffect(() => {
    sessionEpochRef.current += 1;
    sessionUserIdRef.current = currentUser.id;
    const socket = createMessengerSocket();
    socketRef.current = socket;
    setRealtimeSocket(socket);
    setConnection('connecting');

    socket.on('connect', () => {
      void retrySynchronization().catch(() => setError('Не удалось повторить очередь сообщений'));
      void refetchConversations();
    });
    socket.on('disconnect', () => {
      transportEpochRef.current += 1;
      synchronizationRunRef.current = null;
      setConnection('offline');
      setOnlineUserIds(new Set());
    });
    socket.on('connect_error', () => {
      setConnection('offline');
      setOnlineUserIds(new Set());
    });
    socket.on('presence:snapshot', ({ userIds }: { userIds: string[] }) => {
      setOnlineUserIds(new Set(userIds));
    });
    socket.on('presence:updated', ({ userId, online }: { userId: string; online: boolean }) => {
      setOnlineUserIds((current) => {
        const next = new Set(current);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });
    socket.on('message:new', (message: Message) => {
      void completeMessage(message);
      if (message.conversationId === selectedIdRef.current) {
        if (message.senderId !== currentUser.id) {
          markConversationRead(message.conversationId, message.sequence);
        }
      }
    });
    socket.on('message:updated', (message: Message) => {
      if (message.conversationId === selectedIdRef.current) {
        updateMessages((current) => message.conversationId === selectedIdRef.current
          ? current.map((item) => item.id === message.id ? message : item)
          : current);
      }
      dispatch(messengerApi.util.invalidateTags([{ type: 'Message', id: message.conversationId }]));
    });
    socket.on('conversation:updated', () => { void refetchConversations(); });
    socket.on('membership:updated', ({ conversationId, active: membershipActive }: { conversationId: string; active: boolean }) => {
      if (!membershipActive && selectedIdRef.current === conversationId) {
        selectionGenerationRef.current += 1;
        recoveredThroughRef.current.delete(conversationId);
        setSelectedId(null);
        selectedIdRef.current = null;
        synchronizationRunRef.current = null;
        if (socket.connected) setConnection('online');
        clearSelectedMessages();
        setHistoryLoading(false);
        setOlderLoading(false);
        setNewerLoading(false);
        setHasOlder(false);
        updateHasNewer(false);
      }
      void refetchConversations();
    });
    socket.on('read:updated', () => { void refetchConversations(); });
    socket.connect();

    return () => {
      sessionEpochRef.current += 1;
      synchronizationRunRef.current = null;
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setRealtimeSocket(null);
    };
  }, [clearSelectedMessages, completeMessage, currentUser.id, dispatch, markConversationRead, refetchConversations, retrySynchronization, updateHasNewer, updateMessages]);

  useEffect(() => {
    const readVisibleConversation = () => {
      if (document.visibilityState !== 'visible') return;
      const conversationId = selectedIdRef.current;
      const sequence = messagesRef.current.at(-1)?.sequence;
      if (conversationId && sequence !== undefined) {
        markConversationRead(conversationId, sequence);
      }
    };

    document.addEventListener('visibilitychange', readVisibleConversation);
    return () => document.removeEventListener('visibilitychange', readVisibleConversation);
  }, [markConversationRead]);

  const selectConversation = useCallback(async (conversation: Conversation) => {
    synchronizationRunRef.current = null;
    const generation = selectionGenerationRef.current + 1;
    selectionGenerationRef.current = generation;
    setSelectedId(conversation.id);
    selectedIdRef.current = conversation.id;
    clearSelectedMessages();
    setHistoryLoading(true);
    setOlderLoading(false);
    setNewerLoading(false);
    setHasOlder(false);
    updateHasNewer(false);
    setError(null);
    try {
      const loaded = await getMessages({ id: conversation.id, limit: 50 }).unwrap();
      if (selectedIdRef.current !== conversation.id || selectionGenerationRef.current !== generation) return;
      messagesRef.current = loaded;
      setMessages(loaded);
      recoveredThroughRef.current.set(conversation.id, loaded.at(-1)?.sequence ?? 0);
      setHasOlder(loaded.length === 50);
      updateHasNewer(false);
      if (socketRef.current?.connected) setConnection('online');
      const latestSequence = loaded.at(-1)?.sequence;
      if (latestSequence !== undefined) markConversationRead(conversation.id, latestSequence);
    } catch (requestError) {
      if (selectedIdRef.current === conversation.id && selectionGenerationRef.current === generation) {
        setError(apiErrorMessage(requestError));
      }
    } finally {
      if (selectedIdRef.current === conversation.id && selectionGenerationRef.current === generation) {
        setHistoryLoading(false);
      }
    }
  }, [clearSelectedMessages, getMessages, markConversationRead, updateHasNewer]);

  const loadOlder = useCallback(async () => {
    const conversationId = selectedIdRef.current;
    const generation = selectionGenerationRef.current;
    const firstMessage = messagesRef.current[0];
    if (!conversationId || !firstMessage) return;
    setOlderLoading(true);
    try {
      const older = await getMessages({ id: conversationId, before: firstMessage.sequence, limit: 50 }).unwrap();
      if (selectedIdRef.current !== conversationId || selectionGenerationRef.current !== generation) return;
      updateMessages((current) => (
        selectedIdRef.current === conversationId && selectionGenerationRef.current === generation
          ? (() => {
              const window = limitMessageWindow(mergeMessages(older, current), 'oldest');
              if (window.trimmed) updateHasNewer(true);
              return window.messages;
            })()
          : current
      ));
      setHasOlder(older.length === 50);
    } catch (requestError) {
      if (selectedIdRef.current === conversationId && selectionGenerationRef.current === generation) {
        setError(apiErrorMessage(requestError));
      }
    } finally {
      if (selectedIdRef.current === conversationId && selectionGenerationRef.current === generation) {
        setOlderLoading(false);
      }
    }
  }, [getMessages, updateHasNewer, updateMessages]);

  const loadNewer = useCallback(async () => {
    const conversationId = selectedIdRef.current;
    const generation = selectionGenerationRef.current;
    const lastMessage = messagesRef.current.at(-1);
    if (!conversationId || !lastMessage) return;
    setNewerLoading(true);
    try {
      const newer = await getMessages({ id: conversationId, after: lastMessage.sequence, limit: 50 }).unwrap();
      if (selectedIdRef.current !== conversationId || selectionGenerationRef.current !== generation) return;
      updateMessages((current) => {
        if (selectedIdRef.current !== conversationId || selectionGenerationRef.current !== generation) return current;
        const window = limitMessageWindow(mergeMessages(current, newer), 'newest');
        if (window.trimmed) setHasOlder(true);
        return window.messages;
      });
      updateHasNewer(newer.length === 50);
      const latestSequence = newer.at(-1)?.sequence;
      if (latestSequence !== undefined) markConversationRead(conversationId, latestSequence);
    } catch (requestError) {
      if (selectedIdRef.current === conversationId && selectionGenerationRef.current === generation) {
        setError(apiErrorMessage(requestError));
      }
    } finally {
      if (selectedIdRef.current === conversationId && selectionGenerationRef.current === generation) {
        setNewerLoading(false);
      }
    }
  }, [getMessages, markConversationRead, updateHasNewer, updateMessages]);

  const ensureMessage = useCallback(async (messageId: string, sequence: number) => {
    const conversationId = selectedIdRef.current;
    const generation = selectionGenerationRef.current;
    if (!conversationId || messagesRef.current.some(({ id }) => id === messageId)) return;

    try {
      const [before, after] = await Promise.all([
        getMessages({ id: conversationId, before: sequence + 1, limit: 25 }).unwrap(),
        getMessages({ id: conversationId, after: sequence, limit: 25 }).unwrap(),
      ]);
      if (selectedIdRef.current !== conversationId || selectionGenerationRef.current !== generation) return;
      const context = mergeMessages(before, after);
      if (!context.some(({ id }) => id === messageId)) {
        setError('Не удалось загрузить выбранное сообщение');
        return;
      }
      updateMessages(() => context);
      setHasOlder(before.length === 25);
      updateHasNewer(after.length === 25);
    } catch (requestError) {
      if (selectedIdRef.current === conversationId && selectionGenerationRef.current === generation) {
        setError(apiErrorMessage(requestError));
      }
    }
  }, [getMessages, updateHasNewer, updateMessages]);

  const searchConversationMessages = useCallback(async (query: string) => {
    const conversationId = selectedIdRef.current;
    const generation = selectionGenerationRef.current;
    if (!conversationId || !query.trim()) return [];
    try {
      const results = await searchMessagesRequest({ id: conversationId, query: query.trim(), limit: 50 }).unwrap();
      return selectedIdRef.current === conversationId && selectionGenerationRef.current === generation ? results : [];
    } catch (requestError) {
      if (selectedIdRef.current === conversationId && selectionGenerationRef.current === generation) {
        setError(apiErrorMessage(requestError));
      }
      return [];
    }
  }, [searchMessagesRequest]);

  const sendMessage = useCallback(async (body: string, replyTo?: Message) => {
    if (!selectedId) return;
    const command: OutboxCommand = {
      userId: currentUser.id,
      clientMessageId: crypto.randomUUID(),
      conversationId: selectedId,
      body,
      ...(replyTo ? {
        replyToMessageId: replyTo.id,
        replyTo: { id: replyTo.id, sequence: replyTo.sequence, senderDisplayName: replyTo.senderDisplayName, body: replyTo.body },
      } : {}),
      createdAt: new Date().toISOString(),
    };
    try {
      await saveOutboxCommand(command);
      setPending((current) => [...current, {
        ...command,
        senderId: currentUser.id,
        senderDisplayName: currentUser.displayName,
        replyTo: command.replyTo ?? null,
        forwardedFrom: null,
        status: 'sending',
      }]);
      void enqueueCommand(command);
    } catch {
      setError('Не удалось сохранить сообщение в локальную очередь');
    }
  }, [currentUser, enqueueCommand, selectedId]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const conversationId = selectedIdRef.current;
    if (!conversationId) return;
    try {
      const updated = await toggleReactionRequest({ messageId, emoji, conversationId }).unwrap();
      if (selectedIdRef.current === conversationId) {
        updateMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
      }
    } catch (requestError) {
      setError(apiErrorMessage(requestError));
    }
  }, [toggleReactionRequest, updateMessages]);

  const forwardMessage = useCallback(async (conversationId: string, source: Message) => {
    const command: OutboxCommand = {
      userId: currentUser.id,
      clientMessageId: crypto.randomUUID(),
      conversationId,
      body: source.body,
      forwardedFromMessageId: source.id,
      forwardedFrom: {
        id: source.id,
        senderDisplayName: source.senderDisplayName,
        body: source.body,
      },
      createdAt: new Date().toISOString(),
    };
    await saveOutboxCommand(command);
    setPending((current) => [...current, {
      ...command,
      senderId: currentUser.id,
      senderDisplayName: currentUser.displayName,
      replyTo: null,
      forwardedFrom: command.forwardedFrom ?? null,
      status: 'sending',
    }]);
    void enqueueCommand(command);
  }, [currentUser, enqueueCommand]);

  const togglePin = useCallback(async (messageId: string) => {
    const conversationId = selectedIdRef.current;
    if (!conversationId) return;
    try {
      const updated = await togglePinRequest({ messageId, conversationId }).unwrap();
      if (selectedIdRef.current === conversationId) {
        updateMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
      }
    } catch (requestError) {
      setError(apiErrorMessage(requestError));
    }
  }, [togglePinRequest, updateMessages]);

  const retryMessage = useCallback(async (clientMessageId: string) => {
    const command = (await listOutboxCommands(currentUser.id)).find((item) => item.clientMessageId === clientMessageId);
    if (command) {
      const retryCommand = { ...command, blocked: false };
      await saveOutboxCommand(retryCommand);
      await enqueueCommand(retryCommand);
    }
  }, [currentUser.id, enqueueCommand]);

  const openCreatedConversation = useCallback((conversation: Conversation) => {
    dispatch(messengerApi.util.invalidateTags([{ type: 'ConversationList', id: 'LIST' }]));
    void selectConversation(conversation);
  }, [dispatch, selectConversation]);

  const closeConversation = useCallback(() => {
    selectionGenerationRef.current += 1;
    synchronizationRunRef.current = null;
    if (socketRef.current?.connected) setConnection('online');
    setSelectedId(null);
    selectedIdRef.current = null;
    clearSelectedMessages();
    setHistoryLoading(false);
    setOlderLoading(false);
    setNewerLoading(false);
    setHasOlder(false);
    updateHasNewer(false);
  }, [clearSelectedMessages, updateHasNewer]);

  return {
    users,
    conversations,
    selectedConversation,
    selectedId,
    messages,
    pending: pending.filter(({ conversationId }) => conversationId === selectedId),
    connection,
    onlineUserIds,
    socket: realtimeSocket,
    error,
    usersLoading,
    conversationsLoading,
    historyLoading,
    olderLoading,
    newerLoading,
    hasOlder,
    hasNewer,
    setError,
    retrySynchronization,
    selectConversation,
    loadOlder,
    loadNewer,
    ensureMessage,
    searchConversationMessages,
    sendMessage,
    toggleReaction,
    forwardMessage,
    togglePin,
    retryMessage,
    openCreatedConversation,
    closeConversation,
  };
}
