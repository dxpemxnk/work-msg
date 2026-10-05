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
import { mergeMessages } from '@utils/messages';

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
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realtimeSocket, setRealtimeSocket] = useState<Socket | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const messagesRef = useRef<Message[]>([]);

  const selectedConversation = useMemo(
    () => conversations.find(({ id }) => id === selectedId) ?? null,
    [conversations, selectedId]
  );

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const completeMessage = useCallback(async (message: Message) => {
    setMessages((current) => mergeMessages(current, [message]));
    setPending((current) => current.filter(({ clientMessageId }) => clientMessageId !== message.clientMessageId));
    await removeOutboxCommand(message.clientMessageId);
    void refetchConversations();
  }, [refetchConversations]);

  const sendCommand = useCallback((command: OutboxCommand) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      setPending((current) => current.map((item) => item.clientMessageId === command.clientMessageId ? { ...item, status: 'failed' } : item));
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
      },
      (timeoutError: Error | null, result?: MessageAck) => {
        if (timeoutError || !result?.ok) {
          setPending((current) => current.map((item) => item.clientMessageId === command.clientMessageId ? { ...item, status: 'failed' } : item));
          if (result && !result.ok) setError(result.error.message);
          return;
        }
        void completeMessage(result.message).catch(() => setError('Сообщение сохранено, но локальный outbox не очистился'));
      }
    );
  }, [completeMessage]);

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

  const recoverSelected = useCallback(async () => {
    const conversationId = selectedIdRef.current;
    if (!conversationId) return;
    const lastSequence = messagesRef.current.at(-1)?.sequence ?? 0;
    try {
      const recovered = await getMessages({ id: conversationId, after: lastSequence, limit: 100 }).unwrap();
      setMessages((current) => mergeMessages(current, recovered));
      const latestSequence = recovered.at(-1)?.sequence ?? lastSequence;
      if (latestSequence > 0) markConversationRead(conversationId, latestSequence);
    } catch (requestError) {
      setError(apiErrorMessage(requestError));
    }
  }, [getMessages, markConversationRead]);

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
          forwardedFrom: null,
          createdAt: command.createdAt,
          status: 'failed',
        })));
      })
      .catch(() => setError('Не удалось прочитать очередь неотправленных сообщений'));
    return () => { active = false; };
  }, [currentUser]);

  useEffect(() => {
    const socket = createMessengerSocket();
    socketRef.current = socket;
    setRealtimeSocket(socket);
    setConnection('connecting');

    socket.on('connect', () => {
      setConnection('synchronizing');
      void recoverSelected().finally(() => setConnection('online'));
      void listOutboxCommands(currentUser.id).then((commands) => commands.forEach(sendCommand));
      void refetchConversations();
    });
    socket.on('disconnect', () => {
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
      if (message.conversationId === selectedIdRef.current) {
        void completeMessage(message);
        if (message.senderId !== currentUser.id) {
          markConversationRead(message.conversationId, message.sequence);
        }
      } else {
        void removeOutboxCommand(message.clientMessageId);
      }
      void refetchConversations();
    });
    socket.on('message:updated', (message: Message) => {
      if (message.conversationId === selectedIdRef.current) {
        setMessages((current) => current.map((item) => item.id === message.id ? message : item));
      }
      dispatch(messengerApi.util.invalidateTags([{ type: 'Message', id: message.conversationId }]));
    });
    socket.on('conversation:updated', () => { void refetchConversations(); });
    socket.on('membership:updated', ({ conversationId, active: membershipActive }: { conversationId: string; active: boolean }) => {
      if (!membershipActive && selectedIdRef.current === conversationId) {
        setSelectedId(null);
        setMessages([]);
      }
      void refetchConversations();
    });
    socket.on('read:updated', () => { void refetchConversations(); });
    socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setRealtimeSocket(null);
    };
  }, [completeMessage, currentUser.id, dispatch, markConversationRead, recoverSelected, refetchConversations, sendCommand]);

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
    setSelectedId(conversation.id);
    selectedIdRef.current = conversation.id;
    setHistoryLoading(true);
    setError(null);
    try {
      const loaded = await getMessages({ id: conversation.id, limit: 50 }).unwrap();
      setMessages(loaded);
      setHasOlder(loaded.length === 50);
      const latestSequence = loaded.at(-1)?.sequence;
      if (latestSequence !== undefined) markConversationRead(conversation.id, latestSequence);
    } catch (requestError) {
      setError(apiErrorMessage(requestError));
    } finally {
      setHistoryLoading(false);
    }
  }, [getMessages, markConversationRead]);

  const loadOlder = useCallback(async () => {
    const firstMessage = messages[0];
    if (!selectedId || !firstMessage) return;
    setOlderLoading(true);
    try {
      const older = await getMessages({ id: selectedId, before: firstMessage.sequence, limit: 50 }).unwrap();
      setMessages((current) => mergeMessages(older, current));
      setHasOlder(older.length === 50);
    } catch (requestError) {
      setError(apiErrorMessage(requestError));
    } finally {
      setOlderLoading(false);
    }
  }, [getMessages, messages, selectedId]);

  const ensureMessage = useCallback(async (messageId: string, sequence: number) => {
    const conversationId = selectedIdRef.current;
    if (!conversationId || messagesRef.current.some(({ id }) => id === messageId)) return;

    try {
      const context = await getMessages({ id: conversationId, before: sequence + 1, limit: 50 }).unwrap();
      setMessages((current) => mergeMessages(context, current));
      setHasOlder(context.length === 50);
    } catch (requestError) {
      setError(apiErrorMessage(requestError));
    }
  }, [getMessages]);

  const searchConversationMessages = useCallback(async (query: string) => {
    const conversationId = selectedIdRef.current;
    if (!conversationId || !query.trim()) return [];
    try {
      return await searchMessagesRequest({ id: conversationId, query: query.trim(), limit: 50 }).unwrap();
    } catch (requestError) {
      setError(apiErrorMessage(requestError));
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
      sendCommand(command);
    } catch {
      setError('Не удалось сохранить сообщение в локальную очередь');
    }
  }, [currentUser, selectedId, sendCommand]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!selectedId) return;
    try {
      const updated = await toggleReactionRequest({ messageId, emoji, conversationId: selectedId }).unwrap();
      setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
    } catch (requestError) {
      setError(apiErrorMessage(requestError));
    }
  }, [selectedId, toggleReactionRequest]);

  const togglePin = useCallback(async (messageId: string) => {
    if (!selectedId) return;
    try {
      const updated = await togglePinRequest({ messageId, conversationId: selectedId }).unwrap();
      setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
    } catch (requestError) {
      setError(apiErrorMessage(requestError));
    }
  }, [selectedId, togglePinRequest]);

  const retryMessage = useCallback(async (clientMessageId: string) => {
    const command = (await listOutboxCommands(currentUser.id)).find((item) => item.clientMessageId === clientMessageId);
    if (command) sendCommand(command);
  }, [currentUser.id, sendCommand]);

  const openCreatedConversation = useCallback((conversation: Conversation) => {
    dispatch(messengerApi.util.invalidateTags([{ type: 'ConversationList', id: 'LIST' }]));
    void selectConversation(conversation);
  }, [dispatch, selectConversation]);

  const closeConversation = useCallback(() => {
    setSelectedId(null);
    selectedIdRef.current = null;
    setMessages([]);
  }, []);

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
    hasOlder,
    setError,
    selectConversation,
    loadOlder,
    ensureMessage,
    searchConversationMessages,
    sendMessage,
    toggleReaction,
    togglePin,
    retryMessage,
    openCreatedConversation,
    closeConversation,
  };
}
